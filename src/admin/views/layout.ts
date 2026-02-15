/**
 * Base HTML layout for admin pages.
 */
export function layout(title: string, content: string, showNav: boolean = true): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Notion Bridge Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #334155;
      line-height: 1.6;
    }
    nav {
      background: #1e293b;
      color: white;
      padding: 0 24px;
      display: flex;
      align-items: center;
      height: 56px;
      gap: 32px;
    }
    nav .brand {
      font-weight: 700;
      font-size: 1.1rem;
      text-decoration: none;
      color: white;
    }
    nav a {
      color: #94a3b8;
      text-decoration: none;
      font-size: 0.9rem;
      transition: color 0.2s;
    }
    nav a:hover, nav a.active { color: white; }
    nav .spacer { flex: 1; }
    nav .logout { color: #f87171; }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      padding: 32px 24px;
    }
    h1 { font-size: 1.5rem; margin-bottom: 24px; color: #0f172a; }
    h2 { font-size: 1.2rem; margin-bottom: 16px; color: #0f172a; }
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      padding: 24px;
      margin-bottom: 24px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      padding: 20px;
      text-align: center;
    }
    .stat-card .number {
      font-size: 2rem;
      font-weight: 700;
      color: #2563eb;
    }
    .stat-card .label {
      font-size: 0.85rem;
      color: #64748b;
      margin-top: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th {
      text-align: left;
      padding: 12px;
      background: #f1f5f9;
      font-weight: 600;
      color: #475569;
      border-bottom: 2px solid #e2e8f0;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    tr:hover td { background: #f8fafc; }
    .badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.8rem;
      font-weight: 500;
    }
    .badge-admin { background: #dbeafe; color: #1d4ed8; }
    .badge-member { background: #f1f5f9; color: #475569; }
    .badge-active { background: #dcfce7; color: #166534; }
    .badge-disabled { background: #fef2f2; color: #dc2626; }
    .badge-rw { background: #dbeafe; color: #1d4ed8; }
    .badge-ro { background: #fef3c7; color: #92400e; }
    .btn {
      display: inline-block;
      padding: 8px 16px;
      border: none;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.2s;
    }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }
    .btn-secondary { background: #e2e8f0; color: #475569; }
    .btn-secondary:hover { background: #cbd5e1; }
    .btn-small { padding: 4px 12px; font-size: 0.8rem; }
    form.inline { display: inline; }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 4px;
      color: #475569;
    }
    .form-group input, .form-group select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 0.95rem;
    }
    .form-group input:focus, .form-group select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    .alert {
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 0.9rem;
    }
    .alert-success { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
    .alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .actions { display: flex; gap: 8px; align-items: center; }
    .text-muted { color: #94a3b8; font-size: 0.85rem; }
    .mb-16 { margin-bottom: 16px; }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  ${showNav ? `
  <nav>
    <a href="/admin" class="brand">Notion Bridge</a>
    <a href="/admin">Dashboard</a>
    <a href="/admin/users">Users</a>
    <a href="/admin/pages">Approved Pages</a>
    <a href="/admin/audit">Audit Log</a>
    <span class="spacer"></span>
    <a href="/admin/logout" class="logout">Sign Out</a>
  </nav>
  ` : ""}
  <div class="container">
    ${content}
  </div>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
