// Durable record of demo sessions, in SQLite through node:sqlite so the server
// keeps its zero-dependency promise: there is nothing to npm install.
//
// It has to be durable, not a Map: "one session per visitor, once" is a fact
// about the past, and a record kept in memory forgets it on every deploy.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHmac, randomBytes } from "node:crypto";

export function openStore(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS demo_sessions (
      id          TEXT PRIMARY KEY,
      ip_hash     TEXT NOT NULL,
      started_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS demo_sessions_ip ON demo_sessions (ip_hash, started_at);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  // The address itself is never written: only an HMAC of it, which is enough
  // to count sessions per IP. The key lives beside the rows, so this keeps a
  // readable IP out of the table, not out of reach of whoever holds the file.
  let key = db.prepare("SELECT value FROM meta WHERE key = 'ip_key'").get()?.value;
  if (!key) {
    key = randomBytes(32).toString("hex");
    db.prepare("INSERT INTO meta (key, value) VALUES ('ip_key', ?)").run(key);
  }

  const qFind = db.prepare("SELECT * FROM demo_sessions WHERE id = ?");
  const qCreate = db.prepare(
    "INSERT INTO demo_sessions (id, ip_hash, started_at, expires_at) VALUES (?, ?, ?, ?)");
  const qCount = db.prepare(
    "SELECT COUNT(*) AS n FROM demo_sessions WHERE ip_hash = ? AND started_at >= ?");
  const qPurge = db.prepare("DELETE FROM demo_sessions WHERE started_at < ?");

  return {
    hashIp: ip => createHmac("sha256", key).update(String(ip)).digest("hex"),
    find: id => qFind.get(id),
    create(id, ipHash, startedAt, expiresAt) {
      qCreate.run(id, ipHash, startedAt, expiresAt);
      return { id, ip_hash: ipHash, started_at: startedAt, expires_at: expiresAt };
    },
    countSince: (ipHash, since) => qCount.get(ipHash, since).n,
    purge: before => Number(qPurge.run(before).changes),
    close: () => db.close(),
  };
}
