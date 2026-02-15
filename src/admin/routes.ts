import { Router, Request, Response } from "express";
import { requireAdmin } from "./middleware.js";
import { layout, escapeHtml } from "./views/layout.js";
import {
  listUsers,
  getUserByEmail,
  getUserById,
  createUser,
  updateUserStatus,
  updateUserRole,
  deleteUser,
} from "../db/users.js";
import {
  listApprovedPages,
  addApprovedPage,
  removeApprovedPage,
  updatePageAccessLevel,
} from "../db/approved-pages.js";
import { revokeUserTokens } from "../db/oauth.js";
import { queryAuditLog } from "../db/audit.js";
import { verifyPassword } from "../db/users.js";
import { extractNotionId } from "../utils/notion-url.js";
import { getPage, extractPageTitle, getDatabase } from "../notion/client.js";
import { formatNotionId } from "../utils/notion-url.js";

export const adminRouter = Router();

// --- Login ---

adminRouter.get("/login", (_req: Request, res: Response) => {
  res.send(
    layout(
      "Sign In",
      `
    <div style="max-width:400px;margin:40px auto;">
      <div class="card">
        <h1 style="text-align:center">Admin Sign In</h1>
        <form method="POST" action="/admin/login">
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required autofocus />
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required />
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%">Sign In</button>
        </form>
      </div>
    </div>`,
      false
    )
  );
});

adminRouter.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = getUserByEmail(email);

  if (!user || user.status !== "active" || user.role !== "admin") {
    res.send(
      layout(
        "Sign In",
        `
      <div style="max-width:400px;margin:40px auto;">
        <div class="card">
          <h1 style="text-align:center">Admin Sign In</h1>
          <div class="alert alert-error">Invalid credentials or not an admin account.</div>
          <form method="POST" action="/admin/login">
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" name="email" value="${escapeHtml(email || "")}" required autofocus />
            </div>
            <div class="form-group">
              <label for="password">Password</label>
              <input type="password" id="password" name="password" required />
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%">Sign In</button>
          </form>
        </div>
      </div>`,
        false
      )
    );
    return;
  }

  const valid = await verifyPassword(user, password);
  if (!valid) {
    res.send(
      layout(
        "Sign In",
        `
      <div style="max-width:400px;margin:40px auto;">
        <div class="card">
          <h1 style="text-align:center">Admin Sign In</h1>
          <div class="alert alert-error">Invalid credentials.</div>
          <form method="POST" action="/admin/login">
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" name="email" value="${escapeHtml(email || "")}" required autofocus />
            </div>
            <div class="form-group">
              <label for="password">Password</label>
              <input type="password" id="password" name="password" required />
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%">Sign In</button>
          </form>
        </div>
      </div>`,
        false
      )
    );
    return;
  }

  req.session.userId = user.id;
  req.session.userRole = user.role;
  res.redirect("/admin");
});

adminRouter.get("/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

// --- Dashboard ---

adminRouter.get("/", requireAdmin, (_req: Request, res: Response) => {
  const users = listUsers();
  const pages = listApprovedPages();
  const { entries: recentAudit } = queryAuditLog({ limit: 10 });
  const activeUsers = users.filter((u) => u.status === "active").length;

  const auditRows = recentAudit
    .map(
      (e) => `
    <tr>
      <td>${escapeHtml(e.user_name)}</td>
      <td>${escapeHtml(e.action)}</td>
      <td class="text-muted">${escapeHtml(e.notion_page_id ?? "-")}</td>
      <td class="text-muted">${new Date(e.timestamp).toLocaleString()}</td>
    </tr>`
    )
    .join("");

  res.send(
    layout(
      "Dashboard",
      `
    <h1>Dashboard</h1>
    <div class="stats">
      <div class="stat-card">
        <div class="number">${activeUsers}</div>
        <div class="label">Active Users</div>
      </div>
      <div class="stat-card">
        <div class="number">${users.length}</div>
        <div class="label">Total Users</div>
      </div>
      <div class="stat-card">
        <div class="number">${pages.length}</div>
        <div class="label">Approved Pages</div>
      </div>
    </div>

    <div class="card">
      <h2>Recent Activity</h2>
      ${recentAudit.length === 0 ? '<p class="empty-state">No activity yet.</p>' : `
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Action</th>
            <th>Page ID</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>${auditRows}</tbody>
      </table>`}
    </div>`
    )
  );
});

// --- Users ---

adminRouter.get("/users", requireAdmin, (_req: Request, res: Response) => {
  const users = listUsers();
  const message = (_req.query.msg as string) ?? "";

  const userRows = users
    .map(
      (u) => `
    <tr>
      <td><strong>${escapeHtml(u.name)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td><span class="badge badge-${u.status}">${u.status}</span></td>
      <td class="text-muted">${new Date(u.created_at).toLocaleDateString()}</td>
      <td>
        <div class="actions">
          ${u.status === "active"
            ? `<form class="inline" method="POST" action="/admin/users/${u.id}/disable">
                 <button type="submit" class="btn btn-secondary btn-small">Disable</button>
               </form>`
            : `<form class="inline" method="POST" action="/admin/users/${u.id}/enable">
                 <button type="submit" class="btn btn-secondary btn-small">Enable</button>
               </form>`
          }
          <form class="inline" method="POST" action="/admin/users/${u.id}/delete"
                onsubmit="return confirm('Are you sure you want to delete this user?')">
            <button type="submit" class="btn btn-danger btn-small">Delete</button>
          </form>
        </div>
      </td>
    </tr>`
    )
    .join("");

  res.send(
    layout(
      "Users",
      `
    <h1>Users</h1>
    ${message ? `<div class="alert alert-success">${escapeHtml(message)}</div>` : ""}

    <div class="card mb-16">
      <h2>Add User</h2>
      <form method="POST" action="/admin/users/add" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" required />
        </div>
        <div class="form-group">
          <label for="name">Name</label>
          <input type="text" id="name" name="name" required />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required minlength="8" />
        </div>
        <div class="form-group">
          <label for="role">Role</label>
          <select id="role" name="role">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div style="grid-column:1/-1;">
          <button type="submit" class="btn btn-primary">Add User</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>All Users</h2>
      ${users.length === 0 ? '<p class="empty-state">No users yet.</p>' : `
      <table>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>${userRows}</tbody>
      </table>`}
    </div>`
    )
  );
});

adminRouter.post("/users/add", requireAdmin, async (req: Request, res: Response) => {
  const { email, name, password, role } = req.body;

  const existing = getUserByEmail(email);
  if (existing) {
    res.redirect("/admin/users?msg=User+with+that+email+already+exists");
    return;
  }

  await createUser({
    email,
    name,
    password,
    role: role === "admin" ? "admin" : "member",
    invited_by: req.session.userId,
  });

  res.redirect("/admin/users?msg=User+added+successfully");
});

adminRouter.post("/users/:id/disable", requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  updateUserStatus(id, "disabled");
  revokeUserTokens(id);
  res.redirect("/admin/users?msg=User+disabled");
});

adminRouter.post("/users/:id/enable", requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  updateUserStatus(id, "active");
  res.redirect("/admin/users?msg=User+enabled");
});

adminRouter.post("/users/:id/delete", requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  // Prevent deleting yourself
  if (id === req.session.userId) {
    res.redirect("/admin/users?msg=Cannot+delete+your+own+account");
    return;
  }
  deleteUser(id);
  res.redirect("/admin/users?msg=User+deleted");
});

// --- Approved Pages ---

adminRouter.get("/pages", requireAdmin, (_req: Request, res: Response) => {
  const pages = listApprovedPages();
  const message = (_req.query.msg as string) ?? "";

  const pageRows = pages
    .map(
      (p) => `
    <tr>
      <td><strong>${escapeHtml(p.title)}</strong></td>
      <td class="text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        <a href="${escapeHtml(p.notion_url)}" target="_blank" rel="noopener">${escapeHtml(p.notion_url)}</a>
      </td>
      <td>
        <span class="badge badge-${p.access_level === "read-write" ? "rw" : "ro"}">
          ${p.access_level}
        </span>
      </td>
      <td class="text-muted">${new Date(p.added_at).toLocaleDateString()}</td>
      <td>
        <div class="actions">
          ${p.access_level === "read-write"
            ? `<form class="inline" method="POST" action="/admin/pages/${p.id}/access">
                 <input type="hidden" name="access_level" value="read-only" />
                 <button type="submit" class="btn btn-secondary btn-small">Make Read-Only</button>
               </form>`
            : `<form class="inline" method="POST" action="/admin/pages/${p.id}/access">
                 <input type="hidden" name="access_level" value="read-write" />
                 <button type="submit" class="btn btn-secondary btn-small">Make Read-Write</button>
               </form>`
          }
          <form class="inline" method="POST" action="/admin/pages/${p.id}/delete"
                onsubmit="return confirm('Remove this page from the approved list?')">
            <button type="submit" class="btn btn-danger btn-small">Remove</button>
          </form>
        </div>
      </td>
    </tr>`
    )
    .join("");

  res.send(
    layout(
      "Approved Pages",
      `
    <h1>Approved Pages</h1>
    ${message ? `<div class="alert alert-success">${escapeHtml(message)}</div>` : ""}

    <div class="card mb-16">
      <h2>Add Page</h2>
      <p class="text-muted mb-16">Paste a Notion page or database URL. The title will be fetched from Notion automatically.</p>
      <form method="POST" action="/admin/pages/add" style="display:grid;grid-template-columns:2fr 1fr auto;gap:16px;align-items:end;">
        <div class="form-group">
          <label for="notion_url">Notion URL</label>
          <input type="url" id="notion_url" name="notion_url" placeholder="https://www.notion.so/workspace/..." required />
        </div>
        <div class="form-group">
          <label for="access_level">Access Level</label>
          <select id="access_level" name="access_level">
            <option value="read-write">Read-Write</option>
            <option value="read-only">Read-Only</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary" style="height:42px;">Add Page</button>
      </form>
    </div>

    <div class="card">
      <h2>All Approved Pages</h2>
      ${pages.length === 0 ? '<p class="empty-state">No approved pages yet. Add a Notion page URL above.</p>' : `
      <table>
        <thead>
          <tr><th>Title</th><th>URL</th><th>Access</th><th>Added</th><th>Actions</th></tr>
        </thead>
        <tbody>${pageRows}</tbody>
      </table>`}
    </div>`
    )
  );
});

adminRouter.post("/pages/add", requireAdmin, async (req: Request, res: Response) => {
  const { notion_url, access_level } = req.body;

  const notionId = extractNotionId(notion_url);
  if (!notionId) {
    res.redirect("/admin/pages?msg=Could+not+extract+a+valid+Notion+ID+from+that+URL");
    return;
  }

  // Try fetching the title from Notion
  let title = "Untitled";
  const formattedId = formatNotionId(notionId);

  try {
    const page = await getPage(formattedId);
    title = extractPageTitle(page);
  } catch {
    // Might be a database
    try {
      const db = await getDatabase(formattedId);
      title = db.title?.[0]?.plain_text ?? "Untitled Database";
    } catch {
      res.redirect(
        "/admin/pages?msg=Could+not+fetch+page+from+Notion.+Make+sure+the+integration+is+connected+to+this+page."
      );
      return;
    }
  }

  addApprovedPage({
    notion_page_id: notionId,
    notion_url,
    title,
    access_level: access_level === "read-only" ? "read-only" : "read-write",
    added_by: req.session.userId!,
  });

  res.redirect(`/admin/pages?msg=Page+"${encodeURIComponent(title)}"+added+successfully`);
});

adminRouter.post("/pages/:id/access", requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { access_level } = req.body;
  updatePageAccessLevel(
    id,
    access_level === "read-only" ? "read-only" : "read-write"
  );
  res.redirect("/admin/pages?msg=Access+level+updated");
});

adminRouter.post("/pages/:id/delete", requireAdmin, (req: Request, res: Response) => {
  const id = req.params.id as string;
  removeApprovedPage(id);
  res.redirect("/admin/pages?msg=Page+removed");
});

// --- Audit Log ---

adminRouter.get("/audit", requireAdmin, (req: Request, res: Response) => {
  const userId = (req.query.user_id as string) || undefined;
  const action = (req.query.action as string) || undefined;
  const page = parseInt((req.query.page as string) || "1", 10);
  const limit = 50;
  const offset = (page - 1) * limit;

  const { entries, total } = queryAuditLog({ userId, action, limit, offset });
  const users = listUsers();
  const totalPages = Math.ceil(total / limit);

  const auditRows = entries
    .map(
      (e) => `
    <tr>
      <td>${escapeHtml(e.user_name)}</td>
      <td><span class="badge">${escapeHtml(e.action)}</span></td>
      <td class="text-muted">${escapeHtml(e.notion_page_id ?? "-")}</td>
      <td class="text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${e.detail ? escapeHtml(e.detail) : "-"}
      </td>
      <td class="text-muted">${new Date(e.timestamp).toLocaleString()}</td>
    </tr>`
    )
    .join("");

  const userOptions = users
    .map(
      (u) =>
        `<option value="${u.id}" ${u.id === userId ? "selected" : ""}>${escapeHtml(u.name)}</option>`
    )
    .join("");

  const actionOptions = ["search", "read_page", "read_database", "update_page", "create_page", "add_comment"]
    .map(
      (a) => `<option value="${a}" ${a === action ? "selected" : ""}>${a}</option>`
    )
    .join("");

  let pagination = "";
  if (totalPages > 1) {
    const pageLinks: string[] = [];
    for (let i = 1; i <= totalPages; i++) {
      const params = new URLSearchParams();
      if (userId) params.set("user_id", userId);
      if (action) params.set("action", action);
      params.set("page", i.toString());
      pageLinks.push(
        i === page
          ? `<strong>${i}</strong>`
          : `<a href="/admin/audit?${params.toString()}">${i}</a>`
      );
    }
    pagination = `<div style="margin-top:16px;text-align:center;">${pageLinks.join(" ")}</div>`;
  }

  res.send(
    layout(
      "Audit Log",
      `
    <h1>Audit Log</h1>

    <div class="card mb-16">
      <form method="GET" action="/admin/audit" style="display:flex;gap:16px;align-items:end;flex-wrap:wrap;">
        <div class="form-group" style="flex:1;min-width:150px;">
          <label for="user_id">User</label>
          <select id="user_id" name="user_id">
            <option value="">All users</option>
            ${userOptions}
          </select>
        </div>
        <div class="form-group" style="flex:1;min-width:150px;">
          <label for="action">Action</label>
          <select id="action" name="action">
            <option value="">All actions</option>
            ${actionOptions}
          </select>
        </div>
        <button type="submit" class="btn btn-primary" style="height:42px;">Filter</button>
        <a href="/admin/audit" class="btn btn-secondary" style="height:42px;line-height:26px;">Reset</a>
      </form>
    </div>

    <div class="card">
      <p class="text-muted mb-16">${total} entries total</p>
      ${entries.length === 0 ? '<p class="empty-state">No audit entries found.</p>' : `
      <table>
        <thead>
          <tr><th>User</th><th>Action</th><th>Page ID</th><th>Details</th><th>Time</th></tr>
        </thead>
        <tbody>${auditRows}</tbody>
      </table>
      ${pagination}`}
    </div>`
    )
  );
});
