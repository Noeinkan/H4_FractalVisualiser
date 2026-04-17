(() => {
  "use strict";

  const canvas = document.getElementById("gl");
  const gl = canvas.getContext("webgl", { antialias: false, preserveDrawingBuffer: true });

  if (!gl) {
    document.body.innerHTML =
      '<p style="color:#fff;font-family:sans-serif;padding:2rem">WebGL non supportato in questo browser.</p>';
    return;
  }

  // ---------- Shaders ----------
  const VERT = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;

    uniform vec2  u_resolution;
    uniform float u_time;
    uniform float u_symmetry;
    uniform float u_zoom;
    uniform float u_iterations;
    uniform float u_complexity;
    uniform float u_detail;
    uniform float u_bloom;
    uniform float u_palette;
    uniform float u_mode;
    uniform float u_petals;
    uniform vec2  u_pan;
    uniform float u_rot;

    #define PI  3.14159265359
    #define TAU 6.28318530718

    mat2 rot(float a) {
      float c = cos(a), s = sin(a);
      return mat2(c, -s, s, c);
    }

    // N-fold kaleidoscope fold (mirrored)
    vec2 kaleido(vec2 p, float n) {
      float r = length(p);
      float a = atan(p.y, p.x);
      float seg = TAU / max(n, 1.0);
      a = mod(a + seg * 0.5, seg) - seg * 0.5;
      a = abs(a);
      return vec2(cos(a), sin(a)) * r;
    }

    // Signed distance to a rose / flower with k petals
    float sdRose(vec2 p, float k) {
      float a = atan(p.y, p.x);
      float r = length(p);
      float petal = 0.30 + 0.22 * abs(cos(a * k * 0.5));
      return r - petal;
    }

    // Regular N-gon SDF (centered)
    float sdPolygon(vec2 p, float n, float R) {
      float a = atan(p.y, p.x) + PI;
      float seg = TAU / n;
      a = mod(a + seg * 0.5, seg) - seg * 0.5;
      return cos(a) * length(p) - R;
    }

    // Star SDF: two rotated polygons intersection trick
    float sdStar(vec2 p, float n, float R) {
      float a = sdPolygon(p, n, R);
      float b = sdPolygon(rot(PI / n) * p, n, R);
      return max(a, -b * 0.75);
    }

    // ---- Palettes ----
    vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
      return a + b * cos(TAU * (c * t + d));
    }
    vec3 pickPalette(float idx, float t) {
      if (idx < 0.5) {
        // Persian Blue
        return pal(t, vec3(0.08,0.12,0.28), vec3(0.45,0.55,0.75), vec3(1.0), vec3(0.00,0.15,0.30));
      } else if (idx < 1.5) {
        // Azulejo
        return pal(t, vec3(0.20,0.30,0.55), vec3(0.55,0.50,0.45), vec3(1.0), vec3(0.00,0.10,0.20));
      } else if (idx < 2.5) {
        // Gold & Cobalt
        return pal(t, vec3(0.30,0.25,0.35), vec3(0.55,0.45,0.25), vec3(1.0), vec3(0.00,0.20,0.55));
      } else if (idx < 3.5) {
        // Turquoise Night
        return pal(t, vec3(0.02,0.08,0.15), vec3(0.20,0.55,0.65), vec3(1.0), vec3(0.25,0.40,0.55));
      } else if (idx < 4.5) {
        // Monochrome Ink
        float v = 0.5 + 0.5 * cos(TAU * t);
        return vec3(v) * vec3(0.85, 0.90, 1.00);
      } else if (idx < 5.5) {
        // Isfahan Gold: cobalto profondo + esplosioni oro/giallo
        return pal(t, vec3(0.05,0.10,0.35), vec3(0.90,0.70,0.15), vec3(1.0,1.0,0.8), vec3(0.10,0.30,0.75));
      } else if (idx < 6.5) {
        // Lapis Lazuli: blu oltremare + turchese + bianco
        return pal(t, vec3(0.10,0.15,0.45), vec3(0.35,0.45,0.55), vec3(1.0), vec3(0.40,0.55,0.65));
      } else {
        // Emerald Garden: verdi smeraldo + oro
        return pal(t, vec3(0.05,0.25,0.20), vec3(0.45,0.55,0.35), vec3(1.0), vec3(0.30,0.20,0.60));
      }
    }

    // =================================================================
    //  MODE 0 — Kaleidoscopic IFS (folds + inversion)
    // =================================================================
    vec3 modeKaleido(vec2 uv, float t) {
      vec2 p = kaleido(uv, u_symmetry);
      float trap = 1e9, glow = 0.0, acc = 0.0;

      for (int i = 0; i < 16; i++) {
        if (float(i) >= u_iterations) break;
        p = abs(p) - 0.5 * u_complexity *
            vec2(0.9 + 0.1 * sin(t * 0.3 + float(i)),
                 0.9 + 0.1 * cos(t * 0.25 + float(i) * 1.3));
        float r2 = dot(p, p);
        p = p / max(r2, 0.04) * u_complexity;
        p = kaleido(p, u_symmetry);
        p = rot(0.15 + 0.05 * sin(t * 0.2)) * p;

        float d = abs(min(p.x, p.y));
        trap = min(trap, d);
        glow += exp(-8.0 * d) * 0.5;
        acc  += 1.0 / (1.0 + r2 * 4.0);
      }

      float edge = smoothstep(0.02 / u_detail, 0.0, trap);
      float field = acc / u_iterations;
      float lum = field * 0.6 + glow * 0.15 * u_bloom + edge * 0.35;
      vec3 base = pickPalette(u_palette, field * 0.9 + t * 0.05);
      vec3 accent = vec3(1.0, 0.82, 0.45);
      return mix(base * lum, accent, edge * 0.45 * smoothstep(0.0, 1.2, lum));
    }

    // =================================================================
    //  MODE 1 — Floral Garden (arabesque / islimi)
    // =================================================================
    vec3 modeFloral(vec2 uv, float t) {
      vec2 p = kaleido(uv, u_symmetry);
      // push away from center so flowers scatter
      p = rot(0.2 * sin(t * 0.3)) * p;

      float d = 1e9;
      float stemD = 1e9;
      float scale = 1.0;

      for (int i = 0; i < 10; i++) {
        if (float(i) >= u_iterations) break;
        float fi = float(i);

        // flower SDF at this scale, with animated petal count
        float petals = u_petals + sin(t * 0.3 + fi) * 1.5;
        float fd = sdRose(p, petals) * scale;
        d = min(d, fd);

        // stem / vine: distance to a wavy line along bisector
        float stem = abs(p.y + 0.05 * sin(p.x * 6.0 + t + fi)) * scale;
        stemD = min(stemD, stem);

        // fractal step: fold, scale, kaleidoscope
        p = abs(p) - 0.45 * u_complexity;
        p = rot(0.35 + 0.08 * sin(t * 0.2 + fi)) * p;
        p = kaleido(p, u_symmetry);
        float s = 1.35 * u_complexity;
        p *= s;
        scale /= s;
      }

      // rim of flowers (anti-aliased)
      float aa = 1.5 / u_resolution.y;
      float petalMask = smoothstep(0.02 / u_detail + aa, -aa, d);
      float stemMask  = smoothstep(0.012 / u_detail + aa, -aa, stemD - 0.008);

      // base radial background
      float r = length(uv);
      float bg = 0.4 + 0.2 * cos(r * 6.0 - t * 0.5);
      vec3 bgCol = pickPalette(u_palette, 0.15 + bg * 0.2);

      // petal color: palette driven by radial distance
      vec3 petalCol = pickPalette(u_palette, 0.6 + 0.3 * sin(r * 3.0 - t * 0.3));
      vec3 stemCol  = vec3(0.20, 0.55, 0.35);   // arabesque green
      vec3 goldCol  = vec3(1.0, 0.82, 0.35);

      vec3 col = bgCol * 0.4;
      col = mix(col, stemCol, stemMask * 0.85);
      col = mix(col, petalCol, petalMask);
      // gold outline on petal edges
      float outline = smoothstep(0.04 / u_detail, 0.01 / u_detail, abs(d));
      col = mix(col, goldCol, outline * 0.35 * u_bloom);
      return col;
    }

    // =================================================================
    //  MODE 2 — Girih Stars (stellar tessellation)
    // =================================================================
    vec3 modeGirih(vec2 uv, float t) {
      // hexagonal-ish radial lattice via kaleidoscope + radial repeat
      vec2 p = uv;
      p = rot(t * 0.05) * p;

      // radial rings
      float r = length(p);
      float ringW = 0.35;
      float ring = floor(r / ringW);
      float rInRing = fract(r / ringW);

      // fold per ring into tile
      p = kaleido(p, u_symmetry * (1.0 + 0.0 * ring));

      // in-tile position
      float a = atan(p.y, p.x);
      float seg = TAU / u_symmetry;
      vec2 local = vec2(cos(a - seg*0.5), sin(a - seg*0.5)) * (rInRing - 0.5) * ringW;

      // star at tile center
      float R = 0.12 + 0.04 * sin(t * 0.3 + ring);
      float star = sdStar(local * 4.0, u_symmetry, R * 4.0) * 0.25;

      // polygon frame
      float poly = sdPolygon(local * 4.0, u_symmetry, (R + 0.12) * 4.0) * 0.25;

      // interlacing line
      float line = abs(poly) - 0.01 / u_detail;

      float starMask = smoothstep(0.01, -0.01, star);
      float lineMask = smoothstep(0.005, -0.005, line);

      // iterate: nested smaller stars
      vec2 q = local;
      float nested = 1e9;
      for (int i = 0; i < 6; i++) {
        if (float(i) >= u_iterations - 1.0) break;
        q = abs(q) - 0.08 * u_complexity;
        q = rot(PI / u_symmetry) * q;
        nested = min(nested, sdStar(q * 8.0, u_symmetry, 0.3) * 0.125);
      }
      float nestedMask = smoothstep(0.005, -0.005, nested);

      vec3 base   = pickPalette(u_palette, 0.1 + ring * 0.1 + t * 0.03);
      vec3 starC  = pickPalette(u_palette, 0.65 + t * 0.05);
      vec3 goldC  = vec3(1.0, 0.85, 0.4);

      vec3 col = base * 0.35;
      col = mix(col, starC, starMask);
      col = mix(col, goldC, lineMask * 0.9);
      col = mix(col, goldC * 0.8, nestedMask * 0.6);
      return col;
    }

    // =================================================================
    //  MODE 3 — Julia Bloom (Julia set through kaleidoscope)
    // =================================================================
    vec3 modeJulia(vec2 uv, float t) {
      // kaleidoscopic pre-map
      vec2 z = kaleido(uv, u_symmetry) * 1.3;
      // animated Julia seed on a gentle orbit
      vec2 c = vec2(0.36 + 0.1 * cos(t * 0.15),
                    0.10 + 0.1 * sin(t * 0.22));
      c *= u_complexity * 0.9;

      float iter = 0.0;
      float trap = 1e9;
      for (int i = 0; i < 64; i++) {
        if (float(i) >= u_iterations * 5.0) break;
        // z = z^2 + c, with periodic kaleidoscope for petal-like warp
        z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
        trap = min(trap, length(z - vec2(0.5, 0.0)));
        if (dot(z, z) > 64.0) break;
        iter += 1.0;
      }

      float smoothIter = iter - log2(max(log2(dot(z,z)), 1.0));
      float m = smoothIter / (u_iterations * 5.0);

      vec3 base = pickPalette(u_palette, m + t * 0.05);
      vec3 gold = vec3(1.0, 0.82, 0.35);
      float trapGlow = exp(-trap * 3.0);
      return base * (0.3 + m * 0.7) + gold * trapGlow * 0.4 * u_bloom;
    }

    // =================================================================
    //  MODE 6 — Vault Panels (cross-vault with arched spicchi)
    //  N curved panels radiating from the oculus, each with own pattern
    // =================================================================
    vec3 modeVault(vec2 uv, float t) {
      float r = length(uv);
      float a = atan(uv.y, uv.x);

      // Radial N-fold division (panel id + local angle)
      float N   = u_symmetry;
      float seg = TAU / N;
      float sid = floor((a + seg * 0.5) / seg);
      float la  = mod(a + seg * 0.5, seg) - seg * 0.5;

      // Panel-local coords: tangential distance, radial distance
      vec2 pl = vec2(la * r, r);

      // Pointed arch silhouette inside each panel (two intersecting circles)
      float aw   = 0.28;
      float aR   = 0.78;
      vec2  aoff = vec2(0.0, 0.45);
      float arcL = length(pl - aoff - vec2(-aw, 0.0)) - aR;
      float arcR = length(pl - aoff - vec2( aw, 0.0)) - aR;
      float arch = max(arcL, arcR);
      arch       = max(arch, -pl.y + 0.08);     // floor cut
      arch       = max(arch, r - 1.05);          // clip outside dome

      float insideArch = smoothstep(0.005, -0.005, arch);

      // Fractal floral fill per panel (phase offset for variety)
      vec2  fp    = pl * 3.4 + vec2(sid * 1.37, 0.0);
      float dflor = 1e9;
      float scale = 1.0;
      for (int i = 0; i < 8; i++) {
        if (float(i) >= u_iterations) break;
        fp = abs(fp) - 0.45 * u_complexity;
        fp = rot(0.42 + 0.07 * sin(t * 0.25 + float(i))) * fp;
        fp = kaleido(fp, u_petals);
        fp *= 1.22;
        scale /= 1.22;
        dflor = min(dflor, sdRose(fp, u_petals) * scale);
      }
      float florMask = smoothstep(0.04 / u_detail, -0.04 / u_detail, dflor) * insideArch;

      // Gold seams between panels (angular) + arch outline
      float seamD    = abs(la) * max(r, 0.12);
      float seamMask = smoothstep(0.020, 0.003, seamD);
      float archLine = smoothstep(0.018, 0.002, abs(arch));

      // Central oculus (dark void)
      float oculus = smoothstep(0.18, 0.06, r);

      vec3 bg     = pickPalette(u_palette, 0.08);
      vec3 panelC = pickPalette(u_palette, 0.30 + sid * 0.11 + t * 0.03);
      vec3 florC  = pickPalette(u_palette, 0.65 + 0.1 * sin(sid));
      vec3 gold   = vec3(1.0, 0.82, 0.35);

      vec3 col = bg * 0.30;
      col = mix(col, panelC * 0.55, insideArch);
      col = mix(col, florC,         florMask);
      col += gold * seamMask * 0.65;
      col += gold * archLine * 0.80;
      col *= 1.0 - oculus * 0.92;
      return col;
    }

    // =================================================================
    //  MODE 7 — Mihrab (pointed-arch niche with dense islimi vines)
    // =================================================================
    vec3 modeMihrab(vec2 uv, float t) {
      vec2 p = uv;
      p.y -= 0.10;

      // Pointed arch SDF
      float aw   = 0.36;
      float aR   = 0.88;
      float arcL = length(p - vec2(-aw * 0.5, 0.0)) - aR;
      float arcR = length(p - vec2( aw * 0.5, 0.0)) - aR;
      float arch = max(arcL, arcR);
      arch       = max(arch, -p.y - 0.75);

      float insideNiche = smoothstep(0.005, -0.005, arch);
      float frameInner  = smoothstep(0.014, 0.002, abs(arch));
      float frameOuter  = smoothstep(0.015, 0.002, abs(arch + 0.045));

      // Dense vine scroll + flower pattern
      vec2  fp    = p * 4.2 + vec2(0.0, 0.3);
      float vine  = 1e9;
      float flor  = 1e9;
      float scale = 1.0;
      for (int i = 0; i < 10; i++) {
        if (float(i) >= u_iterations) break;
        fp = abs(fp) - 0.48 * u_complexity;
        fp = rot(0.55 + 0.04 * sin(t * 0.25 + float(i))) * fp;
        fp = kaleido(fp, u_petals * 2.0);
        fp *= 1.18;
        scale /= 1.18;
        float stem = abs(fp.y + 0.14 * sin(fp.x * 3.2 + t * 0.4 + float(i))) * scale;
        vine = min(vine, stem);
        flor = min(flor, sdRose(fp * 0.7, u_petals) * scale);
      }
      float vineMask = smoothstep(0.028 / u_detail, 0.0, vine) * insideNiche;
      float florMask = smoothstep(0.040 / u_detail, -0.005, flor) * insideNiche;

      // Central cartouche (medallion + vase)
      vec2  cp    = p - vec2(0.0, -0.12);
      float dia   = abs(cp.x) * 1.8 + abs(cp.y) * 1.1 - 0.17;
      float diaMask = smoothstep(0.010, -0.010, dia) * insideNiche;
      float diaLine = smoothstep(0.018, 0.0, abs(dia))  * insideNiche;

      // Lower vase suggestion (small diamond below cartouche)
      vec2  vp     = p - vec2(0.0, -0.45);
      float vase   = abs(vp.x) * 2.2 + abs(vp.y) * 1.6 - 0.10;
      float vMask  = smoothstep(0.010, -0.010, vase) * insideNiche;

      vec3 cobalt  = pickPalette(u_palette, 0.10);
      vec3 bgOut   = pickPalette(u_palette, 0.22);
      vec3 gold    = vec3(1.00, 0.82, 0.35);
      vec3 goldDim = vec3(0.78, 0.60, 0.22);
      vec3 green   = vec3(0.30, 0.65, 0.45);
      vec3 turq    = vec3(0.25, 0.75, 0.80);

      vec3 col = bgOut * 0.25;
      col = mix(col, cobalt,         insideNiche);
      col = mix(col, goldDim,        vineMask * 0.85);
      col = mix(col, gold,           florMask * 0.95);
      col = mix(col, gold * 0.9,     diaMask  * 0.85);
      col = mix(col, green,          diaMask * vineMask * 0.8);
      col = mix(col, turq,           vMask   * 0.9);
      col += gold      * frameInner * 0.95;
      col += gold * 0.5 * frameOuter;
      return col;
    }

    // =================================================================
    //  MODE 5 — Dome Spiral (Sheikh Lotfollah tessellation)
    //  Log-polar "lemon" tiles with perspective darkening + slow zoom
    // =================================================================
    vec3 modeDome(vec2 uv, float t) {
      float r = max(length(uv), 0.01);
      float a = atan(uv.y, uv.x);

      float tpr     = u_symmetry * 2.0;     // tiles around circumference
      float density = u_complexity * 4.5;   // rings per log unit

      // log-polar coords; time drifts rings outward (spiral-in illusion)
      float lr = -log(r) * density + t * 0.35;
      float la = a * tpr / TAU;

      // stagger alternate rings so tiles nest
      float ringId = floor(lr);
      float stagger = mod(ringId, 2.0) * 0.5;
      float laStaggered = la + stagger;

      vec2 cell = vec2(fract(laStaggered) - 0.5, fract(lr) - 0.5);
      vec2 id   = vec2(floor(laStaggered), ringId);

      // lemon / rounded-quad tile
      float sdTile = length(cell * vec2(1.15, 1.45)) - 0.42;

      // inner ornament: tiny rose inside each tile
      vec2 cc   = cell * 4.5;
      float rose = sdRose(cc, u_petals) * 0.22;

      // edge lattice
      float edge = abs(sdTile);

      float tileMask = smoothstep(0.01, -0.01, sdTile);
      float edgeMask = smoothstep(0.020, 0.002, edge);
      float roseMask = smoothstep(0.02, -0.02, rose) * tileMask;

      // perspective: center darker (vanishing point), rim brighter
      float depth = smoothstep(0.02, 0.8, r);

      vec3 bg    = pickPalette(u_palette, 0.08);
      vec3 tileC = pickPalette(u_palette, 0.32 + id.y * 0.03 + 0.05 * sin(id.x * 1.7));
      vec3 gold  = vec3(1.00, 0.82, 0.35);
      vec3 core  = pickPalette(u_palette, 0.72);

      vec3 col = bg * (0.20 + 0.45 * depth);
      col = mix(col, tileC * (0.35 + 0.65 * depth), tileMask);
      col = mix(col, core  * (0.60 + 0.40 * depth), roseMask);
      col = mix(col, gold  * (0.40 + 0.60 * depth), edgeMask * 0.90);

      return col;
    }

    // =================================================================
    //  MODE 4 — Shamsa (sun medallion: nested stars)
    // =================================================================
    vec3 modeShamsa(vec2 uv, float t) {
      vec2 p = rot(t * 0.08) * uv;
      float r = length(p);

      // radial sunburst
      float rays = 0.5 + 0.5 * cos(atan(p.y, p.x) * u_symmetry * 2.0 - t * 0.6);
      rays = pow(rays, 3.0);

      // nested stars
      float d = 1e9;
      vec2 q = p;
      float scale = 1.0;
      for (int i = 0; i < 8; i++) {
        if (float(i) >= u_iterations) break;
        float s = sdStar(q, u_symmetry, 0.35 * scale);
        d = min(d, abs(s));
        q = rot(PI / u_symmetry) * q;
        scale *= 0.55 * u_complexity;
      }

      float aa = 1.5 / u_resolution.y;
      float lineMask = smoothstep(0.015 / u_detail + aa, 0.0, d);

      // inner glow
      float core = smoothstep(0.6, 0.0, r);

      vec3 base = pickPalette(u_palette, 0.2 + r * 0.8 + t * 0.05);
      vec3 gold = vec3(1.0, 0.85, 0.4);
      vec3 deep = pickPalette(u_palette, 0.05);

      vec3 col = mix(deep, base, rays * 0.8);
      col += gold * lineMask * 0.95;
      col += gold * core * 0.25 * u_bloom;
      return col;
    }

    // =================================================================
    void main() {
      vec2 res = u_resolution;
      vec2 uv  = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
      uv -= u_pan;
      uv *= u_zoom;
      uv = rot(u_rot + u_time * 0.04) * uv;

      float t = u_time;
      vec3 col;
      if      (u_mode < 0.5) col = modeKaleido(uv, t);
      else if (u_mode < 1.5) col = modeFloral (uv, t);
      else if (u_mode < 2.5) col = modeGirih  (uv, t);
      else if (u_mode < 3.5) col = modeJulia  (uv, t);
      else if (u_mode < 4.5) col = modeShamsa (uv, t);
      else if (u_mode < 5.5) col = modeDome   (uv, t);
      else if (u_mode < 6.5) col = modeVault  (uv, t);
      else                   col = modeMihrab (uv, t);

      // vignette
      float vr = length(uv) * 0.45;
      col *= smoothstep(1.6, 0.2, vr);

      // soft tonemap + gentle gamma
      col = col / (1.0 + col * (1.2 - 0.6 * u_bloom));
      col = pow(max(col, 0.0), vec3(0.92));

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // ---------- GL boilerplate ----------
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(sh));
      throw new Error("Shader compile failed");
    }
    return sh;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = {
    resolution:  gl.getUniformLocation(prog, "u_resolution"),
    time:        gl.getUniformLocation(prog, "u_time"),
    symmetry:    gl.getUniformLocation(prog, "u_symmetry"),
    zoom:        gl.getUniformLocation(prog, "u_zoom"),
    iterations:  gl.getUniformLocation(prog, "u_iterations"),
    complexity:  gl.getUniformLocation(prog, "u_complexity"),
    detail:      gl.getUniformLocation(prog, "u_detail"),
    bloom:       gl.getUniformLocation(prog, "u_bloom"),
    palette:     gl.getUniformLocation(prog, "u_palette"),
    mode:        gl.getUniformLocation(prog, "u_mode"),
    petals:      gl.getUniformLocation(prog, "u_petals"),
    pan:         gl.getUniformLocation(prog, "u_pan"),
    rot:         gl.getUniformLocation(prog, "u_rot"),
  };

  // ---------- State ----------
  const state = {
    mode:       1,      // start on Floral (feels closer to the reference images)
    symmetry:   8,
    zoom:       1.6,
    iterations: 7,
    complexity: 1.10,
    speed:      0.35,
    detail:     1.00,
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
  };

  let timeAccum = 0;
  let lastFrame = performance.now();

  // ---------- Resize ----------
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(window.innerWidth  * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- UI bindings ----------
  const $ = id => document.getElementById(id);

  function setControl(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input"));
  }

  const bindRange = (id, key, parseFn = parseFloat) => {
    const el = $(id);
    const out = document.querySelector(`[data-out="${id}"]`);
    const update = () => {
      state[key] = parseFn(el.value);
      if (out) {
        const isFloat = el.step && String(el.step).includes(".");
        out.textContent = isFloat ? (+el.value).toFixed(2) : String(parseInt(el.value, 10));
      }
    };
    el.addEventListener("input", update);
    update();
  };

  bindRange("symmetry",   "symmetry",   parseInt);
  bindRange("zoom",       "zoom");
  bindRange("iterations", "iterations", parseInt);
  bindRange("complexity", "complexity");
  bindRange("speed",      "speed");
  bindRange("detail",     "detail");
  bindRange("bloom",      "bloom");
  if ($("petals")) bindRange("petals", "petals", parseInt);

  $("palette").addEventListener("change", e => {
    state.palette = parseInt(e.target.value, 10);
  });

  if ($("mode")) {
    $("mode").addEventListener("change", e => {
      state.mode = parseInt(e.target.value, 10);
      const preset = modePresets[state.mode];
      if (preset) {
        for (const k in preset) setControl(k, preset[k]);
        $("palette").value = preset.palette;
        state.palette = preset.palette;
      }
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
    setControl("detail",     rnd(0.6, 1.8).toFixed(2));
    setControl("bloom",      rnd(0.4, 1.3).toFixed(2));
    if ($("petals")) setControl("petals", Math.floor(rnd(3, 12)));
    const paletteEl = $("palette");
    paletteEl.selectedIndex = Math.floor(Math.random() * paletteEl.options.length);
    state.palette = paletteEl.selectedIndex;
  });

  $("screenshot").addEventListener("click", () => {
    canvas.toBlob(b => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `fractal_${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  });

  $("toggle").addEventListener("click", () => {
    $("panel").classList.toggle("collapsed");
  });

  // ---------- Interaction: drag, wheel, dblclick ----------
  let dragging = false, lastX = 0, lastY = 0;

  canvas.addEventListener("pointerdown", e => {
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (e.shiftKey) {
      state.rot += dx * 0.005;
    } else {
      const s = 1 / Math.min(canvas.width, canvas.height) * (window.devicePixelRatio || 1) * state.zoom;
      state.pan[0] -= dx * s * 2;
      state.pan[1] += dy * s * 2;
    }
  });
  canvas.addEventListener("pointerup",   () => { dragging = false; });
  canvas.addEventListener("pointerleave",() => { dragging = false; });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const factor = Math.exp(e.deltaY * 0.001);
    const next = Math.max(0.1, Math.min(8, state.zoom * factor));
    setControl("zoom", next.toFixed(2));
  }, { passive: false });

  canvas.addEventListener("dblclick", () => {
    if (!document.fullscreenElement) canvas.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  // ---------- Render loop ----------
  function frame(now) {
    const dt = (now - lastFrame) * 0.001;
    lastFrame = now;
    if (!state.paused) timeAccum += dt * state.speed;

    gl.uniform2f(U.resolution, canvas.width, canvas.height);
    gl.uniform1f(U.time,       timeAccum);
    gl.uniform1f(U.symmetry,   state.symmetry);
    gl.uniform1f(U.zoom,       state.zoom);
    gl.uniform1f(U.iterations, state.iterations);
    gl.uniform1f(U.complexity, state.complexity);
    gl.uniform1f(U.detail,     state.detail);
    gl.uniform1f(U.bloom,      state.bloom);
    gl.uniform1f(U.palette,    state.palette);
    gl.uniform1f(U.mode,       state.mode);
    gl.uniform1f(U.petals,     state.petals);
    gl.uniform2f(U.pan,        state.pan[0], state.pan[1]);
    gl.uniform1f(U.rot,        state.rot);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
