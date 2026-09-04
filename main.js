(() => {
  "use strict";

  // ---------- Notices / fatal errors ----------
  const noticeEl = document.getElementById("notice");
  let noticeTimer = 0;

  const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  function showNotice(html, { fatal = false, timeout = 0 } = {}) {
    if (!noticeEl) return;
    clearTimeout(noticeTimer);
    noticeEl.innerHTML = html;
    noticeEl.classList.toggle("fatal", fatal);
    noticeEl.hidden = false;
    if (timeout) noticeTimer = setTimeout(hideNotice, timeout);
  }
  function hideNotice() {
    clearTimeout(noticeTimer);
    if (noticeEl) noticeEl.hidden = true;
  }

  const shaderSrc = window.FRACTAL_SHADER;
  if (!shaderSrc) {
    showNotice("Impossibile caricare <code>shader.js</code>.", { fatal: true });
    return;
  }

  const canvas = document.getElementById("gl");

  // preserveDrawingBuffer is intentionally OFF: it costs on every frame and is
  // only needed for the PNG export, which instead draws and snapshots in the
  // same task (see saveScreenshot).
  const GL_OPTS = {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: "high-performance",
  };
  const gl = canvas.getContext("webgl", GL_OPTS) || canvas.getContext("experimental-webgl", GL_OPTS);
  if (!gl) {
    showNotice("WebGL non è supportato (o è disabilitato) in questo browser.", { fatal: true });
    return;
  }

  // ---------- GL program (rebuildable, for context loss) ----------
  let prog = null, buf = null, U = null, ready = false, hasDerivatives = false;

  function compile(type, src, label) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh) || "errore sconosciuto";
      console.error(`[shader ${label}] ${log}`);
      showNotice(
        `Compilazione dello shader <b>${label}</b> fallita:<pre>${esc(log)}</pre>`,
        { fatal: true }
      );
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function buildGL() {
    ready = false;

    // Without OES_standard_derivatives fwidth() returns garbage, so the shader
    // falls back to a fixed edge width instead of silently losing all AA.
    hasDerivatives = !!gl.getExtension("OES_standard_derivatives");
    const header = hasDerivatives
      ? "#extension GL_OES_standard_derivatives : enable\n#define FW(x) fwidth(x)\n"
      : "#define FW(x) 0.0035\n";

    const vs = compile(gl.VERTEX_SHADER, shaderSrc.VERT, "vertex");
    if (!vs) return false;
    const fs = compile(gl.FRAGMENT_SHADER, header + shaderSrc.FRAG_BODY, "fragment");
    if (!fs) { gl.deleteShader(vs); return false; }

    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) || "errore sconosciuto";
      console.error(log);
      showNotice(`Link del programma GL fallito:<pre>${esc(log)}</pre>`, { fatal: true });
      return false;
    }
    gl.useProgram(prog);

    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    U = {};
    for (const name of [
      "resolution", "time", "symmetry", "zoom", "iterations", "complexity",
      "bloom", "palette", "mode", "petals", "pan", "rot",
    ]) {
      U[name] = gl.getUniformLocation(prog, "u_" + name);
    }

    ready = true;
    if (!hasDerivatives) {
      console.warn("OES_standard_derivatives non disponibile: AA a soglia fissa.");
      showNotice(
        "Estensione <code>OES_standard_derivatives</code> non disponibile: " +
        "anti-aliasing approssimato.",
        { timeout: 6000 }
      );
    }
    return true;
  }

  if (!buildGL()) return;

  canvas.addEventListener("webglcontextlost", e => {
    e.preventDefault();          // required, otherwise the context is never restored
    ready = false;
    showNotice("Contesto WebGL perso — ripristino in corso…");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (buildGL()) {
      hideNotice();
      resize(true);
      markDirty();
    }
  });

  // ---------- Constants ----------
  const ZOOM_MIN = 0.2;
  const ZOOM_MAX = 8;

  // Highest iteration count each mode actually consumes (its shader loop bound).
  // Beyond these the slider would be inert, so the control's max follows the mode.
  const MODE_ITER_MAX = { 0: 16, 1: 10, 2: 7, 3: 12, 4: 8, 5: 8, 6: 6, 7: 6, 8: 8, 9: 8 };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------- State ----------
  const state = {
    mode:       1,      // start on Floral (feels closer to the reference images)
    symmetry:   8,
    zoom:       1.6,
    iterations: 7,
    complexity: 1.10,
    speed:      0.35,
    bloom:      0.85,
    petals:     6,
    palette:    5,      // Isfahan Gold
    pan:        [0, 0],
    rot:        0,
    paused:     false,
  };

  // Per-mode sensible defaults
  const modePresets = {
    0: { symmetry: 8,  iterations: 7,  complexity: 1.10, zoom: 1.6, palette: 0, petals: 6 },
    1: { symmetry: 8,  iterations: 6,  complexity: 1.00, zoom: 1.8, palette: 5, petals: 6 },
    2: { symmetry: 10, iterations: 4,  complexity: 1.00, zoom: 1.4, palette: 2, petals: 6 },
    3: { symmetry: 6,  iterations: 8,  complexity: 1.00, zoom: 1.4, palette: 6, petals: 6 },
    4: { symmetry: 12, iterations: 5,  complexity: 1.10, zoom: 1.3, palette: 5, petals: 8 },
    5: { symmetry: 14, iterations: 5,  complexity: 1.00, zoom: 1.2, palette: 2, petals: 5 },
    6: { symmetry: 10, iterations: 5,  complexity: 1.00, zoom: 2.7, palette: 2, petals: 8 },
    // The mihrab has an up: the global spin in main() would tip it over, so the
    // preset parks the clock the way the two ink modes below do.
    7: { symmetry: 10, iterations: 5,  complexity: 1.00, zoom: 1.7, palette: 5, petals: 5, speed: 0 },
    // Henna is a poster, not an animation: speed 0 so the plate stays put,
    // and a zoom wide enough to hold the rings and their finial (r ~ 1.46).
    // `petals` is the seed of the composition in this mode, not a petal count.
    8: { symmetry:  8, iterations: 8,  complexity: 1.00, zoom: 3.2, palette: 0, petals: 6, speed: 0 },
    9: { symmetry:  6, iterations: 6,  complexity: 1.00, zoom: 2.9, palette: 2, petals: 6, speed: 0 },
  };

  // Named views for the preset picker. A preset is a permalink and nothing
  // more: applying one runs through the same deserialize/applyState path the
  // URL hash uses, so there is only ever one way to install a full state.
  //
  // `t` seeds the animation clock. Modes 0, 2, 3 and 4 render a near-flat wash
  // at t=0 and only resolve after a few seconds of animation, so a preset that
  // starts them from zero shows the user something that is not what its name
  // promises. Modes with an up (7, 8, 9) leave `t` out and so start at 0.
  const NAMED_PRESETS = [
    { name: "Giardino di smeraldo", t: 6.0,
      s: "m=1&s=12&p=6&i=7&z=2.8&c=1.1&v=0.6&b=1&g=7&x=-0.12&y=0&r=0" },
    { name: "Trama caleidoscopica", t: 7.0,
      s: "m=0&s=12&p=6&i=10&z=0.6&c=0.9&v=0.5&b=1.8&g=2&x=0&y=0&r=0" },
    // z=0.45 rather than the 0.25 of shot 05: this mode is sparse by nature and
    // the wider field is the difference between three rings and one.
    { name: "Stelle girih", t: 5.0,
      s: "m=2&s=8&p=6&i=7&z=0.45&c=1&v=0.4&b=1&g=5&x=0&y=0&r=0" },
    { name: "Julia in fiore", t: 6.5,
      s: "m=3&s=10&p=6&i=9&z=0.5&c=1.05&v=0.5&b=1&g=3&x=0&y=0&r=0" },
    { name: "Shamsa d'oro", t: 6.0,
      s: "m=4&s=12&p=8&i=8&z=0.8&c=1.3&v=0.5&b=1&g=5&x=0&y=0&r=0" },
    { name: "Cupola di Lotfollah", t: 5.0,
      s: "m=5&s=18&p=5&i=6&z=1.6&c=1.1&v=0.4&b=1&g=1&x=0&y=0&r=0" },
    // Monochrome Ink has no colour to carry the tiles, so the glow term does:
    // at b=1 this view is grey on grey.
    { name: "Inchiostro monocromo", t: 5.0,
      s: "m=5&s=10&p=5&i=6&z=0.5&c=1.2&v=0.4&b=1.4&g=4&x=0&y=0&r=0" },
    { name: "Volta a costoloni",
      s: "m=6&s=16&p=6&i=4&z=2.7&c=0.8&v=0&b=1.2&g=5&x=0&y=0&r=0" },
    { name: "Mihrab con lampada",
      s: "m=7&s=10&p=5&i=5&z=1.7&c=1&v=0&b=0.85&g=5&x=0&y=0&r=0" },
    { name: "Henna blu notte",
      s: "m=8&s=8&p=6&i=8&z=3.2&c=1&v=0&b=0.85&g=0&x=0&y=0&r=0" },
    { name: "Henna zafferano",
      s: "m=8&s=10&p=6&i=8&z=3.2&c=1.2&v=0&b=0.85&g=5&x=0&y=0&r=0" },
    { name: "Muqarnas cobalto",
      s: "m=9&s=6&p=6&i=6&z=2.9&c=1&v=0&b=0.85&g=2&x=0&y=0&r=0" },
  ];

  let timeAccum = 0;
  let lastFrame = performance.now();
  let dirty     = true;
  const markDirty = () => { dirty = true; };

  // ---------- Resize + adaptive resolution ----------
  // Every mode is fill-rate bound, so the only lever that buys frames on a slow
  // GPU is drawing fewer pixels. The drawing buffer shrinks while the scene is
  // moving (animation, drag, slider) and returns to full resolution as soon as
  // it settles: motion stays fluid, stills stay sharp. CSS holds the canvas at
  // viewport size, so the compositor upscales the smaller buffer for free.
  const DPR_CAP   = 2;
  const SCALE_MIN = 0.45;
  const SETTLE_MS = 220;    // input keeps the low-resolution mode alive this long

  let renderScale   = 1;    // learned from frame pacing, applied only while moving
  let interactUntil = 0;
  let bufW = 0, bufH = 0;

  const touchInput = () => { interactUntil = performance.now() + SETTLE_MS; };

  function setBuffer(scale) {
    const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP) * scale;
    const w = Math.max(1, Math.round(window.innerWidth  * dpr));
    const h = Math.max(1, Math.round(window.innerHeight * dpr));
    if (w === bufW && h === bufH) return;
    canvas.width  = bufW = w;
    canvas.height = bufH = h;
    gl.viewport(0, 0, w, h);
    markDirty();
  }

  function resize(force) {
    if (force === true) bufW = bufH = 0;   // after a context restore the buffer is gone
    setBuffer(performance.now() < interactUntil ? renderScale : 1);
  }
  window.addEventListener("resize", () => resize());
  resize(true);

  // ---------- UI bindings ----------
  const $ = id => document.getElementById(id);

  let restoring = false;   // suppresses preset application + URL writes while loading state
  let persistTimer = 0;    // declared here: bindRange's initial update() already persists
  let lastHash = "";
  const presetSel = $("preset");   // read here: schedulePersist runs before the picker is filled

  function setControl(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = value;
    // The element clamps to its own min/max/step; the listener reads el.value back.
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input"));
  }

  const bindRange = (id, key, parseFn = parseFloat) => {
    const el = $(id);
    if (!el) return;
    const out = document.querySelector(`[data-out="${id}"]`);
    const update = () => {
      state[key] = parseFn(el.value);
      if (out) {
        const isFloat = el.step && String(el.step).includes(".");
        out.textContent = isFloat ? (+el.value).toFixed(2) : String(parseInt(el.value, 10));
      }
      markDirty();
      schedulePersist();
    };
    el.addEventListener("input", () => { touchInput(); update(); });
    update();
  };

  bindRange("symmetry",   "symmetry",   parseInt);
  bindRange("zoom",       "zoom");
  bindRange("iterations", "iterations", parseInt);
  bindRange("complexity", "complexity");
  bindRange("speed",      "speed");
  bindRange("bloom",      "bloom");
  bindRange("petals",     "petals",     parseInt);

  $("palette").addEventListener("change", e => {
    state.palette = parseInt(e.target.value, 10);
    markDirty();
    schedulePersist();
  });

  // Applies a mode: adjusts the iteration range it can actually use, and
  // (on user interaction only) its preset + a fresh framing.
  function applyMode(mode, usePresets) {
    state.mode = mode;
    const sel = $("mode");
    if (sel && sel.value !== String(mode)) sel.value = String(mode);

    const it = $("iterations");
    if (it) {
      it.max = String(MODE_ITER_MAX[mode] ?? 12);
      setControl("iterations", it.value);   // re-clamp + refresh the readout
    }

    if (usePresets) {
      const preset = modePresets[mode];
      if (preset) for (const k in preset) setControl(k, preset[k]);
      // A preset asking for speed 0 wants a still plate, and the clock keeps
      // turning the scene through main()'s u_time rotation: rewind it, or the
      // upright modes arrive tilted by however long the last one ran.
      if (preset && preset.speed === 0) timeAccum = 0;
      state.pan[0] = 0;
      state.pan[1] = 0;
      state.rot = 0;
    }
    markDirty();
    schedulePersist();
  }

  if ($("mode")) {
    $("mode").addEventListener("change", e => {
      applyMode(parseInt(e.target.value, 10), !restoring);
    });
  }

  $("pause").addEventListener("click", () => {
    state.paused = !state.paused;
    $("pause").textContent = state.paused ? "Play" : "Pausa";
  });

  $("randomize").addEventListener("click", () => {
    const rnd = (a, b) => a + Math.random() * (b - a);
    setControl("symmetry",   Math.floor(rnd(4, 16)));
    setControl("complexity", rnd(0.7, 1.6).toFixed(2));
    setControl("iterations", Math.floor(rnd(4, 11)));
    setControl("zoom",       rnd(0.8, 2.5).toFixed(2));
    setControl("speed",      rnd(0.1, 0.8).toFixed(2));
    setControl("bloom",      rnd(0.4, 1.3).toFixed(2));
    setControl("petals",     Math.floor(rnd(3, 12)));
    setControl("palette",    Math.floor(Math.random() * $("palette").options.length));
  });

  if ($("reset")) {
    $("reset").addEventListener("click", () => {
      state.pan[0] = 0;
      state.pan[1] = 0;
      state.rot = 0;
      markDirty();
      schedulePersist();
    });
  }

  $("screenshot").addEventListener("click", saveScreenshot);

  $("toggle").addEventListener("click", () => {
    $("panel").classList.toggle("collapsed");
  });

  // On a narrow screen the open panel is a bottom sheet covering most of the
  // canvas, so it starts closed and the ☰ button is the way in. The breakpoint
  // is the one in style.css: change both or neither.
  if (window.matchMedia("(max-width: 620px)").matches) {
    $("panel").classList.add("collapsed");
  }

  function saveScreenshot() {
    if (!ready) return;
    // Full resolution whatever the adaptive scale is doing, then draw and
    // snapshot within the same task: without preserveDrawingBuffer the
    // backbuffer is only guaranteed valid until the browser composites.
    interactUntil = 0;
    setBuffer(1);
    dirty = true;
    render();
    canvas.toBlob(b => {
      if (!b) return;
      const a = document.createElement("a");
      const url = URL.createObjectURL(b);
      a.href = url;
      a.download = `fractal_m${state.mode}_s${state.symmetry}_${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  // ---------- Permalink + persistence ----------
  const STORE_KEY = "fractal-mandala-v1";
  const HASH_MAP = {
    s: "symmetry", p: "petals", i: "iterations", z: "zoom",
    c: "complexity", v: "speed", b: "bloom", g: "palette",
  };

  const r3 = n => Math.round(n * 1000) / 1000;

  function serialize() {
    const s = state;
    return `m=${s.mode}&s=${s.symmetry}&p=${s.petals}&i=${s.iterations}` +
           `&z=${r3(s.zoom)}&c=${r3(s.complexity)}&v=${r3(s.speed)}&b=${r3(s.bloom)}` +
           `&g=${s.palette}&x=${r3(s.pan[0])}&y=${r3(s.pan[1])}&r=${r3(s.rot)}`;
  }

  function deserialize(str) {
    const out = {};
    if (!str) return out;
    new URLSearchParams(str).forEach((val, key) => {
      const n = parseFloat(val);
      if (Number.isFinite(n)) out[key] = n;
    });
    return out;
  }

  function applyState(o) {
    if (!o || !Object.keys(o).length) return false;
    restoring = true;
    if ("m" in o) applyMode(clamp(Math.round(o.m), 0, 9), false);
    for (const key in HASH_MAP) {
      if (key in o) setControl(HASH_MAP[key], o[key]);
    }
    if ("x" in o) state.pan[0] = o.x;
    if ("y" in o) state.pan[1] = o.y;
    if ("r" in o) state.rot   = o.r;
    restoring = false;
    markDirty();
    return true;
  }

  function schedulePersist() {
    if (restoring) return;
    // Every hand-made change lands here, and any of them means the view is no
    // longer the named preset still showing in the picker. Installing a preset
    // does not clear it: that goes through applyState, which holds `restoring`
    // and returns above.
    if (presetSel) presetSel.value = "";
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 250);
  }

  function persist() {
    lastHash = serialize();
    try {
      history.replaceState(null, "", "#" + lastHash);
    } catch {
      location.hash = lastHash;   // file:// and some sandboxes reject replaceState
    }
    try {
      localStorage.setItem(STORE_KEY, lastHash);
    } catch {
      /* private mode / storage disabled: the URL hash is still the source of truth */
    }
  }

  window.addEventListener("hashchange", () => {
    const h = location.hash.slice(1);
    if (h && h !== lastHash) {
      lastHash = h;
      applyState(deserialize(h));
    }
  });

  // Restore: an explicit URL wins over the last local session.
  (function restore() {
    const fromHash = location.hash.slice(1);
    let stored = "";
    try { stored = localStorage.getItem(STORE_KEY) || ""; } catch { /* ignore */ }
    const source = fromHash || stored;
    if (!applyState(deserialize(source))) applyMode(state.mode, false);
    persist();
  })();

  // ---------- Named presets ----------
  // Filled after restore(), so the picker starts on its placeholder rather than
  // claiming the restored view is the first preset in the list.
  if (presetSel) {
    NAMED_PRESETS.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = p.name;
      presetSel.appendChild(opt);
    });
    presetSel.addEventListener("change", e => {
      const p = NAMED_PRESETS[parseInt(e.target.value, 10)];
      if (!p) return;
      applyState(deserialize(p.s));
      timeAccum = p.t || 0;
      markDirty();
      persist();
    });
  }

  // ---------- Interaction: drag, pinch, wheel, dblclick ----------
  // Screen mapping mirrors the shader: uv = (frag - 0.5*res)/min(res) - pan,
  // so pan is expressed in screen units and moves the image 1:1 with the
  // cursor, independent of zoom and rotation.
  function minSide() {
    return Math.min(canvas.clientWidth || window.innerWidth,
                    canvas.clientHeight || window.innerHeight);
  }

  function clientToUV(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const m = minSide();
    return [
       (clientX - rect.left - rect.width  * 0.5) / m,
      -(clientY - rect.top  - rect.height * 0.5) / m,   // GL y points up
    ];
  }

  function panBy(dxClient, dyClient) {
    const m = minSide();
    state.pan[0] += dxClient / m;
    state.pan[1] -= dyClient / m;
    touchInput();
    markDirty();
  }

  // Zoom anchored on a screen point: keeps the scene under (clientX, clientY) fixed.
  function zoomAt(clientX, clientY, factor) {
    touchInput();
    const z0 = state.zoom;
    setControl("zoom", clamp(z0 * factor, ZOOM_MIN, ZOOM_MAX).toFixed(2));
    const z1 = state.zoom;             // value after the slider's own step snapping
    if (z1 === z0) return;
    const [ux, uy] = clientToUV(clientX, clientY);
    const k = z0 / z1;
    state.pan[0] = ux - k * (ux - state.pan[0]);
    state.pan[1] = uy - k * (uy - state.pan[1]);
    markDirty();
  }

  const pointers = new Map();
  let pinch = null;

  function refreshPinch() {
    const pts = [...pointers.values()];
    if (pts.length < 2) { pinch = null; return null; }
    const [a, b] = pts;
    return {
      dist: Math.hypot(b.x - a.x, b.y - a.y),
      mx: (a.x + b.x) * 0.5,
      my: (a.y + b.y) * 0.5,
    };
  }

  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = refreshPinch();
  });

  canvas.addEventListener("pointermove", e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pointers.size >= 2) {
      const next = refreshPinch();
      if (pinch && next && pinch.dist > 0 && next.dist > 0) {
        zoomAt(next.mx, next.my, pinch.dist / next.dist);
        panBy(next.mx - pinch.mx, next.my - pinch.my);
      }
      pinch = next;
      return;
    }

    if (e.shiftKey) {
      state.rot += dx * 0.005;
      touchInput();
      markDirty();
    } else {
      panBy(dx, dy);
    }
  });

  const endPointer = e => {
    pointers.delete(e.pointerId);
    pinch = refreshPinch();
    if (!pointers.size) schedulePersist();
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("lostpointercapture", endPointer);

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * lines * 0.001));
    schedulePersist();
  }, { passive: false });

  canvas.addEventListener("dblclick", () => {
    if (!document.fullscreenElement) canvas.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  // ---------- Render loop ----------
  function render() {
    if (!ready || !dirty) return false;
    gl.uniform2f(U.resolution, canvas.width, canvas.height);
    gl.uniform1f(U.time,       timeAccum);
    gl.uniform1f(U.symmetry,   state.symmetry);
    gl.uniform1f(U.zoom,       state.zoom);
    gl.uniform1f(U.iterations, state.iterations);
    gl.uniform1f(U.complexity, state.complexity);
    gl.uniform1f(U.bloom,      state.bloom);
    gl.uniform1f(U.palette,    state.palette);
    gl.uniform1f(U.mode,       state.mode);
    gl.uniform1f(U.petals,     state.petals);
    gl.uniform2f(U.pan,        state.pan[0], state.pan[1]);
    gl.uniform1f(U.rot,        state.rot);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    dirty = false;
    return true;
  }

  // rAF deltas are the only honest measure of cost here: drawArrays returns long
  // before the GPU is done, so the wall time until the next frame is what says
  // whether the last one fit the budget. Frames that drew nothing say nothing.
  //
  // The thresholds are relative to the display, not absolute: under vsync a
  // healthy frame lands *exactly* on the refresh interval, so no fixed "fast"
  // number could ever be met on a 60 Hz panel and the scale would only ever go
  // down. The budget is the shortest interval seen, floored at 11 ms so a
  // 144 Hz panel doesn't drag the resolution down chasing 144 fps.
  let emaDt = 16.7, vsyncMs = 16.7, drewLast = false, scaleHold = 0;

  function adapt(now, dtMs) {
    if (dtMs > 4 && dtMs < vsyncMs) vsyncMs += (dtMs - vsyncMs) * 0.5;
    const budget = Math.max(vsyncMs, 11);
    emaDt += (dtMs - emaDt) * 0.12;
    if (now < scaleHold) return;
    if (emaDt > budget * 1.45 && renderScale > SCALE_MIN) {
      renderScale = Math.max(SCALE_MIN, renderScale - 0.15);
      scaleHold = now + 500;
    } else if (emaDt < budget * 1.12 && renderScale < 1) {
      // Slower on the way up: overshooting costs a visible stutter, and a still
      // frame is drawn at full resolution anyway.
      renderScale = Math.min(1, renderScale + 0.1);
      scaleHold = now + 900;
    }
  }

  function frame(now) {
    const dtMs = Math.min(now - lastFrame, 100);   // a backgrounded tab must not jump the clock
    lastFrame = now;

    // speed 0 is a still image, not a slow animation: without this the loop
    // would redraw an identical frame 60 times a second (modes 7-9 live there).
    const animating = !state.paused && state.speed !== 0;
    if (animating) {
      timeAccum += dtMs * 0.001 * state.speed;
      dirty = true;
    }

    const moving = animating || now < interactUntil;
    // Going idle resets the average to "healthy": the frames spent doing
    // nothing must not count as either cheap or expensive when motion resumes.
    if (moving && drewLast) adapt(now, dtMs);
    else if (!moving) emaDt = Math.max(vsyncMs, 11);

    setBuffer(moving ? renderScale : 1);
    drewLast = render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
