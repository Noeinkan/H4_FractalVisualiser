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
    //  FLAT-INK TOOLKIT (modes 8+)
    //  These modes are illustration, not light: flat fills, a constant-width
    //  ink stroke, a paper ground. main() skips the tonemap and the vignette
    //  for them -- x/(1+1.2x) would turn white paper into 0.45 grey -- so the
    //  colours below are already display values, not linear radiance.
    // =================================================================
    struct Ink { vec3 line; vec3 paper; vec3 c1; vec3 c2; vec3 c3; };

    // Same eight slots as pickPalette, flattened: each gradient becomes an
    // ink + paper + three flat fills. 0 and 5 are the two reference plates.
    Ink inkPalette(float idx) {
      if      (idx < 0.5) return Ink(vec3(0.17,0.29,0.46), vec3(0.94,0.95,0.94), vec3(0.95,0.53,0.37), vec3(0.66,0.73,0.69), vec3(0.11,0.53,0.55));
      else if (idx < 1.5) return Ink(vec3(0.12,0.31,0.55), vec3(0.96,0.96,0.94), vec3(0.29,0.53,0.78), vec3(0.81,0.88,0.93), vec3(0.94,0.76,0.29));
      else if (idx < 2.5) return Ink(vec3(0.79,0.64,0.15), vec3(0.07,0.14,0.36), vec3(0.11,0.25,0.56), vec3(0.91,0.84,0.54), vec3(0.18,0.44,0.71));
      else if (idx < 3.5) return Ink(vec3(0.04,0.23,0.27), vec3(0.92,0.96,0.95), vec3(0.16,0.66,0.66), vec3(0.50,0.82,0.78), vec3(0.95,0.65,0.35));
      else if (idx < 4.5) return Ink(vec3(0.10,0.10,0.10), vec3(0.98,0.98,0.98), vec3(0.85,0.85,0.85), vec3(0.67,0.67,0.67), vec3(0.43,0.43,0.43));
      else if (idx < 5.5) return Ink(vec3(0.95,0.79,0.30), vec3(0.99,0.99,0.97), vec3(0.91,0.25,0.16), vec3(0.24,0.44,0.49), vec3(0.66,0.81,0.88));
      else if (idx < 6.5) return Ink(vec3(0.09,0.19,0.48), vec3(0.95,0.96,0.98), vec3(0.18,0.44,0.82), vec3(0.50,0.70,0.91), vec3(0.88,0.77,0.42));
      else                return Ink(vec3(0.08,0.27,0.18), vec3(0.95,0.97,0.94), vec3(0.18,0.56,0.36), vec3(0.62,0.82,0.66), vec3(0.85,0.66,0.24));
    }

    // Flat compositing: paint covers paint. No additive light anywhere in an
    // ink mode, otherwise overlapping bands blow out to white.
    void over(inout vec3 col, vec3 c, float m) { col = mix(col, c, clamp(m, 0.0, 1.0)); }

    float fillMask(float d)          { float e = FW(d); return smoothstep(e, -e, d); }
    float lineMask(float d, float w) { float e = FW(d); return smoothstep(e, -e, abs(d) - w); }

    float sdSegment(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      return length(pa - ba * h);
    }

    // Pointed leaf / lotus petal: half-width w at the waist, tips at (0, +-h).
    // A width profile rather than a true lens: the two-circle construction
    // silently inverts when h < w, which is the common case out at the rim
    // where cells are wider than the band is deep.
    float sdLeaf(vec2 p, float w, float h) {
      float ty = clamp(1.0 - abs(p.y) / max(h, 1e-4), 0.0, 1.0);
      float d  = max(abs(p.x) - w * pow(ty, 0.55), abs(p.y) - h);
      return d * 0.7;   // crude Lipschitz correction, keeps FW() antialiasing sane
    }

    // Teardrop / paisley as a cardioid: bulb at -y, cusp at +y. Polar radius,
    // not a true distance, so it is scaled down to keep FW() antialiasing sane.
    float sdDrop(vec2 p, float R) {
      float a = atan(p.x, p.y);
      return (length(p) - R * (1.0 - 0.70 * cos(a))) * 0.45;
    }

    // Distance to the nearest of a family of concentric hairlines.
    float sdRings(vec2 p, float s) {
      return abs(fract(length(p) / s - 0.5) - 0.5) * s;
    }

    // Parallel hairlines along direction 'a'; call twice to cross-hatch.
    float sdHatch(vec2 p, float s, float a) {
      float u = dot(p, vec2(cos(a), sin(a)));
      return abs(fract(u / s - 0.5) - 0.5) * s;
    }

    // Log-spiral scroll, the henna "curl". Same polar caveat as sdDrop.
    float sdCurl(vec2 p, float k) {
      float r = max(length(p), 1e-4);
      float n = (log(r) / k - atan(p.y, p.x)) / TAU;
      return abs(fract(n + 0.5) - 0.5) * TAU * k * r;
    }

    // Local frame inside one angular cell of a band.
    //   .x  across the cell, -1 at one seam and +1 at the other
    //   .y  outward across the band, 0 at r0 and 1 at r1
    //   .z  the cell aspect (band width / cell half-arc)
    // Normalising x to the *cell* and not to the band is what makes motifs
    // tile: sized against the band they leave paper gaps at every seam.
    vec3 bandCell(vec2 p, float n, float r0, float r1) {
      float seg  = TAU / n;
      float la   = mod(atan(p.y, p.x) + seg * 0.5, seg) - seg * 0.5;
      float rr   = length(p);
      float bw   = max(r1 - r0, 1e-3);
      float ha   = max(seg * 0.25 * (r0 + r1), 1e-4);
      return vec3(la * rr / ha, (rr - r0) / bw, bw / ha);
    }

    // Cell coordinates squared up to the x unit, so a motif can be authored
    // once against x in [-1,1] and follow the band's proportions through asp.
    vec2 cellBox(vec3 c) { return vec2(c.x, (c.y - 0.5) * c.z); }

    float bandMask(float rr, float r0, float r1) {
      return fillMask(max(r0 - rr, rr - r1));
    }

    // =================================================================
    //  MODE 8 - Henna (flat vector mandala: concentric bands of motifs)
    //  Not a fractal. Each band carries its own symmetry count and its own
    //  motif, the way the drawn originals are built; u_iterations decides
    //  how many bands are laid down, from the medallion outward. Bands are
    //  contiguous out to r=1.30 so the plate reads as one disc.
    // =================================================================
    vec3 modeHenna(vec2 uv, float t) {
      Ink ink = inkPalette(u_palette);
      vec3 col = ink.paper;

      vec2  p  = uv;
      float rr = length(p);
      float n  = max(u_symmetry, 4.0);
      float k  = clamp(u_complexity, 0.6, 1.6);    // motif density
      float bands = clamp(u_iterations, 1.0, 8.0);

      // Stroke weight lives in scene units; each band converts it into its own
      // cell units below, so the line reads the same thickness everywhere.
      float w = 0.0040 * (0.5 + 0.8 * u_bloom);

      // ---- band 0: medallion, white spokes on a disc ---------------
      over(col, ink.c3, fillMask(rr - 0.24));
      vec3 c0 = bandCell(p, n * 4.0, 0.12, 0.24);
      over(col, ink.paper, fillMask(abs(c0.x) - 0.45) * bandMask(rr, 0.125, 0.235));
      over(col, ink.paper, fillMask(rr - 0.075));
      over(col, ink.line,  fillMask(rr - 0.020));
      vec3 d0 = bandCell(p, n, 0.070, 0.130);
      over(col, ink.line,  fillMask(length(cellBox(d0)) - 0.30));
      over(col, ink.line,  lineMask(rr - 0.24, w));

      // ---- band 1: inner flame ring --------------------------------
      if (bands > 1.5) {
        float m = bandMask(rr, 0.24, 0.42);
        over(col, ink.c1, m);
        vec3  c = bandCell(p, n * 3.0, 0.24, 0.42);
        vec2  e = cellBox(c);
        float lw = w * c.z / 0.18;
        float flame = sdLeaf(e, 0.88, 0.44 * c.z);
        over(col, ink.line, lineMask(flame, lw) * m);
        over(col, ink.line, lineMask(sdCurl(e * 1.6, 0.30 / k), lw * 0.8) * fillMask(flame) * m);
        over(col, ink.line, lineMask(rr - 0.42, w));
      }

      // ---- band 2: scroll collar -----------------------------------
      if (bands > 2.5) {
        float m = bandMask(rr, 0.42, 0.58);
        over(col, ink.c1, m);
        vec3  c = bandCell(p, n * 4.0, 0.42, 0.58);
        vec2  e = cellBox(c);
        float lw = w * c.z / 0.16;
        over(col, ink.line, lineMask(sdRings(e * vec2(1.0, 0.8), 0.30 / k), lw * 0.9) * m);
        over(col, ink.line, lineMask(sdLeaf(e, 0.90, 0.46 * c.z), lw) * m);
        over(col, ink.line, lineMask(rr - 0.58, w));
      }

      // ---- band 3: chevron collar ----------------------------------
      if (bands > 3.5) {
        float m = bandMask(rr, 0.58, 0.66);
        over(col, ink.paper, m);
        vec3  c = bandCell(p, n * 4.0, 0.58, 0.66);
        vec2  e = cellBox(c);
        // triangle standing on the inner edge, apex outward
        float hh  = 0.44 * c.z;
        float tri = max(abs(e.x) * (hh / 0.55) + e.y - hh, -e.y - hh);
        over(col, ink.line, fillMask(tri) * m);
        over(col, ink.line, lineMask(rr - 0.66, w));
      }

      // ---- band 4: teardrops with a ringed eye ---------------------
      if (bands > 4.5) {
        float m = bandMask(rr, 0.66, 0.86);
        over(col, ink.c2, m);
        vec3  c = bandCell(p, n * 2.0, 0.66, 0.86);
        vec2  e = cellBox(c);
        float lw = w * c.z / 0.20;
        float R  = min(0.45 * c.z, 0.86);
        float drop = sdDrop(vec2(e.x, -e.y - 0.20 * R), R);
        over(col, ink.paper, fillMask(drop) * m);
        over(col, ink.line,  lineMask(sdRings(vec2(e.x, e.y + 0.30 * R), 0.22 * R), lw * 0.8) * fillMask(drop) * m);
        over(col, ink.line,  lineMask(drop, lw) * m);
        over(col, ink.line,  lineMask(rr - 0.86, w));
      }

      // ---- band 5: lotus petals ------------------------------------
      if (bands > 5.5) {
        float m = bandMask(rr, 0.86, 1.08);
        over(col, ink.paper, m);
        vec3  c = bandCell(p, n * 2.0, 0.86, 1.08);
        vec2  e = cellBox(c);
        float lw = w * c.z / 0.22;
        float petal = sdLeaf(e, 0.96, 0.47 * c.z);
        over(col, ink.c1,   fillMask(petal) * m);
        over(col, ink.line, lineMask(sdLeaf(e, 0.58, 0.30 * c.z), lw * 0.8) * m);
        over(col, ink.line, lineMask(petal, lw) * m);
      }

      // ---- band 6: outer leaves, cross-hatched ---------------------
      if (bands > 6.5) {
        float m = bandMask(rr, 1.08, 1.30);
        over(col, ink.c3, m);
        vec3  c = bandCell(p, n * 2.0, 1.08, 1.30);
        vec2  e = cellBox(c);
        float lw = w * c.z / 0.22;
        float leaf = sdLeaf(e, 0.94, 0.46 * c.z);
        over(col, ink.paper, fillMask(leaf) * m);
        float hatch = min(sdHatch(e, 0.20 / k, 0.9), sdHatch(e, 0.20 / k, -0.9));
        over(col, ink.line, lineMask(hatch, lw * 0.55) * fillMask(leaf) * m);
        over(col, ink.line, lineMask(leaf, lw) * m);
        over(col, ink.line, lineMask(rr - 1.30, w));
      }

      // ---- band 7: crown of dotted stalks --------------------------
      if (bands > 7.5) {
        vec3  c = bandCell(p, n * 4.0, 1.30, 1.46);
        vec2  e = vec2(c.x, c.y);
        float g = step(1.29, rr);
        float stalk = min(sdSegment(e, vec2(0.0, 0.0), vec2(0.0, 0.62)) - 0.10,
                          length(vec2(e.x, (e.y - 0.74) * c.z)) - 0.26);
        over(col, ink.line, fillMask(stalk) * g);
      }

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
      else if (u_mode < 7.5) col = modeMihrab (uv, t);
      else                   col = modeHenna  (uv, t);

      // Light modes only. The flat-ink modes (8+) author display-ready colours:
      // the tonemap would crush white paper to 0.45 grey and the vignette would
      // dirty the ground, so both are skipped rather than duplicated per mode.
      if (u_mode < 7.5) {
        // Vignette in screen space: independent of zoom / pan, so the corners no
        // longer go fully black once u_zoom pushes uv past the old smoothstep edge.
        // Edges chosen to match the previous look at the default zoom of 1.6.
        col *= smoothstep(2.2, 0.3, length(uvScreen));

        // soft tonemap + gentle gamma
        col = col / (1.0 + col * (1.2 - 0.6 * u_bloom));
        col = pow(max(col, 0.0), vec3(0.92));
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  window.FRACTAL_SHADER = { VERT, FRAG_BODY };
})();
