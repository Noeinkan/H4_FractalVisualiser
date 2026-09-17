// Tests for the demo gate: `npm test`. Each test builds its own server on a
// random port, with an in-memory database and a clock it moves by hand.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDemoServer, configFromEnv } from "./server.mjs";
import { injectDemo } from "./pages.mjs";

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const T0 = Date.UTC(2026, 8, 17, 10, 0, 0);

async function start(overrides = {}) {
  const clock = { t: T0 };
  const cfg = {
    ...configFromEnv({}),
    demoMode: true,
    password: "sesamo",
    dbPath: ":memory:",
    ...overrides,
  };
  const server = createDemoServer(cfg, { now: () => clock.t });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, { cookie, ip = "203.0.113.1", auth, method = "GET" } = {}) => {
    const headers = { "X-Real-IP": ip };
    if (cookie) headers.Cookie = cookie;
    if (auth) headers.Authorization = "Basic " + Buffer.from(auth).toString("base64");
    return fetch(base + path, { headers, method, redirect: "manual" });
  };
  const cookieOf = res => (res.headers.get("set-cookie") || "").split(";")[0];
  return { clock, get, cookieOf, close: () => new Promise(r => server.close(r)) };
}

test("health check answers without a session or a password", async t => {
  const s = await start();
  t.after(s.close);
  assert.equal((await s.get("/healthz")).status, 200);
});

test("the first visit to /demo starts a session and serves the demo page", async t => {
  const s = await start();
  t.after(s.close);
  const res = await s.get("/demo");
  assert.equal(res.status, 200);
  assert.match(s.cookieOf(res), /^fractal_demo=[A-Za-z0-9_-]+$/);
  const html = await res.text();
  assert.match(html, /<script src="demo\/demo\.js"><\/script>/);
  assert.match(html, /demo\/demo\.css/);
  assert.ok(html.includes(`"expiresAt":${T0 + 45 * MIN}`));
});

test("coming back inside the window resumes the same session with the time left", async t => {
  const s = await start();
  t.after(s.close);
  const cookie = s.cookieOf(await s.get("/demo"));
  s.clock.t = T0 + 30 * MIN;
  const res = await s.get("/demo", { cookie });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("set-cookie"), null, "no new session is minted");
  assert.ok((await res.text()).includes(`"expiresAt":${T0 + 45 * MIN}`));
});

test("the session ends at its length, and the same browser cannot start another", async t => {
  const s = await start();
  t.after(s.close);
  const cookie = s.cookieOf(await s.get("/demo"));
  s.clock.t = T0 + 45 * MIN;

  const page = await s.get("/demo", { cookie });
  assert.equal(page.status, 403);
  assert.match(await page.text(), /La demo è finita/);
  assert.equal(page.headers.get("set-cookie"), null);

  const status = await s.get("/demo/status", { cookie });
  assert.equal(status.status, 403);
  assert.deepEqual(await status.json(), { code: "DEMO_EXPIRED" });

  // Expiry holds on the app's own files too, not only on the page.
  assert.equal((await s.get("/main.js", { cookie })).status, 403);

  // A different browser is a different visitor.
  assert.equal((await s.get("/demo", { ip: "198.51.100.7" })).status, 200);
});

test("the app files open with a live session or the password, and not otherwise", async t => {
  const s = await start();
  t.after(s.close);
  assert.equal((await s.get("/main.js")).status, 403);
  assert.equal((await s.get("/demo/demo.js")).status, 403);
  const cookie = s.cookieOf(await s.get("/demo"));
  for (const f of ["/main.js", "/shader.js", "/tuning.js", "/style.css", "/demo/demo.js", "/demo/demo.css"]) {
    assert.equal((await s.get(f, { cookie })).status, 200, f);
  }
  assert.equal((await s.get("/main.js", { auth: "chiunque:sesamo" })).status, 200);
});

test("status reports the time left while the session is live", async t => {
  const s = await start();
  t.after(s.close);
  const cookie = s.cookieOf(await s.get("/demo"));
  s.clock.t = T0 + 10 * MIN;
  const res = await s.get("/demo/status", { cookie });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { expiresAt: T0 + 45 * MIN, serverNow: T0 + 10 * MIN });
  assert.equal((await s.get("/demo/status")).status, 401);
});

test("the per-IP backstop refuses past its count and releases the next UTC day", async t => {
  const s = await start({ sessionsPerIpPerDay: 3 });
  t.after(s.close);
  for (let i = 0; i < 3; i++) assert.equal((await s.get("/demo")).status, 200);
  const refused = await s.get("/demo");
  assert.equal(refused.status, 429);
  assert.match(await refused.text(), /mezzanotte UTC/);
  assert.equal((await s.get("/demo", { ip: "198.51.100.7" })).status, 200, "other addresses are unaffected");
  s.clock.t = T0 + DAY;
  assert.equal((await s.get("/demo")).status, 200);
});

test("a HEAD request does not spend a session", async t => {
  const s = await start({ sessionsPerIpPerDay: 1 });
  t.after(s.close);
  const head = await s.get("/demo", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("set-cookie"), null);
  assert.equal((await s.get("/demo")).status, 200);
});

test("the full version asks for the password, and fails closed without one", async t => {
  const s = await start();
  t.after(s.close);
  const denied = await s.get("/");
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get("www-authenticate"), /^Basic /);
  assert.equal((await s.get("/", { auth: "x:sbagliata" })).status, 401);

  const ok = await s.get("/", { auth: "andrea:sesamo" });
  assert.equal(ok.status, 200);
  assert.doesNotMatch(await ok.text(), /demo\.js/, "the full version has no demo layer");

  // A live demo session is not a key to the full version.
  const cookie = s.cookieOf(await s.get("/demo"));
  assert.equal((await s.get("/", { cookie })).status, 401);

  const open = await start({ password: "" });
  t.after(open.close);
  assert.equal((await open.get("/")).status, 503);
  assert.equal((await open.get("/main.js", { auth: "x:" })).status, 403);
});

test("kill switch off: the site is the plain visualiser, and /demo leads to it", async t => {
  const s = await start({ demoMode: false, password: "" });
  t.after(s.close);
  const demo = await s.get("/demo");
  assert.equal(demo.status, 302);
  assert.equal(demo.headers.get("location"), "/");
  assert.equal((await s.get("/")).status, 200);
  assert.equal((await s.get("/main.js")).status, 200);
  assert.equal((await s.get("/demo/status")).status, 404);
  assert.equal((await s.get("/demo/demo.js")).status, 404);
});

test("nothing outside the app's own files is served", async t => {
  const s = await start();
  t.after(s.close);
  const cookie = s.cookieOf(await s.get("/demo"));
  for (const p of ["/CLAUDE.md", "/.deploy/site.json", "/demo/server.mjs", "/package.json", "/demo/../CLAUDE.md"]) {
    assert.equal((await s.get(p, { cookie, auth: "x:sesamo" })).status, 404, p);
  }
});

test("rows past retention are purged, and only then may that browser start again", async t => {
  const s = await start({ retentionDays: 90 });
  t.after(s.close);
  const cookie = s.cookieOf(await s.get("/demo"));
  s.clock.t = T0 + 89 * DAY;
  assert.equal((await s.get("/demo", { cookie })).status, 403);
  s.clock.t = T0 + 91 * DAY;
  const again = await s.get("/demo", { cookie });
  assert.equal(again.status, 200);
  assert.ok(s.cookieOf(again), "a new session, since the old record is gone");
});

test("a zero or invalid limit falls back to the default instead of meaning no limit", () => {
  const cfg = configFromEnv({
    DEMO_SESSION_MINUTES: "0",
    DEMO_SESSIONS_PER_IP_PER_DAY: "tanti",
    DEMO_RETENTION_DAYS: "-5",
  });
  assert.equal(cfg.sessionMinutes, 45);
  assert.equal(cfg.sessionsPerIpPerDay, 3);
  assert.equal(cfg.retentionDays, 90);
  assert.equal(configFromEnv({}).demoMode, false, "off unless asked for");
  assert.equal(configFromEnv({ DEMO_MODE: "true" }).demoMode, true);
});

test("the real index.html still has the places the demo is injected into", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const out = injectDemo(html, { expiresAt: 1, serverNow: 0, minutes: 45, contact: "x" });
  assert.ok(out.indexOf("demo/demo.js") < out.indexOf('src="main.js"'), "demo.js runs before main.js");
  assert.ok(out.indexOf("demo/demo.css") < out.indexOf("</head>"));
  assert.throws(() => injectDemo("<html></html>", {}), /cannot inject/);
});
