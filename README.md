# Notion Bridge

A lightweight MCP server that allows authorised team members to interact with a shared Notion workspace through their own Claude accounts.

Notion Bridge acts as a proxy: it uses a shared Notion integration token and an OAuth-based authentication layer so that workspace guests (who can't use Notion's native MCP connector) can still search, read, and update approved Notion pages via Claude.

## Architecture

```
Claude.ai  -->  Notion Bridge  -->  Notion API
(user's        (MCP Server +       (shared
 account)       OAuth + Admin)      integration)
```

**Components:**
- **MCP Server** - HTTP+SSE transport, exposes tools for searching/reading/writing Notion pages
- **OAuth Provider** - Issues tokens to Claude so it can call the MCP server on the user's behalf
- **Admin Panel** - Web UI for managing users and approved Notion pages
- **SQLite Database** - Stores users, approved pages, OAuth tokens, audit log

## Quick Start

### Prerequisites

- Node.js 20+
- A Notion internal integration token ([create one here](https://www.notion.so/profile/integrations))

### Local Development

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your values (see Setup Guide below)

# Build
npm run build

# Create the first admin user
npm run seed -- admin@example.com "Admin Name" yourpassword

# Start in development mode (auto-reload)
npm run dev

# Or start in production mode
npm start
```

### Server Deployment

```bash
# On your server (as root)
sudo bash deploy/setup.sh

# Edit the environment file
sudo nano /etc/notion-bridge/.env

# Start the service
sudo systemctl start notion-bridge
```

See `deploy/` for nginx, systemd, and PM2 configuration files.

## MCP Tools

| Tool | Description |
|------|-------------|
| `search` | Search across approved Notion pages |
| `read_page` | Fetch page content as markdown |
| `read_database` | Query a Notion database with optional filters |
| `update_page` | Update page properties or append content |
| `create_page` | Create a new page in an approved parent |
| `add_comment` | Add a comment to a Notion page |

All write operations are attributed via Notion comments (e.g. "Updated by Jane via Claude on 2026-02-15").

## Admin Panel

Access at `/admin` (admin role required).

- **Dashboard** - Overview stats and recent activity
- **Users** - Add/disable/delete team members
- **Approved Pages** - Add Notion URLs, set read-only or read-write access
- **Audit Log** - Filterable log of all MCP tool calls

## Security

- OAuth access tokens expire after 1 hour; refresh tokens after 30 days
- All tokens stored hashed (SHA-256) in the database
- Disabling a user immediately invalidates all their tokens
- Per-user rate limiting (configurable, default 30 req/min)
- Approved pages list is the primary access boundary; child pages inherit access
- Write operations leave attribution comments in Notion
- Full audit trail of all MCP actions

## Project Structure

```
src/
  config.ts          # Environment configuration
  index.ts           # Main Express application
  db/                # Database layer (SQLite)
    schema.ts        # Table definitions
    users.ts         # User CRUD
    approved-pages.ts # Approved pages CRUD
    oauth.ts         # OAuth token management
    audit.ts         # Audit log
  notion/            # Notion API integration
    client.ts        # Notion SDK wrapper
    access.ts        # Page access validation
    blocks-to-markdown.ts # Block content converter
  mcp/               # MCP server
    server.ts        # Transport and session management
    tools.ts         # Tool definitions
  oauth/             # OAuth provider
    routes.ts        # Authorize + token endpoints
    metadata.ts      # .well-known endpoint
  admin/             # Admin panel
    routes.ts        # Admin page routes
    middleware.ts    # Auth middleware
    views/           # HTML templates
  middleware/        # Express middleware
  utils/             # Shared utilities
scripts/
  seed-admin.ts     # CLI: create first admin user
  migrate.ts        # CLI: run database migrations
deploy/
  nginx.conf        # nginx reverse proxy config
  notion-bridge.service # systemd service
  setup.sh          # Server setup script
```

## License

MIT - Yalla Cooperative
