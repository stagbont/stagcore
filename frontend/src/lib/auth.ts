import { betterAuth } from "better-auth";
import Database from "better-sqlite3";
import path from "path";

// Shared SQLite DB with backend (Phase 1 local dev)
// Backend's stagcore.db is at ../backend/stagcore.db relative to frontend
const dbPath = path.resolve(process.cwd(), "../backend/stagcore.db");

export const auth = betterAuth({
  database: new Database(dbPath),
  emailAndPassword: {
    enabled: true,
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: ["http://localhost:3000", "http://localhost:8000"],
});
