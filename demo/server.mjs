// Production server for the visualiser: two doors onto the same files.
//
//   /       the full visualiser, behind a password (SITE_PASSWORD)
//   /demo   the public demo: one session per browser, DEMO_SESSION_MINUTES
//           long, once, with a banner and a seeded first view
//
// Locally nothing changes. index.html still opens from file:// or from
// `python -m http.server`, with no limit and no banner: this file exists only
// for the deploy, which is why it sits in demo/ and not beside main.js.
//
// The app's files are shared by both doors, so each one opens with either key,
// the password or a live demo session. That is what makes the time box more
// than a countdown: once a session ends, the server stops handing main.js and
// shader.js to it. It is still soft — a private window is a new visitor, and
// the source is public on GitHub. docs/DEMO.md says so.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { openStore } from "./store.mjs";
import * as pages from "./pages.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const COOKIE = "fractal_demo";

const HTML = "text/html; charset=utf-8";
const CSS = "text/css; charset=utf-8";
const JS = "text/javascript; charset=utf-8";
const TEXT = "text/plain; charset=utf-8";

// A list, not a directory: the checkout also holds CLAUDE.md, .deploy/ and the
// shot configs, and none of that is the site.
const APP_FILES = {
  "/style.css": ["style.css", CSS],
  "/shader.js": ["shader.js", JS],
  "/tuning.js": ["tuning.js", JS],
  "/main.js": ["main.js", JS],
};
const DEMO_FILES = {
  "/demo/demo.css": ["demo/demo.css", CSS],
  "/demo/demo.js": ["demo/demo.js", JS],
};

function positive(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  // 0 must never read as "no limit": a bad value keeps the default.
  console.warn(`[demo] ${name}=${raw} is not a positive number, using ${fallback}`);
  return fallback;
}

export function configFromEnv(env = process.env) {
  return {
    port: positive(env, "PORT", 8080),
    demoMode: /^(1|true|yes|on)$/i.test(env.DEMO_MODE || ""),
    password: env.SITE_PASSWORD || "",
    sessionMinutes: positive(env, "DEMO_SESSION_MINUTES", 45),
    sessionsPerIpPerDay: positive(env, "DEMO_SESSIONS_PER_IP_PER_DAY", 3),
    retentionDays: positive(env, "DEMO_RETENTION_DAYS", 90),
    dbPath: env.DEMO_DB_PATH || join(ROOT, "demo", "data", "demo.sqlite"),
  };
}

export function createDemoServer(cfg, { now = Date.now, root = ROOT } = {}) {
  const store = cfg.demoMode ? openStore(cfg.dbPath) : null;
  const passwordDigest = cfg.password ? sha256(cfg.password) : null;

  // Cleanup is lazy: an expired session made nothing on the server, so the
  // only thing to delete is the identity row once its retention is over. When
  // it goes, that browser may start a new session — the rule lasts as long as
  // the record does.
  let lastPurge = -Infinity;
  function purgeMaybe(t) {
    if (t - lastPurge < HOUR) return;
    lastPurge = t;
    store.purge(t - cfg.retentionDays * DAY);
  }
  if (store) purgeMaybe(now());

  function authorized(req) {
    if (!passwordDigest) return false;
    const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || "");
    if (!m) return false;
    const decoded = Buffer.from(m[1], "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    // Any user name: the password is the whole secret.
    const given = sep >= 0 ? decoded.slice(sep + 1) : "";
    return timingSafeEqual(sha256(given), passwordDigest);
  }

  function sessionOf(req) {
    const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{16,64})`).exec(req.headers.cookie || "");
    return m ? store.find(m[1]) : undefined;
  }

  const live = (s, t) => s && t < s.expires_at;

  function demoEntry(req, res) {
    const t = now();
    purgeMaybe(t);
    const existing = sessionOf(req);
    if (existing) {
      // Resumable inside the window, never renewed after it.
      if (live(existing, t)) return demoPage(res, existing, t);
      return send(res, 403, HTML, pages.ended(cfg));
    }
    // A HEAD (link checkers, previews) must not spend anyone's session.
    if (req.method === "HEAD") return send(res, 200, HTML, "");

    // The edge nginx overwrites X-Real-IP, and this container is reachable
    // only through it, so the header is the visitor's address.
    const ip = req.headers["x-real-ip"] || req.socket.remoteAddress || "";
    const ipHash = store.hashIp(ip);
    const dayStart = Math.floor(t / DAY) * DAY;   // UTC midnight
    if (store.countSince(ipHash, dayStart) >= cfg.sessionsPerIpPerDay) {
      return send(res, 429, HTML, pages.capacity(cfg));
    }
    // Count and insert run in one synchronous stretch: node:sqlite blocks, so
    // no other request can slip between the check and the write.
    const id = randomBytes(24).toString("base64url");
    const session = store.create(id, ipHash, t, t + cfg.sessionMinutes * MINUTE);
    const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    const cookie = `${COOKIE}=${id}; Path=/; Max-Age=${Math.round(cfg.retentionDays * 86400)}; HttpOnly; SameSite=Lax${secure}`;
    return demoPage(res, session, t, { "Set-Cookie": cookie });
  }

  function demoPage(res, session, t, headers = {}) {
    const boot = {
      expiresAt: session.expires_at,
      serverNow: t,
      minutes: cfg.sessionMinutes,
      contact: pages.CONTACT_URL,
    };
    const html = pages.injectDemo(readFileSync(join(root, "index.html"), "utf8"), boot);
    return send(res, 200, HTML, html, headers);
  }

  // What the open tab asks when it regains focus. It never creates a session.
  function demoStatus(req, res) {
    const t = now();
    const s = sessionOf(req);
    if (!s) return sendJson(res, 401, { code: "DEMO_NO_SESSION" });
    if (!live(s, t)) return sendJson(res, 403, { code: "DEMO_EXPIRED" });
    return sendJson(res, 200, { expiresAt: s.expires_at, serverNow: t });
  }

  function handle(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(res, 405, TEXT, "Metodo non consentito", { Allow: "GET, HEAD" });
    }
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/healthz") return send(res, 200, TEXT, "ok");

    if (!cfg.demoMode) {
      // Kill switch: the site goes back to what it was before the demo — the
      // whole visualiser, public, no password and no clock. /demo still
      // answers, so the landing card's link keeps working.
      if (path === "/demo" || path === "/demo/") return redirect(res, "/");
      if (path === "/" || path === "/index.html") return sendFile(res, root, "index.html", HTML);
      if (APP_FILES[path]) return sendFile(res, root, ...APP_FILES[path]);
      return send(res, 404, HTML, pages.notFound());
    }

    if (path === "/demo/") return redirect(res, "/demo", 301);
    if (path === "/demo") return demoEntry(req, res);
    if (path === "/demo/status") return demoStatus(req, res);

    if (path === "/" || path === "/index.html") {
      // Fail closed: without a password the full version stays shut.
      if (!passwordDigest) return send(res, 503, HTML, pages.notConfigured());
      if (!authorized(req)) {
        return send(res, 401, HTML, pages.privateSite(), {
          "WWW-Authenticate": 'Basic realm="Fractal Mandala", charset="UTF-8"',
        });
      }
      return sendFile(res, root, "index.html", HTML);
    }

    const file = APP_FILES[path] || DEMO_FILES[path];
    if (file) {
      if (authorized(req) || live(sessionOf(req), now())) return sendFile(res, root, ...file);
      return send(res, 403, TEXT, "Sessione demo assente o scaduta.");
    }
    return send(res, 404, HTML, pages.notFound());
  }

  const server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch (err) {
      console.error("[demo]", err);
      if (!res.headersSent) send(res, 500, TEXT, "Errore del server.");
    }
  });
  server.on("close", () => store?.close());
  return server;
}

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest();
}

function send(res, status, type, body, headers = {}) {
  // no-store everywhere: a cached main.js would outlive the session it was
  // served to, and the files are small enough not to need a cache.
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...headers });
  res.end(res.req.method === "HEAD" ? undefined : body);
}

function sendJson(res, status, obj) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(obj));
}

function sendFile(res, root, rel, type) {
  send(res, 200, type, readFileSync(join(root, rel)));
}

function redirect(res, to, status = 302) {
  send(res, status, TEXT, "", { Location: to });
}

// Run directly: `npm start`. Imported: the tests build their own server.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const cfg = configFromEnv();
  const server = createDemoServer(cfg);
  server.listen(cfg.port, "0.0.0.0", () => {
    console.log(`[demo] listening on :${cfg.port}, DEMO_MODE=${cfg.demoMode}`);
    if (cfg.demoMode) {
      console.log(`[demo] ${cfg.sessionMinutes} min per session, ${cfg.sessionsPerIpPerDay} per IP per day, rows kept ${cfg.retentionDays} days, db ${cfg.dbPath}`);
      if (!cfg.password) console.warn("[demo] SITE_PASSWORD is not set: / answers 503 until it is");
    }
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
