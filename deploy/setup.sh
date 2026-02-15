#!/bin/bash
# Notion Bridge - Server setup script
#
# Run on the Hetzner server as root to set up the application.
# Usage: sudo bash deploy/setup.sh
#
# Prerequisites: Node.js 20+, nginx, certbot

set -euo pipefail

APP_DIR="/opt/notion-bridge"
DATA_DIR="/var/lib/notion-bridge"
ENV_DIR="/etc/notion-bridge"
USER="notion-bridge"

echo "==> Creating system user..."
if ! id "$USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$USER"
fi

echo "==> Creating directories..."
mkdir -p "$APP_DIR" "$DATA_DIR" "$ENV_DIR"
chown "$USER:$USER" "$DATA_DIR"

echo "==> Copying application files..."
rsync -a --exclude=node_modules --exclude=.git --exclude=.env --exclude='*.db' ./ "$APP_DIR/"

echo "==> Installing dependencies..."
cd "$APP_DIR"
npm ci --production

echo "==> Building TypeScript..."
npx tsc

echo "==> Setting up environment file..."
if [ ! -f "$ENV_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$ENV_DIR/.env"
  # Generate a random session secret
  SESSION_SECRET=$(openssl rand -hex 32)
  OAUTH_SECRET=$(openssl rand -hex 32)
  sed -i "s/^SESSION_SECRET=$/SESSION_SECRET=$SESSION_SECRET/" "$ENV_DIR/.env"
  sed -i "s/^OAUTH_CLIENT_SECRET=$/OAUTH_CLIENT_SECRET=$OAUTH_SECRET/" "$ENV_DIR/.env"
  sed -i "s|^DB_PATH=.*|DB_PATH=$DATA_DIR/data.db|" "$ENV_DIR/.env"
  echo ""
  echo "  IMPORTANT: Edit $ENV_DIR/.env and add your NOTION_TOKEN"
  echo "  Then restart the service: sudo systemctl restart notion-bridge"
  echo ""
else
  echo "  Environment file already exists at $ENV_DIR/.env"
fi

echo "==> Installing systemd service..."
cp "$APP_DIR/deploy/notion-bridge.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable notion-bridge

echo "==> Setting up nginx..."
cp "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/notion-bridge
if [ ! -L /etc/nginx/sites-enabled/notion-bridge ]; then
  ln -s /etc/nginx/sites-available/notion-bridge /etc/nginx/sites-enabled/notion-bridge
fi
nginx -t && systemctl reload nginx

echo "==> Setting ownership..."
chown -R "$USER:$USER" "$APP_DIR"
chown -R "$USER:$USER" "$DATA_DIR"

echo ""
echo "==> Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit $ENV_DIR/.env and add your NOTION_TOKEN and BASE_URL"
echo "  2. Run certbot: sudo certbot --nginx -d your-domain.com"
echo "  3. Start the service: sudo systemctl start notion-bridge"
echo "  4. Create the first admin user:"
echo "     cd $APP_DIR && sudo -u $USER node dist/scripts/seed-admin.js email name password"
echo "  5. Check status: sudo systemctl status notion-bridge"
echo "  6. View logs: sudo journalctl -u notion-bridge -f"
