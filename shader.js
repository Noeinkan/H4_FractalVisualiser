/* GLSL sources for the fractal mandala visualiser.
   Loaded as a classic script (works over file:// too) and consumed by main.js.

   NOTE: the fragment source below deliberately omits the `#extension` line.
   main.js prepends a small header that either enables OES_standard_derivatives
   and maps FW(x) -> fwidth(x), or falls back to a fixed edge width when the
   extension is unavailable. */
(() => {
  "use strict";

  const VERT = `
    attribute vec2 a_pos;
    void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
  `;

  const FRAG_BODY = `
    precision highp float;

    uniform vec2  u_resolution;
    uniform float u_time;
    uniform float u_symmetry;
    uniform float u_zoom;
    uniform float u_iterations;
    uniform float u_complexity;
    uniform float u_bloom;
    uniform float u_palette;
    uniform float u_mode;
    uniform float u_petals;
    uniform vec2  u_pan;
    uniform float u_rot;

    #define PI   3.14159265359
    #define TAU  6.28318530718
    #define GOLD vec3(1.0, 0.82, 0.35)

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

      float fwTrap = FW(trap);
      float edge = smoothstep(fwTrap, 0.0, trap);
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

      // rim of flowers (derivative-based AA)
      float fwD    = FW(d);
      float fwStem = FW(stemD);
      float petalMask = smoothstep(fwD,    -fwD,    d);
      float stemMask  = smoothstep(fwStem, -fwStem, stemD - 0.008);

      // base radial background
      float r = length(uv);
      float bg = 0.4 + 0.2 * cos(r * 6.0 - t * 0.5);
      vec3 bgCol = pickPalette(u_palette, 0.15 + bg * 0.2);

      // petal color: palette driven by radial distance
      vec3 petalCol = pickPalette(u_palette, 0.6 + 0.3 * sin(r * 3.0 - t * 0.3));
      vec3 stemCol  = vec3(0.20, 0.55, 0.35);   // arabesque green
      vec3 goldCol  = GOLD;

      vec3 col = bgCol * 0.4;
      col = mix(col, stemCol, stemMask * 0.85);
      col = mix(col, petalCol, petalMask);
      // gold outline on petal edges
      float outline = smoothstep(0.04, 0.01, abs(d));
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
      p = kaleido(p, u_symmetry);

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
      float line = abs(poly) - 0.01;

      float fwStar = FW(star);
      float fwLine = FW(line);
      float starMask = smoothstep(fwStar, -fwStar, star);
      float lineMask = smoothstep(fwLine, -fwLine, line);

      // iterate: nested smaller stars
      vec2 q = local;
      float nested = 1e9;
      for (int i = 0; i < 6; i++) {
        if (float(i) >= u_iterations - 1.0) break;
        q = abs(q) - 0.08 * u_complexity;
        q = rot(PI / u_symmetry) * q;
        nested = min(nested, sdStar(q * 8.0, u_symmetry, 0.3) * 0.125);
      }
      float fwNested = FW(nested);
      float nestedMask = smoothstep(fwNested, -fwNested, nested);

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
      vec3 gold = GOLD;
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

      float fwArch = FW(arch);
      float insideArch = smoothstep(fwArch, -fwArch, arch);

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
      float fwFlor = FW(dflor);
      float florMask = smoothstep(fwFlor, -fwFlor, dflor) * insideArch;

      // Gold seams between panels (angular) + arch outline
      float seamD    = abs(la) * max(r, 0.12);
      float seamMask = smoothstep(0.020, 0.003, seamD);
      float archLine = smoothstep(0.018, 0.002, abs(arch));

      // Central oculus (dark void)
      float oculus = smoothstep(0.18, 0.06, r);

      vec3 bg     = pickPalette(u_palette, 0.08);
      vec3 panelC = pickPalette(u_palette, 0.30 + sid * 0.11 + t * 0.03);
      vec3 florC  = pickPalette(u_palette, 0.65 + 0.1 * sin(sid));
      vec3 gold   = GOLD;

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

      float fwArch = FW(arch);
      float insideNiche = smoothstep(fwArch, -fwArch, arch);
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
      float fwVine = FW(vine);
      float fwFlor = FW(flor);
      float vineMask = smoothstep(fwVine, 0.0, vine) * insideNiche;
      float florMask = smoothstep(fwFlor, -fwFlor, flor) * insideNiche;

      // Central cartouche (medallion + vase)
      vec2  cp    = p - vec2(0.0, -0.12);
      float dia   = abs(cp.x) * 1.8 + abs(cp.y) * 1.1 - 0.17;
      float fwDia = FW(dia);
      float diaMask = smoothstep(fwDia, -fwDia, dia) * insideNiche;

      // Lower vase suggestion (small diamond below cartouche)
      vec2  vp     = p - vec2(0.0, -0.45);
      float vase   = abs(vp.x) * 2.2 + abs(vp.y) * 1.6 - 0.10;
      float fwVase = FW(vase);
      float vMask  = smoothstep(fwVase, -fwVase, vase) * insideNiche;

      vec3 cobalt  = pickPalette(u_palette, 0.10);
      vec3 bgOut   = pickPalette(u_palette, 0.22);
      vec3 gold    = GOLD;
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
      vec2  cellW  = cell * vec2(1.15, 1.45);
      float cellR  = length(cellW);
      float sdTile = cellR - 0.42;

      // concentric ornament rings inside each tile — density driven by u_iterations
      float orn = 1e9;
      for (int i = 0; i < 8; i++) {
        if (float(i) >= u_iterations) break;
        orn = min(orn, abs(cellR - (0.34 - float(i) * 0.046)) - 0.006);
      }

      // inner ornament: tiny rose inside each tile
      vec2 cc   = cell * 4.5;
      float rose = sdRose(cc, u_petals) * 0.22;

      // edge lattice
      float edge = abs(sdTile);

      float fwTile = FW(sdTile);
      float fwRose = FW(rose);
      float fwOrn  = FW(orn);
      float tileMask = smoothstep(fwTile, -fwTile, sdTile);
      float edgeMask = smoothstep(0.020, 0.002, edge);
      float roseMask = smoothstep(fwRose, -fwRose, rose) * tileMask;
      float ornMask  = smoothstep(fwOrn,  -fwOrn,  orn)  * tileMask;

      // perspective: center darker (vanishing point), rim brighter
      float depth = smoothstep(0.02, 0.8, r);

      vec3 bg    = pickPalette(u_palette, 0.08);
      vec3 tileC = pickPalette(u_palette, 0.32 + id.y * 0.03 + 0.05 * sin(id.x * 1.7));
      vec3 gold  = GOLD;
      vec3 core  = pickPalette(u_palette, 0.72);

      vec3 col = bg * (0.20 + 0.45 * depth);
      col = mix(col, tileC * (0.35 + 0.65 * depth), tileMask);
      col = mix(col, gold  * (0.35 + 0.65 * depth), ornMask * 0.45);
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

      float fwD = FW(d);
      float lineMask = smoothstep(fwD, 0.0, d);

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

      // Screen-space coords: used for the vignette so that it stays anchored
      // to the viewport instead of following pan/zoom into the scene.
      vec2 uvScreen = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);

      vec2 uv = uvScreen - u_pan;
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

      // Vignette in screen space: independent of zoom / pan, so the corners no
      // longer go fully black once u_zoom pushes uv past the old smoothstep edge.
      // Edges chosen to match the previous look at the default zoom of 1.6.
      col *= smoothstep(2.2, 0.3, length(uvScreen));

      // soft tonemap + gentle gamma
      col = col / (1.0 + col * (1.2 - 0.6 * u_bloom));
      col = pow(max(col, 0.0), vec3(0.92));

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  window.FRACTAL_SHADER = { VERT, FRAG_BODY };
})();
