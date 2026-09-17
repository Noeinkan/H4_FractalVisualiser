// Demo layer. The server injects this script, and window.FRACTAL_DEMO before
// it, into index.html only when it serves /demo (demo/pages.mjs). Opened any
// other way — file://, python -m http.server, the password-protected / — the
// visualiser never loads it. A classic script, like shader.js and tuning.js.
(() => {
  "use strict";

  const boot = window.FRACTAL_DEMO;
  if (!boot) return;

  // «Giardino di smeraldo» from NAMED_PRESETS in main.js, with its t=6: the
  // landing card's first capture, so the click shows what the card promised.
  // The keys are out of serialize()'s order on purpose. main.js ignores a
  // hashchange whose hash equals the one it last wrote, and this string can
  // never be that one, so «Ricomincia» works even on an untouched view.
  const SEED = "t=6&m=1&s=12&p=6&i=7&z=2.8&c=1.1&v=0.6&b=1&g=7&x=-0.12&y=0&r=0";

  // A hashless entry is a click from outside, and gets the seeded view. A
  // reload keeps its hash — main.js writes one on every change — and its view.
  if (!location.hash) history.replaceState(null, "", "#" + SEED);

  const DISMISS_KEY = "fractal-demo-bar";
  const LOW_MS = 5 * 60_000;

  // The server's clock decides; this page only counts down. `offset` maps the
  // server's timestamps onto this machine's, so a wrong system clock can
  // neither stretch nor shorten the display.
  let offset = boot.serverNow - Date.now();
  let expiresAt = boot.expiresAt;
  let ending = false;

  const bar = document.createElement("div");
  bar.id = "demo-bar";
  bar.innerHTML =
    '<span class="demo-text"></span>' +
    '<span class="demo-clock" title="Tempo rimasto"></span>' +
    '<button type="button" class="demo-restart" title="Torna alla vista iniziale (Ctrl+Z la riporta indietro)">Ricomincia</button>' +
    '<a class="demo-link" target="_blank" rel="noopener">Contatti</a>' +
    '<button type="button" class="demo-close" title="Riduci" aria-label="Riduci">&times;</button>';
  bar.querySelector(".demo-text").textContent =
    `Demo · ${boot.minutes} minuti, una volta sola per visitatore`;
  bar.querySelector(".demo-link").href = boot.contact;
  const clock = bar.querySelector(".demo-clock");

  let dismissed = false;
  try { dismissed = sessionStorage.getItem(DISMISS_KEY) === "min"; } catch { /* ignore */ }
  // Reduced, not removed: the time left stays on screen for the whole session.
  bar.classList.toggle("min", dismissed);

  bar.querySelector(".demo-close").addEventListener("click", () => {
    bar.classList.add("min");
    try { sessionStorage.setItem(DISMISS_KEY, "min"); } catch { /* ignore */ }
  });
  clock.addEventListener("click", () => {
    bar.classList.remove("min");
    try { sessionStorage.removeItem(DISMISS_KEY); } catch { /* ignore */ }
  });

  // Through the hash, the same way a pasted link arrives: applyState, then
  // persist, which puts the view you leave on the undo stack.
  bar.querySelector(".demo-restart").addEventListener("click", () => {
    location.hash = SEED;
  });

  document.body.appendChild(bar);

  // At zero the page does not draw its own wall: it reloads, and the server —
  // which is what enforces the limit — answers with the ended page. That
  // replaces the canvas and stops the rendering with it. If this tab's count
  // ran ahead of the server, the reload just brings back the time still left.
  function end() {
    if (ending) return;
    ending = true;
    clearInterval(timer);
    location.reload();
  }

  function tick() {
    const left = expiresAt - (Date.now() + offset);
    if (left <= 0) {
      clock.textContent = "0:00";
      end();
      return;
    }
    const s = Math.ceil(left / 1000);
    clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    bar.classList.toggle("low", left <= LOW_MS);
  }

  const timer = setInterval(tick, 1000);
  tick();

  // No polling: a background tab costs the server nothing. Coming back to the
  // tab is when the countdown may have drifted (a sleeping laptop), so that is
  // when it asks.
  let lastCheck = 0;
  async function recheck() {
    if (document.hidden || ending || Date.now() - lastCheck < 5000) return;
    lastCheck = Date.now();
    try {
      const r = await fetch("demo/status", { cache: "no-store", credentials: "same-origin" });
      const body = await r.json();
      if (body.code === "DEMO_EXPIRED") return end();
      if (r.ok) {
        offset = body.serverNow - Date.now();
        expiresAt = body.expiresAt;
        tick();
      }
    } catch {
      /* offline: keep counting on what we already know */
    }
  }
  document.addEventListener("visibilitychange", recheck);
  window.addEventListener("focus", recheck);
})();
