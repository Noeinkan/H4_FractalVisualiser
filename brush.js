// Hand drawing for mode 10, «Pennello», after P_2_3_4_01 in Generative
// Gestaltung: while you drag, a module is stretched between the pointer and a
// point that chases it by a fixed step every frame, so a fast hand leaves long
// modules and a slow one short ones. Once drawn, a stroke stays put.
//
// This is the one part of the app with memory. Every other mode is a pure
// function of the permalink; a drawing is a list of pointer paths, far too long
// for a URL, so the paths live in localStorage and nothing else is kept. The
// stamps are derived from them, which is why a slider that changes the step
// redraws the whole drawing as if it had been made that way.
//
// The stamps are drawn with a GL program of their own into a texture that
// keeps what is already there: a frame of drawing costs only its new stamps,
// and the whole list is replayed only when the view or the look changes.
//
// Classic script, no module: the app must keep opening from file://.
(function () {
  "use strict";

  const STORE_KEY = "fractal-mandala-drawing-v1";
  const PER_VERT  = 8;        // tip.xy, anchor.xy, corner.xy, z, kind
  const STEP      = 0.0012;   // chase step per unit of «Passo», in view units
  const WIDTH     = 0.025;    // module width per unit of «Larghezza», in view units
  const VEIL_GAP  = 0.9;      // each further veil chases with a step this much longer
  const ROUND     = 1e5;      // samples kept to five decimals, live and stored alike

  const STAMP = 0, TRAIL = 1, BEAD = 2;
  const CORNERS = [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1];

  // View units are fractions of the short side of the window, the unit the
  // hand feels. A stroke remembers the zoom it was drawn at (z) and every size
  // below is multiplied by it, so a drawing made zoomed in is not coarser.
  const VERT = `
    precision highp float;

    attribute vec2  a_tip;
    attribute vec2  a_anchor;
    attribute vec2  a_corner;
    attribute float a_z;
    attribute float a_kind;

    uniform vec2  u_resolution;
    uniform vec2  u_pan;
    uniform float u_zoom;
    uniform float u_rot;
    uniform float u_px;
    uniform float u_width;

    varying vec2  v_q;
    varying float v_d;
    varying float v_w;
    varying float v_lw;
    varying float v_kind;

    void main() {
      // Hairline half width in the stroke's own units: zooming into a finished
      // drawing thickens its lines as it would any vector drawing, and an
      // export at 4096 px keeps the weight the window showed.
      float lw = 0.0005 * a_z;
      float W  = u_width * a_z;
      vec2  dv = a_anchor - a_tip;
      float d  = length(dv);
      vec2  ex = d > 1e-7 ? dv / d : vec2(1.0, 0.0);
      vec2  ey = vec2(-ex.y, ex.x);
      float m  = 3.0 * lw + 1.5 * u_px;

      // The quad each kind needs, in the frame of its chord: a module spans
      // the chord and the width on one side of it, a trail segment hugs its
      // chord, a bead sits on its point.
      vec2 lo;
      vec2 hi;
      if (a_kind < 0.5)      { lo = vec2(-m, -0.5 * W - m); hi = vec2(d + m, W + m); }
      else if (a_kind < 1.5) { lo = vec2(-m);               hi = vec2(d + m, m); }
      else                   { lo = vec2(-m);               hi = vec2(m); }

      vec2 q = mix(lo, hi, a_corner);
      vec2 p = a_tip + ex * q.x + ey * q.y;

      // Scene to clip: the uv mapping of main() in shader.js, run backwards,
      // without its clock turn (mode 10 keeps the clock still).
      float c = cos(u_rot), s = sin(u_rot);
      vec2 view = vec2(c * p.x - s * p.y, s * p.x + c * p.y) / u_zoom + u_pan;
      vec2 frag = view * min(u_resolution.x, u_resolution.y) + 0.5 * u_resolution;
      gl_Position = vec4(frag / u_resolution * 2.0 - 1.0, 0.0, 1.0);

      v_q = q;
      v_d = d;
      v_w = W;
      v_lw = lw;
      v_kind = a_kind;
    }
  `;

  const frag = shader => `
    precision highp float;

    uniform float u_px;
    uniform float u_module;
    uniform float u_alpha;
    uniform float u_palette;
    uniform float u_hue;
    uniform float u_sat;

    varying vec2  v_q;
    varying float v_d;
    varying float v_w;
    varying float v_lw;
    varying float v_kind;

    ${shader.INK}
    ${shader.TRIM}

    // Box-filtered hairline: below a pixel it gets fainter rather than
    // thicker, which is what lets thousands of them build up a veil.
    float cover(float d, float w) {
      d = abs(d);
      return clamp((min(w, d + 0.5 * u_px) - max(-w, d - 0.5 * u_px)) / u_px, 0.0, 1.0);
    }
    float solid(float d) { return clamp(0.5 - d / u_px, 0.0, 1.0); }

    // First-order ellipse distance: exact enough where a hairline sits.
    float sdEllipseEst(vec2 p, vec2 r) {
      float k0 = length(p / r);
      float k1 = length(p / (r * r));
      return k1 > 1e-9 ? k0 * (k0 - 1.0) / k1 : -min(r.x, r.y);
    }

    void main() {
      Ink   ink = inkPalette(u_palette);
      vec2  q   = v_q;
      float d   = v_d;
      float W   = v_w;
      float lw  = v_lw;

      if (v_kind > 0.5) {
        // The pointer's own path, beaded wherever the first chaser stamped:
        // the thread that runs through the veils.
        float a = v_kind > 1.5
          ? solid(length(q) - 2.6 * lw)
          : cover(length(vec2(q.x - clamp(q.x, 0.0, d), q.y)), 1.2 * lw);
        a *= 0.9;
        vec3 c = max(trim(ink.c1, u_hue, u_sat), 0.0);
        gl_FragColor = vec4(c * a, a);
        return;
      }

      // One module, in the frame the sketch draws its SVG in: q.x from the
      // tip (0) to the chaser (d), q.y across the width W on one side of the
      // chord. The order is the sketch's 01-09.svg, and it is the hash key o.
      float mi = floor(u_module + 0.5);
      float h  = 0.5 * d;
      float sd;
      float filled = 0.0;
      if (mi < 0.5) {
        // 01 - ellipse riding on the chord
        sd = sdEllipseEst(q - vec2(h, 0.0), vec2(h, 0.5 * W));
      } else if (mi < 2.5) {
        // 02, 03 - ellipse beside the chord, filled or open
        sd = sdEllipseEst(q - vec2(h, 0.5 * W), vec2(h, 0.5 * W));
        filled = step(mi, 1.5);
      } else if (mi < 4.5) {
        // 04, 05 - triangle standing on the chord, open or filled
        vec2 e = vec2(abs(q.x - h), q.y);
        sd = max(-q.y, (e.x * W + e.y * h - h * W) / length(vec2(W, h)));
        filled = step(3.5, mi);
      } else if (mi < 7.5) {
        // 06, 07, 08 - one, five or nine rungs, an eighth of the chord apart
        float n = mi < 5.5 ? 0.0 : (mi < 6.5 ? 2.0 : 4.0);
        float k = clamp(floor((q.x / d - 0.5) * 8.0 + 0.5), -n, n);
        sd = length(vec2(q.x - d * (0.5 + k * 0.125), q.y - clamp(q.y, 0.0, W)));
      } else {
        // 09 - a T: the chord and the middle rung
        sd = min(length(vec2(q.x - clamp(q.x, 0.0, d), q.y)),
                 length(vec2(q.x - h, q.y - clamp(q.y, 0.0, W))));
      }

      vec3  line  = max(trim(ink.line,  u_hue, u_sat), 0.0);
      vec3  paper = max(trim(ink.paper, u_hue, u_sat), 0.0);
      float a     = cover(sd, lw) * u_alpha;
      float fc    = filled * solid(sd);
      // Premultiplied, and in one fragment: the paper fill first, the line
      // over it. A filled module covers what was drawn before; that is how a
      // dense run of them turns into scales.
      gl_FragColor = vec4(paper * fc * (1.0 - a) + line * a, 1.0 - (1.0 - fc) * (1.0 - a));
    }
  `;

  const BLIT_VERT = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;
  const BLIT_FRAG = `
    precision highp float;
    uniform sampler2D u_tex;
    uniform vec2 u_res;
    void main() { gl_FragColor = texture2D(u_tex, gl_FragCoord.xy / u_res); }
  `;

  const q5 = v => Math.round(v * ROUND) / ROUND;

  function create(ctx) {
    const { gl, shader, showNotice } = ctx;

    // ---------- Strokes ----------
    let strokes = readStrokes();   // [{ z, p: [x0, y0, x1, y1, ...] }] in scene units
    const undoOps = [];            // this session only: "add" or { cleared }
    let live = null;               // { stroke, gen } while the pointer is down
    let target = null;             // where the pointer is now, scene units

    let params = { step: 4, veils: 1 };
    let built = false;   // strokes read from storage have no geometry until the first render

    // ---------- Geometry, derived from the strokes ----------
    let verts = new Float32Array(1 << 16);
    let nv = 0;          // vertices generated
    let rev = 0;         // bumps when the geometry is rebuilt rather than grown

    function push(x0, y0, x1, y1, z, kind) {
      if ((nv + 6) * PER_VERT > verts.length) {
        const next = new Float32Array(verts.length * 2);
        next.set(verts);
        verts = next;
      }
      let o = nv * PER_VERT;
      for (let i = 0; i < 12; i += 2) {
        verts[o++] = x0; verts[o++] = y0;
        verts[o++] = x1; verts[o++] = y1;
        verts[o++] = CORNERS[i]; verts[o++] = CORNERS[i + 1];
        verts[o++] = z;  verts[o++] = kind;
      }
      nv += 6;
    }

    // The sketch's draw(), one call per frame of dragging. It only ever sees
    // samples, never the pointer, so a stroke replays from what was stored
    // exactly as it was drawn. Extra veils are extra chasers with longer steps.
    function startGen(z, x, y) {
      const anchors = [];
      for (let j = 0; j < params.veils; j++) anchors.push([x, y]);
      return { z, anchors, px: x, py: y };
    }

    const stepOf = (g, j) => params.step * STEP * g.z * (1 + VEIL_GAP * j);

    function feed(g, x, y) {
      let stamped = false;
      for (let j = 0; j < g.anchors.length; j++) {
        const a = g.anchors[j];
        const step = stepOf(g, j);
        const dx = x - a[0], dy = y - a[1];
        const d = Math.hypot(dx, dy);
        if (d > step) {
          push(x, y, a[0], a[1], g.z, STAMP);
          a[0] += dx / d * step;
          a[1] += dy / d * step;
          if (j === 0) stamped = true;
        }
      }
      if (x !== g.px || y !== g.py) push(g.px, g.py, x, y, g.z, TRAIL);
      if (stamped) push(x, y, x, y, g.z, BEAD);
      g.px = x;
      g.py = y;
    }

    // A pointer held still keeps stamping, as in the sketch, until every
    // chaser has arrived; after that a still frame adds nothing to store.
    const catching = (g, x, y) =>
      g.anchors.some((a, j) => Math.hypot(x - a[0], y - a[1]) > stepOf(g, j));

    function replay(s) {
      const p = s.p;
      const g = startGen(s.z, p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) feed(g, p[i], p[i + 1]);
      return g;
    }

    function rebuild() {
      nv = 0;
      uploaded = 0;
      rev++;
      for (const s of strokes) {
        const g = replay(s);
        if (live && live.stroke === s) live.gen = g;
      }
    }

    // ---------- Input ----------
    function begin(x, y, z) {
      x = q5(x);
      y = q5(y);
      const stroke = { z: q5(z), p: [x, y] };
      strokes.push(stroke);
      live = { stroke, gen: startGen(stroke.z, x, y) };
      target = [x, y];
    }

    function moveTo(x, y) {
      if (live) target = [q5(x), q5(y)];
    }

    // Called once per animation frame; true when it made something to draw.
    function tick() {
      if (!live) return false;
      const [x, y] = target;
      const g = live.gen;
      if (x === g.px && y === g.py && !catching(g, x, y)) return false;
      live.stroke.p.push(x, y);
      const before = nv;
      feed(g, x, y);
      return nv !== before;
    }

    function end() {
      if (!live) return;
      const s = live.stroke;
      live = null;
      // A click with no movement left no geometry, so nothing to rebuild.
      if (s.p.length <= 2) { strokes.pop(); return; }
      undoOps.push("add");
      save();
    }

    function undo() {
      if (live) return false;
      const op = undoOps.pop();
      if (op && op.cleared) strokes = op.cleared;
      else if (strokes.length) strokes.pop();   // this session's, or one stored before it
      else return false;
      rebuild();
      save();
      return true;
    }

    function clear() {
      if (live || !strokes.length) return false;
      undoOps.push({ cleared: strokes });
      strokes = [];
      rebuild();
      save();
      return true;
    }

    // ---------- Persistence ----------
    function readStrokes() {
      try {
        const o = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
        if (!o || o.v !== 1 || !Array.isArray(o.strokes)) return [];
        return o.strokes.filter(s =>
          s && Number.isFinite(s.z) && Array.isArray(s.p) &&
          s.p.length >= 4 && s.p.length % 2 === 0 && s.p.every(Number.isFinite));
      } catch {
        return [];   // private mode, disabled storage, or a corrupt entry
      }
    }

    let warned = false;
    function save() {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, strokes }));
      } catch {
        // Over the quota: the drawing is still on screen and still exports,
        // it just will not survive a reload. Say so once, not every stroke.
        if (!warned) {
          warned = true;
          showNotice("Il disegno è troppo grande per restare salvato nel browser: " +
                     "esporta il PNG prima di ricaricare.", { timeout: 7000 });
        }
      }
    }

    // ---------- GL ----------
    let ready = false;
    let stampProg = null, blitProg = null;
    let vbo = null, quad = null, fbo = null, tex = null;
    let texW = 0, texH = 0, cacheOk = false, maxTex = 0;
    let gpuCap = 0, uploaded = 0;
    let cacheKey = "", cacheRev = -1, drawn = 0;
    const A = {}, U = {}, B = {};

    function compile(type, src) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[brush shader]", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    }

    function link(vsSrc, fsSrc) {
      const vs = compile(gl.VERTEX_SHADER, vsSrc);
      const fs = vs && compile(gl.FRAGMENT_SHADER, fsSrc);
      if (!vs || !fs) return null;
      const p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("[brush program]", gl.getProgramInfoLog(p));
        return null;
      }
      return p;
    }

    // Also the context-restore path: everything on the GPU is gone, the
    // strokes and their geometry in JS are not.
    function buildGL() {
      ready = false;
      stampProg = link(VERT, frag(shader));
      blitProg  = link(BLIT_VERT, BLIT_FRAG);
      if (!stampProg || !blitProg) {
        showNotice("Il pennello non si è compilato su questa GPU: la modalità 10 " +
                   "mostra solo la carta. Dettagli nella console.", { timeout: 8000 });
        return false;
      }
      for (const n of ["tip", "anchor", "corner", "z", "kind"]) {
        A[n] = gl.getAttribLocation(stampProg, "a_" + n);
      }
      for (const n of ["resolution", "pan", "zoom", "rot", "px", "width",
                       "module", "alpha", "palette", "hue", "sat"]) {
        U[n] = gl.getUniformLocation(stampProg, "u_" + n);
      }
      B.pos = gl.getAttribLocation(blitProg, "a_pos");
      B.tex = gl.getUniformLocation(blitProg, "u_tex");
      B.res = gl.getUniformLocation(blitProg, "u_res");

      vbo = gl.createBuffer();
      gpuCap = 0;
      uploaded = 0;
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      fbo = gl.createFramebuffer();
      tex = null;
      texW = texH = 0;
      cacheKey = "";
      maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
      ready = true;
      return true;
    }

    function upload() {
      if (uploaded === nv) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      if (nv > gpuCap) {
        gpuCap = Math.max(nv * 2, 1 << 14);
        gl.bufferData(gl.ARRAY_BUFFER, gpuCap * PER_VERT * 4, gl.DYNAMIC_DRAW);
        uploaded = 0;
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, uploaded * PER_VERT * 4,
                       verts.subarray(uploaded * PER_VERT, nv * PER_VERT));
      uploaded = nv;
    }

    // The texture that keeps the drawing between frames. If this GPU will not
    // give one of this size (a large export), the stamps go straight onto the
    // paper instead: slower, same picture.
    function ensureCache(w, h) {
      if (w > maxTex || h > maxTex) return false;
      if (tex && texW === w && texH === h) return cacheOk;
      if (tex) gl.deleteTexture(tex);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      cacheOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      texW = w;
      texH = h;
      cacheKey = "";
      return cacheOk;
    }

    function attrib(loc, size, offset) {
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, PER_VERT * 4, offset);
    }

    function drawStamps(from, to, v) {
      gl.useProgram(stampProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      attrib(A.tip, 2, 0);
      attrib(A.anchor, 2, 8);
      attrib(A.corner, 2, 16);
      attrib(A.z, 1, 24);
      attrib(A.kind, 1, 28);
      gl.uniform2f(U.resolution, v.width, v.height);
      gl.uniform2f(U.pan, v.pan[0], v.pan[1]);
      gl.uniform1f(U.zoom, v.zoom);
      gl.uniform1f(U.rot, v.rot);
      gl.uniform1f(U.px, v.zoom / Math.min(v.width, v.height));
      gl.uniform1f(U.width, WIDTH * v.size);
      gl.uniform1f(U.module, v.module);
      gl.uniform1f(U.alpha, v.alpha);
      gl.uniform1f(U.palette, v.palette);
      gl.uniform1f(U.hue, v.hue);
      gl.uniform1f(U.sat, v.sat);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, from, to - from);
      gl.disable(gl.BLEND);
      // main.js binds its own attribute every frame; leaving these enabled
      // would make its draw read past the end of its buffer.
      for (const n in A) if (A[n] >= 0) gl.disableVertexAttribArray(A[n]);
    }

    function blit(w, h) {
      gl.useProgram(blitProg);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(B.pos);
      gl.vertexAttribPointer(B.pos, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(B.tex, 0);
      gl.uniform2f(B.res, w, h);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      gl.disableVertexAttribArray(B.pos);
    }

    // Draws the drawing over whatever main.js has just painted (the paper).
    // v: width, height, pan, zoom, rot, size, module, alpha, palette, hue, sat,
    // step, veils.
    function render(v) {
      if (!ready) return;
      if (!built || v.step !== params.step || v.veils !== params.veils) {
        built = true;
        params = { step: v.step, veils: v.veils };
        rebuild();
      }
      upload();
      if (!nv) return;

      if (!ensureCache(v.width, v.height)) {
        drawStamps(0, nv, v);
        return;
      }
      const key = [v.width, v.height, v.pan[0], v.pan[1], v.zoom, v.rot, v.size,
                   v.module, v.alpha, v.palette, v.hue, v.sat].join("|");
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      if (key !== cacheKey || cacheRev !== rev) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        cacheKey = key;
        cacheRev = rev;
        drawn = 0;
      }
      if (drawn < nv) drawStamps(drawn, nv, v);
      drawn = nv;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      blit(v.width, v.height);
    }

    return {
      buildGL, render, begin, moveTo, tick, end, undo, clear,
      isDrawing: () => !!live,
      count: () => strokes.length,
    };
  }

  window.FRACTAL_BRUSH = { create };
})();
