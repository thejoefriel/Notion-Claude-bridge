import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";
import { getDb } from "./index.js";

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "member";
  status: "active" | "disabled";
  created_at: string;
  invited_by: string | null;
}

export type UserCreate = {
  email: string;
  name: string;
  password: string;
  role: "admin" | "member";
  invited_by?: string;
};

const SALT_ROUNDS = 12;

export async function createUser(data: UserCreate): Promise<User> {
  const db = getDb();
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  db.prepare(
    `INSERT INTO users (id, email, name, password_hash, role, invited_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, data.email.toLowerCase(), data.name, passwordHash, data.role, data.invited_by ?? null);

  return getUserById(id)!;
}

export function getUserById(id: string): User | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByEmail(email: string): User | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase()) as
    | User
    | undefined;
}

export function listUsers(): User[] {
  const db = getDb();
  return db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as User[];
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

export function updateUserStatus(id: string, status: "active" | "disabled"): void {
  const db = getDb();
  db.prepare("UPDATE users SET status = ? WHERE id = ?").run(status, id);
}

export function updateUserRole(id: string, role: "admin" | "member"): void {
  const db = getDb();
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
}

export function deleteUser(id: string): void {
  const db = getDb();
  // Revoke all tokens first
  db.prepare("UPDATE oauth_tokens SET revoked = 1 WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

export async function updateUserPassword(id: string, newPassword: string): Promise<void> {
  const db = getDb();
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
}
