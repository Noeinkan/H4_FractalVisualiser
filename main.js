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
  const MODE_ITER_MAX = { 0: 16, 1: 10, 2: 7, 3: 12, 4: 8, 5: 8, 6: 8, 7: 10, 8: 8 };

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
    6: { symmetry:  8, iterations: 6,  complexity: 1.00, zoom: 1.4, palette: 5, petals: 6 },
    7: { symmetry:  6, iterations: 8,  complexity: 1.05, zoom: 1.3, palette: 5, petals: 5 },
    // Henna is a poster, not an animation: speed 0 so the plate stays put,
    // and a zoom wide enough to hold all eight bands (outermost r ~ 1.6).
    8: { symmetry:  8, iterations: 8,  complexity: 1.00, zoom: 3.2, palette: 0, petals: 6, speed: 0 },
  };

  let timeAccum = 0;
  let lastFrame = performance.now();
  let dirty     = true;
  const markDirty = () => { dirty = true; };

  // ---------- Resize ----------
  function resize(force) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(window.innerWidth  * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (force || canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      markDirty();
    }
  }
  window.addEventListener("resize", resize);
  resize(true);

  // ---------- UI bindings ----------
  const $ = id => document.getElementById(id);

  let restoring = false;   // suppresses preset application + URL writes while loading state
  let persistTimer = 0;    // declared here: bindRange's initial update() already persists
  let lastHash = "";

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
    el.addEventListener("input", update);
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

  function saveScreenshot() {
    if (!ready) return;
    // Draw and snapshot within the same task: without preserveDrawingBuffer the
    // backbuffer is only guaranteed valid until the browser composites.
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
    if ("m" in o) applyMode(clamp(Math.round(o.m), 0, 8), false);
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
    markDirty();
  }

  // Zoom anchored on a screen point: keeps the scene under (clientX, clientY) fixed.
  function zoomAt(clientX, clientY, factor) {
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
    if (!ready || !dirty) return;
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
  }

  function frame(now) {
    const dt = (now - lastFrame) * 0.001;
    lastFrame = now;
    if (!state.paused) {
      timeAccum += dt * state.speed;
      dirty = true;
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
