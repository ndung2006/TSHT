// Dev-only: set real scrypt passwords for the 4 seed accounts.
// Passwords come from env vars (never from a file or chat transcript):
//   DEV_ADMIN_PASSWORD, DEV_PUBLISHER_PASSWORD, DEV_REVIEWER_PASSWORD, DEV_READER_PASSWORD
// Run: env DEV_*_PASSWORD=... node tools/set-dev-passwords.mjs
// NEVER run on the internal/production server; create accounts via CMS there.
import { hashPassword } from "../lib/auth.mjs";
import { pool } from "../lib/db.mjs";
const map = { admin: "DEV_ADMIN_PASSWORD", "nguoi-dang": "DEV_PUBLISHER_PASSWORD", "nguoi-duyet": "DEV_REVIEWER_PASSWORD", "nguoi-doc": "DEV_READER_PASSWORD" };
for (const [username, envName] of Object.entries(map)) {
  const pw = process.env[envName];
  if (!pw) { console.error(`thieu ${envName}`); process.exitCode = 1; continue; }
  const r = await pool.query("UPDATE users SET password_hash=$2 WHERE username=$1 RETURNING id", [username, hashPassword(pw)]);
  console.log(username, r.rows.length ? "password updated" : "USER NOT FOUND");
}
await pool.end();
