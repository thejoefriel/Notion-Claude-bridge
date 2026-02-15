/**
 * Seed the first admin user.
 * Usage: npx tsx scripts/seed-admin.ts <email> <name> <password>
 *
 * Example:
 *   npx tsx scripts/seed-admin.ts admin@yalla.coop "Admin User" mysecretpassword
 */

import "dotenv/config";
import { getDb, closeDb } from "../src/db/index.js";
import { createUser, getUserByEmail } from "../src/db/users.js";

async function main() {
  const [email, name, password] = process.argv.slice(2);

  if (!email || !name || !password) {
    console.error("Usage: npx tsx scripts/seed-admin.ts <email> <name> <password>");
    process.exit(1);
  }

  // Ensure DB is initialized
  getDb();

  const existing = getUserByEmail(email);
  if (existing) {
    console.error(`User with email ${email} already exists.`);
    process.exit(1);
  }

  const user = await createUser({
    email,
    name,
    password,
    role: "admin",
  });

  console.log(`Admin user created successfully:`);
  console.log(`  ID:    ${user.id}`);
  console.log(`  Email: ${user.email}`);
  console.log(`  Name:  ${user.name}`);
  console.log(`  Role:  ${user.role}`);

  closeDb();
}

main().catch((err) => {
  console.error("Failed to seed admin:", err);
  process.exit(1);
});
