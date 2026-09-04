// Tuning workbench: the parts of the panel that exist to make exploring safe
// and repeatable rather than to describe the scene — history, an A/B slot,
// padlocks, the small mutation, the user's own saved views, typeable readouts
// and the good-zone bands on the tracks.
//
// It lives outside main.js because none of it touches GL, the state object or
// the render loop: everything here goes through the same serialized string the
// permalink is made of, which is why undo can be a stack of strings and needs
// to know nothing about what changed.
//
// Classic script, no module: the app must keep opening from file://.
(function () {
  "use strict";

  const VIEWS_KEY = "fractal-mandala-views-v1";
  const LOCKS_KEY = "fractal-mandala-locks-v1";
  const HIST_MAX  = 60;    // states kept for undo
  const VIEWS_MAX = 24;    // saved views kept in localStorage
  const NUDGE     = 0.12;  // Varia: fraction of a track travelled at most

  const LOCK_OPEN   = "🔓";
  const LOCK_CLOSED = "🔒";

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;   // private mode, disabled storage, or a corrupt entry
    }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  function create(ctx) {
    const {
      $, state, DEFAULTS, SLIDER_IDS, MODE_UI, modePresets,
      setControl, serialize, deserialize, applyState, persist,
      showNotice, isInert, toSlider,
    } = ctx;

    // ---------- History ----------
    // persist() is the only writer of the permalink and every hand-made change
    // funnels through it already debounced by 250 ms, so one slider drag is one
    // undo step instead of three hundred.
    const past = [];
    const future = [];
    let replaying = false;

    function record(str) {
      if (replaying) return;
      if (past[past.length - 1] === str) return;
      past.push(str);
      if (past.length > HIST_MAX) past.shift();
      future.length = 0;
      refreshButtons();
    }

    // Installs a state without recording it: the stack already holds it.
    function replay(str) {
      replaying = true;
      applyState(deserialize(str));
      replaying = false;
      persist({ record: false });
      refreshButtons();
    }

    function undo() {
      if (past.length < 2) return;
      future.push(past.pop());
      replay(past[past.length - 1]);
    }
    function redo() {
      const str = future.pop();
      if (!str) return;
      past.push(str);
      replay(str);
    }

    // ---------- A/B slot ----------
    // Two nearby settings cannot be judged from memory, only by alternating
    // them. The swap goes through the normal path, so it lands in the history
    // like any other change: everything that moves the image is undoable.
    let slot = "";

    function markSlot() {
      slot = serialize();
      refreshButtons();
      showNotice("Vista parcheggiata. Premi <b>A/B</b> (o <b>B</b>) per alternare.", { timeout: 2600 });
    }
    function swapSlot() {
      if (!slot) return markSlot();
      const here = serialize();
      applyState(deserialize(slot));
      slot = here;
      persist();
    }

    // ---------- Padlocks ----------
    const locked = new Set(readJSON(LOCKS_KEY, []));
    const isLocked = id => locked.has(id);

    function paintLock(btn) {
      const id = btn.dataset.lock;
      const on = locked.has(id);
      btn.textContent = on ? LOCK_CLOSED : LOCK_OPEN;
      btn.title = on
        ? "Bloccato: Random e Varia non lo toccano. Clicca per sbloccare."
        : "Blocca: Random e Varia lo lasceranno dov'è.";
      const ctl = btn.closest(".ctl");
      if (ctl) ctl.classList.toggle("locked", on);
    }

    const lockButtons = [...document.querySelectorAll("[data-lock]")];
    for (const btn of lockButtons) {
      paintLock(btn);
      btn.addEventListener("click", () => {
        const id = btn.dataset.lock;
        if (locked.has(id)) locked.delete(id); else locked.add(id);
        writeJSON(LOCKS_KEY, [...locked]);
        paintLock(btn);
      });
    }

    // ---------- Varia ----------
    // Random's small sibling: it nudges instead of jumping, so a view you like
    // stays recognisable. Working in track units rather than in values is what
    // makes one rule fit every slider — on the exponential field-of-view track
    // the same step is a constant ratio, on an integer track it is a few units.
    function vary() {
      const mode = state.mode;
      const upright = !!(MODE_UI[mode] || {}).upright;
      for (const id of SLIDER_IDS) {
        if (id === "time") continue;                 // the clock is not a look
        // A mode with an up is a plate: giving it a speed only tips it over,
        // the same reason Random leaves those at 0.
        if (id === "speed" && upright) continue;
        if (locked.has(id) || isInert(mode, id)) continue;
        const el = $(id);
        if (!el) continue;
        const lo = parseFloat(el.min), hi = parseFloat(el.max);
        const span = (hi - lo) * NUDGE;
        let next = parseFloat(el.value) + (Math.random() * 2 - 1) * span;
        const step = parseFloat(el.step) || 1;
        if (step >= 1) {
          next = Math.round(next);
          // On a short integer track the draw often rounds back to where it
          // started, and a button that does nothing reads as broken.
          if (next === parseFloat(el.value)) next += Math.random() < 0.5 ? -1 : 1;
        }
        el.value = clamp(next, lo, hi);
        el.dispatchEvent(new Event("input"));
      }
      persist();
    }

    // ---------- Saved views ----------
    // A saved view is the same thing a named preset is: a permalink with a
    // name. It only lives somewhere else — localStorage instead of the source.
    let views = readJSON(VIEWS_KEY, []).filter(v => v && v.name && v.s);
    let group = null;

    function mountViews(sel) {
      if (!sel) return;
      group = document.createElement("optgroup");
      group.label = "Le tue viste";
      sel.appendChild(group);
      refreshViews();
    }

    function refreshViews() {
      if (!group) return;
      group.innerHTML = "";
      group.hidden = views.length === 0;
      for (const v of views) {
        const opt = document.createElement("option");
        opt.value = "u:" + v.name;
        opt.textContent = v.name;
        group.appendChild(opt);
      }
    }

    // Returns true when the picker value was one of the user's own views, so
    // main.js can fall through to NAMED_PRESETS for everything else.
    function loadView(value) {
      if (typeof value !== "string" || value.slice(0, 2) !== "u:") return false;
      const v = views.find(x => x.name === value.slice(2));
      if (!v) return false;
      applyState(deserialize(v.s));
      persist();
      return true;
    }

    function saveView(sel) {
      const suggested = "Vista " + (views.length + 1);
      const name = (window.prompt("Nome della vista:", suggested) || "").trim();
      if (!name) return;
      views = views.filter(v => v.name !== name);   // same name overwrites
      views.push({ name, s: serialize() });
      if (views.length > VIEWS_MAX) views.shift();
      writeJSON(VIEWS_KEY, views);
      refreshViews();
      if (sel) sel.value = "u:" + name;
      showNotice(`Vista <b>${name}</b> salvata nel menu Preset.`, { timeout: 2600 });
    }

    function deleteView(sel) {
      const value = sel ? sel.value : "";
      if (typeof value !== "string" || value.slice(0, 2) !== "u:") {
        showNotice("Per eliminare, scegli prima una delle tue viste nel menu Preset.", { timeout: 3200 });
        return;
      }
      const name = value.slice(2);
      views = views.filter(v => v.name !== name);
      writeJSON(VIEWS_KEY, views);
      refreshViews();
      sel.value = "";
      showNotice(`Vista <b>${name}</b> eliminata.`, { timeout: 2200 });
    }

    // ---------- Typeable readouts ----------
    // The readout is where you look when you want a number; making it the place
    // where you can also write one removes the only case a slider cannot serve,
    // which is a value you already know.
    function bindReadout(id) {
      const out = document.querySelector(`[data-out="${id}"]`);
      if (!out) return;
      out.contentEditable = "true";
      out.spellcheck = false;
      out.setAttribute("inputmode", "decimal");
      out.title = "Scrivi il valore e premi Invio";

      let before = "";
      out.addEventListener("focus", () => {
        before = out.textContent;
        const r = document.createRange();
        r.selectNodeContents(out);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      });
      out.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); out.blur(); }
        else if (e.key === "Escape") { out.textContent = before; out.blur(); }
        e.stopPropagation();          // keep Ctrl+Z inside the field
      });
      out.addEventListener("blur", () => {
        const n = parseFloat(out.textContent.replace(",", "."));
        if (Number.isFinite(n)) setControl(id, n);
        else out.textContent = before;
        // setControl rewrites the text through bindRange, so a clamped value
        // shows up as the value that was actually taken.
      });
    }

    // ---------- Double click: back to this mode's value ----------
    function bindReset(id) {
      const el = $(id);
      if (!el) return;
      el.addEventListener("dblclick", () => {
        const preset = modePresets[state.mode] || {};
        const v = preset[id] !== undefined ? preset[id] : DEFAULTS[id];
        if (v === undefined) return;
        setControl(id, v);
      });
    }

    for (const id of SLIDER_IDS) {
      bindReadout(id);
      bindReset(id);
    }

    // ---------- Good-zone bands ----------
    function applyZones(mode) {
      const zones = (MODE_UI[mode] || {}).zones || {};
      for (const id of SLIDER_IDS) {
        const el = $(id);
        if (!el) continue;
        const z = zones[id];
        if (!z) {
          el.classList.remove("zoned");
          el.removeAttribute("title");
          continue;
        }
        const lo = parseFloat(el.min), hi = parseFloat(el.max);
        const pct = v => clamp((toSlider(id, v) - lo) / (hi - lo), 0, 1) * 100;
        el.style.setProperty("--zone-a", pct(z[0]).toFixed(1) + "%");
        el.style.setProperty("--zone-b", pct(z[1]).toFixed(1) + "%");
        el.classList.add("zoned");
        el.title = `Zona in cui questa modalità rende: ${z[0]}–${z[1]}`;
      }
    }

    // ---------- Buttons and keys ----------
    const btnUndo = $("undo"), btnRedo = $("redo"), btnAB = $("ab");

    function refreshButtons() {
      if (btnUndo) btnUndo.disabled = past.length < 2;
      if (btnRedo) btnRedo.disabled = future.length === 0;
      if (btnAB) btnAB.classList.toggle("armed", !!slot);
    }

    if (btnUndo) btnUndo.addEventListener("click", undo);
    if (btnRedo) btnRedo.addEventListener("click", redo);
    if (btnAB) btnAB.addEventListener("click", e => (e.shiftKey ? markSlot() : swapSlot()));
    if ($("vary")) $("vary").addEventListener("click", vary);
    if ($("saveview")) {
      $("saveview").addEventListener("click", e => {
        const sel = $("preset");
        if (e.shiftKey) deleteView(sel); else saveView(sel);
      });
    }

    window.addEventListener("keydown", e => {
      const el = e.target;
      // A range slider is an input too, and Ctrl+Z must work while one has
      // focus; only a field you can type into swallows the keys.
      const typing = el && (el.isContentEditable || el.tagName === "SELECT" ||
                            (el.tagName === "INPUT" && el.type !== "range"));
      if (typing) return;

      const k = (e.key || "").toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        else if (k === "y") { e.preventDefault(); redo(); }
        return;
      }
      if (e.altKey) return;
      if (k === "b") { e.preventDefault(); swapSlot(); }
      else if (k === "v") { e.preventDefault(); vary(); }
    });

    refreshButtons();

    return { record, isLocked, applyZones, mountViews, loadView };
  }

  window.FRACTAL_TUNING = { create };
})();
