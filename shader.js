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

    // ---- Coverage from a distance, and the shapes several modes share ----
    // Written for the flat-ink modes but not ink-specific: the arch and the two
    // masks are what modes 6 and 7 are built on as well, so they live up here
    // rather than below the modes that need them.

    float fillMask(float d)          { float e = FW(d); return smoothstep(e, -e, d); }
    float lineMask(float d, float w) { float e = FW(d); return smoothstep(e, -e, abs(d) - w); }

    float sdSegment(vec2 p, vec2 a, vec2 b) {
      vec2 pa = p - a, ba = b - a;
      float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
      return length(pa - ba * h);
    }

    // Two-centred arch: springing line at y=0, half-width w, apex at (0, h).
    // h > w is the acute arch, h == w the semicircular one. h < w would put the
    // arc centres on the wrong side and quietly invert the shape, so it is
    // clamped away rather than left to fail silently.
    float sdArch(vec2 p, float w, float h) {
      w = max(w, 1e-4);
      h = max(h, w);
      float c = (h * h - w * w) / (2.0 * w);
      float R = w + c;
      float d = max(length(p - vec2(-c, 0.0)) - R, length(p - vec2(c, 0.0)) - R);
      return max(d, -p.y);
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
      float lineM = smoothstep(fwLine, -fwLine, line);

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
      col = mix(col, goldC, lineM * 0.9);
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
    //  MODE 6 - Vault Panels (ribbed vault seen from below)
    //  Ribs converging on a boss, coursed webbing between them, and an arcade
    //  of pointed arches where the webbing springs from the wall. Every shape
    //  is authored in the cell frame of bandCell/cellBox, which divides the
    //  tangential coordinate by the cell's OWN half arc and squares it back up
    //  through the cell aspect -- so an arch stays an arch at any symmetry.
    //  The old (la*r, r) frame grew without bound with r instead, so a fixed
    //  size arch drifted off the webbing and the vault rendered as a wheel of
    //  coloured wedges.
    // =================================================================
    vec3 modeVault(vec2 uv, float t) {
      float r = length(uv);
      float a = atan(uv.y, uv.x);

      float N   = max(u_symmetry, 3.0);
      float seg = TAU / N;
      float la  = mod(a + seg * 0.5, seg) - seg * 0.5;

      float R  = 1.25;                  // rim, where the webbing meets the wall
      float rA = 0.74;                  // springing line of the rim arcade
      float r0 = 0.22;                  // boss at the crown
      float er = FW(r);
      float inWeb = smoothstep(er, -er, r - R) * smoothstep(er, -er, r0 - r);

      // ---- rim arcade: one pointed arch per panel, springing at the rim ----
      vec3  ac    = bandCell(uv, N, rA, R);
      vec2  ae    = cellBox(ac);
      float arch  = sdArch(vec2(ae.x, 0.5 * ac.z - ae.y), 0.84, 0.94 * ac.z);
      float bandA = bandMask(r, rA, R);
      float archM = fillMask(arch) * bandA;
      float archL = lineMask(arch, 0.028) * bandA;

      // ---- coursed webbing from the boss out to the arcade ----
      // Fixed radial courses rather than a compounding fold: every course the
      // iteration slider adds is one more ring of lozenges you can still see.
      float courses = clamp(u_iterations, 1.0, 7.0);
      float lozM    = 0.0;
      float courseL = 0.0;
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        if (fi >= courses) break;
        // Geometric, not linear, spacing: a course's depth then grows with r
        // at the same rate as its cells' width, so the cells stay square all
        // the way in. Equal radial steps leave the inner courses as slivers
        // narrower than a pixel, which is where the moire came from.
        float c0 = r0 * pow(rA / r0, fi / courses);
        float c1 = r0 * pow(rA / r0, (fi + 1.0) / courses);
        float m  = bandMask(r, c0, c1);
        // A course thinner than a pixel is haze, not masonry: fade it out
        // rather than let the innermost rings beat against the sampling grid.
        m *= smoothstep(1.2, 3.0, (c1 - c0) / max(er, 1e-5));
        // Half-cell stagger course by course, the way coursed masonry is laid:
        // aligned lozenges would read as radial gutters, not as a surface.
        vec3  cc  = bandCell(rot(mod(fi, 2.0) * seg * 0.5) * uv, N, c0, c1);
        vec2  ce  = cellBox(cc);
        float loz = abs(ce.x) + abs(ce.y) / max(0.5 * cc.z, 1e-4)
                  - 0.22 - 0.42 * u_complexity;
        lozM    = max(lozM, fillMask(loz) * m);
        courseL = max(courseL, smoothstep(0.018, 0.003, abs(r - c1)) * inWeb);
      }

      // Ribs are measured in scene units: a constant width in cell coordinates
      // would open into a wedge as the panel widens toward the rim.
      float ribD = (seg * 0.5 - abs(la)) * r;
      float ribM = smoothstep(0.026, 0.006, ribD) * inWeb;
      float rimL = smoothstep(0.028, 0.007, abs(r - R));

      // Boss: the keystone the ribs run into.
      float ocM   = smoothstep(er, -er, r - r0);
      float starM = fillMask(sdStar(rot(t * 0.12) * uv, max(u_petals, 3.0), r0 * 0.62)) * ocM;
      float ocL   = smoothstep(0.020, 0.004, abs(r - r0));

      // Concavity is carried by tone: the crown is the far end of the vault.
      float depth = smoothstep(R, r0, r);

      vec3  deep = pickPalette(u_palette, 0.06);
      vec3  web  = pickPalette(u_palette, 0.32);
      vec3  tile = pickPalette(u_palette, 0.68);
      vec3  gold = GOLD;
      float glow = 0.45 + 0.55 * u_bloom;

      vec3 col = deep * 0.20;
      col = mix(col, web  * (1.0 - 0.55 * depth), inWeb);
      col = mix(col, tile * (1.0 - 0.45 * depth), lozM);
      col = mix(col, tile * 0.55,                 archM);
      col = mix(col, deep * 0.12,                 ocM);
      col += gold * courseL * 0.30 * glow;
      col += gold * archL   * 0.70 * glow;
      col += gold * ribM    * 0.80 * glow;
      col += gold * rimL    * 0.60 * glow;
      col += gold * starM   * 0.75 * glow;
      col += gold * ocL     * 0.65 * glow;
      return col;
    }

    // =================================================================
    //  MODE 7 - Mihrab (pointed-arch niche with islimi vines)
    //  The silhouette is a two-centred arch standing on a rectangular jamb,
    //  both from sdArch, so the arc centres cannot land on the wrong side.
    //  The vine is still an IFS, but each level fades out once its spacing
    //  falls under a pixel: without that the fold keeps running past what the
    //  geometry can resolve and the niche floods to a flat gold well before
    //  the iteration slider reaches its end.
    // =================================================================
    vec3 modeMihrab(vec2 uv, float t) {
      vec2 p = uv;
      p.y -= 0.05;                    // springing line of the arch at y = 0

      float w = 0.46;                 // half-width of the niche
      float h = 0.62;                 // rise of the arch above the springing
      float b = 0.72;                 // jamb below the springing

      vec2  jq    = abs(vec2(p.x, p.y + b * 0.5)) - vec2(w, b * 0.5);
      float jamb  = min(max(jq.x, jq.y), 0.0) + length(max(jq, 0.0));
      float niche = min(sdArch(p, w, h), jamb);

      float insideNiche = fillMask(niche);
      float frameL = lineMask(niche, 0.012);
      float frameO = lineMask(niche + 0.060, 0.008);

      // Vine field. The stroke has a width in scene units instead of being one
      // pixel wide, and a level too fine to draw stops contributing rather
      // than smearing into a fill.
      float px  = max(FW(p.x), 1e-5);
      float pet = max(u_petals, 3.0);
      vec2  fp  = p * 4.6 + vec2(0.0, 0.35);
      float scl = 1.0;
      float vineM = 0.0;
      float florM = 0.0;
      for (int i = 0; i < 6; i++) {
        float fi = float(i);
        if (fi >= u_iterations) break;
        fp   = abs(fp) - 0.42 * u_complexity;
        fp   = rot(0.52 + 0.05 * sin(t * 0.25 + fi)) * fp;
        fp   = kaleido(fp, max(u_symmetry, 3.0));   // petals stay for the rose
        fp  *= 1.15;
        scl /= 1.15;

        float lod = smoothstep(1.1, 3.0, 0.40 * scl / px);
        if (lod <= 0.001) break;

        float stem = abs(fp.y + 0.16 * sin(fp.x * 3.0 + t * 0.4 + fi)) * scl;
        vineM = max(vineM, lineMask(stem, 0.006 + 0.006 * scl) * lod);

        // The first fold is one big scalloped rose across the whole niche, so
        // it is left as stem only: flowers start once the fold has something
        // to hang them on.
        if (fi > 0.5) {
          float flor = sdRose(fp * 1.5, pet) * scl / 1.5;
          florM = max(florM, fillMask(flor) * lod);
        }
      }
      // Held a hair inside the silhouette so the vine never crowds the frame.
      float bed = fillMask(niche + 0.030);
      vineM *= bed;
      florM *= bed;

      // The hanging lamp is what reads a niche as a mihrab at a glance: a bowl
      // (an arch turned over), a neck, and the chain up to the apex.
      vec2  lp    = p - vec2(0.0, 0.02);
      vec2  nq    = abs(lp - vec2(0.0, 0.055)) - vec2(0.032, 0.055);
      float neck  = min(max(nq.x, nq.y), 0.0) + length(max(nq, 0.0));
      float lamp  = min(sdArch(vec2(lp.x, -lp.y), 0.135, 0.155), neck);
      lamp        = min(lamp, length(lp - vec2(0.0, 0.125)) - 0.030);
      float chain = sdSegment(p, vec2(0.0, 0.15), vec2(0.0, h * 0.92)) - 0.007;

      float lampM  = fillMask(lamp)  * insideNiche;
      float lampL  = lineMask(lamp, 0.008) * insideNiche;
      float chainM = fillMask(chain) * insideNiche;

      // Sill closing the jamb at the floor.
      float sill = lineMask(p.y + b, 0.018) * fillMask(abs(p.x) - w - 0.05);

      vec3  cobalt  = pickPalette(u_palette, 0.10);
      vec3  bgOut   = pickPalette(u_palette, 0.24);
      vec3  gold    = GOLD;
      vec3  goldDim = vec3(0.78, 0.60, 0.22);
      vec3  green   = vec3(0.30, 0.65, 0.45);
      vec3  turq    = vec3(0.25, 0.75, 0.80);
      float glow    = 0.45 + 0.55 * u_bloom;

      vec3 col = bgOut * 0.22;
      col = mix(col, cobalt * 0.90, insideNiche);
      col = mix(col, goldDim,       vineM * 0.85);
      col = mix(col, gold,          florM * 0.90);
      col = mix(col, green * 0.80,  florM * vineM * 0.70);
      col = mix(col, turq * 0.55,   lampM * 0.90);
      col = mix(col, gold,          chainM * 0.90);
      col += gold * lampL  * 0.85 * glow;
      col += gold * frameL * 0.95 * glow;
      col += gold * frameO * 0.45 * glow;
      col += gold * sill   * 0.70 * glow;
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
      float lineM = smoothstep(fwD, 0.0, d);

      // inner glow
      float core = smoothstep(0.6, 0.0, r);

      vec3 base = pickPalette(u_palette, 0.2 + r * 0.8 + t * 0.05);
      vec3 gold = vec3(1.0, 0.85, 0.4);
      vec3 deep = pickPalette(u_palette, 0.05);

      vec3 col = mix(deep, base, rays * 0.8);
      col += gold * lineM * 0.95;
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

    // =================================================================
    //  MODE 8 - Henna (flat vector mandala: concentric bands of motifs)
    //  Not a fractal, and not one fixed plate either: the band stack is drawn
    //  from a seeded recipe -- how wide each ring is, how many cells it holds,
    //  which motif fills them, which flat colour sits underneath -- so one set
    //  of slider positions describes a family of mandalas instead of a single
    //  drawing with more or fewer rings. u_petals is that seed here and has no
    //  other job in this mode, which is what makes Random reshuffle the plate.
    // =================================================================

    // Deterministic hash, only ever fed small integers. The sin() trick is
    // stable enough in highp for the handful of draws one plate takes.
    float hRand(float x) { return fract(sin(x * 12.9898 + 4.1414) * 43758.5453); }

    // One of the four flat fills by index. GLSL ES 1.00 has no dynamic array
    // indexing, hence the chain.
    vec3 inkSlot(Ink k, float i) {
      float j = mod(floor(i + 0.5), 4.0);
      if      (j < 0.5) return k.paper;
      else if (j < 1.5) return k.c1;
      else if (j < 2.5) return k.c2;
      return k.c3;
    }

    // Everything a motif needs to draw itself inside one cell of a band: the
    // cell frame from cellBox, the half-height it may fill, the stroke already
    // converted into cell units, the band's coverage mask, and the alternation
    // flag -- 0 on even cells, 1 on odd -- which is what keeps a band from
    // reading as one stamp repeated N times.
    struct Cell { vec2 e; float hh; float lw; float k; float m; float alt; };

    // The motif library. Every branch draws in cell coordinates only, so a
    // motif can land on any band: the band decides scale through hh and lw.
    void hennaMotif(inout vec3 col, Cell c, Ink ink, vec3 acc, float mi) {
      vec2  e  = c.e;
      float hh = c.hh;
      float m  = c.m;
      float lw = c.lw;

      if (mi < 0.5) {
        // 0 - lotus petals, every other one shortened to a bud
        float pw = mix(0.96, 0.52, c.alt);
        float ph = hh * mix(1.00, 0.62, c.alt);
        float petal = sdLeaf(e, pw, ph);
        over(col, acc,      fillMask(petal) * m);
        over(col, ink.line, lineMask(sdLeaf(e, pw * 0.58, ph * 0.64), lw * 0.8) * m);
        over(col, ink.line, lineMask(petal, lw) * m);

      } else if (mi < 1.5) {
        // 1 - flames with a scroll inside, filled on the odd cells
        float flame = sdLeaf(e, 0.88, 0.94 * hh);
        over(col, acc,      fillMask(flame) * m * c.alt);
        over(col, ink.line, lineMask(sdCurl(e * 1.6, 0.30 / c.k), lw * 0.8) * fillMask(flame) * m);
        over(col, ink.line, lineMask(flame, lw) * m);

      } else if (mi < 2.5) {
        // 2 - chevrons, alternate ones pointing back inward
        float y   = mix(e.y, -e.y, c.alt);
        float tri = max(abs(e.x) * (hh / 0.55) + y - hh, -y - hh);
        over(col, ink.line, fillMask(tri) * m);

      } else if (mi < 3.5) {
        // 3 - teardrops with a ringed eye
        float R    = min(0.98 * hh, 0.86);
        float drop = sdDrop(vec2(e.x, -e.y - 0.20 * R), R);
        over(col, acc,      fillMask(drop) * m);
        over(col, ink.line, lineMask(sdRings(vec2(e.x, e.y + 0.30 * R), 0.22 * R), lw * 0.8) * fillMask(drop) * m);
        over(col, ink.line, lineMask(drop, lw) * m);

      } else if (mi < 4.5) {
        // 4 - leaves textured inside, cross-hatch or rings by cell
        float leaf = sdLeaf(e, 0.94, hh);
        float s    = 0.20 / c.k;
        float tex  = mix(min(sdHatch(e, s, 0.9), sdHatch(e, s, -0.9)), sdRings(e, s * 1.5), c.alt);
        over(col, ink.paper, fillMask(leaf) * m);
        over(col, ink.line,  lineMask(tex, lw * 0.55) * fillMask(leaf) * m);
        over(col, ink.line,  lineMask(leaf, lw) * m);

      } else if (mi < 5.5) {
        // 5 - arcade: an arch per cell springing from the band's inner edge
        vec2  q    = vec2(e.x, e.y + hh);
        float arch = sdArch(q, 0.86, 1.7 * hh);
        over(col, acc,      fillMask(arch) * m);
        over(col, ink.line, lineMask(arch, lw) * m);
        over(col, ink.line, fillMask(length(q - vec2(0.0, hh * 0.85)) - min(0.22, 0.42 * hh)) * m);

      } else if (mi < 6.5) {
        // 6 - diamond lattice, alternately solid and left open with a bead
        float a  = 0.86;
        float b  = max(hh, 1e-3);
        float sc = a * b / (a + b);                 // gradient of the L1 form
        float dia = (abs(e.x) / a + abs(e.y) / b - 1.0) * sc;
        over(col, acc,      fillMask(dia) * m * (1.0 - c.alt));
        over(col, ink.line, lineMask(dia + 0.32 * sc, lw * 0.7) * m * c.alt);
        over(col, ink.line, lineMask(dia, lw) * m);
        over(col, ink.line, fillMask(length(e) - min(0.16, 0.34 * hh)) * m * (1.0 - c.alt));

      } else {
        // 7 - comb: fine rays between two rules, a bead every other cell
        float s    = 0.30 / c.k;
        float rail = abs(e.y) - hh * 0.86;
        over(col, ink.line, lineMask(sdHatch(e, s, 0.0), lw * mix(0.9, 0.5, c.alt)) * fillMask(rail) * m);
        over(col, ink.line, lineMask(rail, lw * 0.8) * m);
        over(col, ink.line, fillMask(length(e) - min(0.15, 0.40 * hh)) * m * c.alt);
      }
    }

    // One band: its flat ground, the motif in every cell, the rule that closes
    // it off. Called once per ring by modeHenna with the ring's own recipe.
    void hennaBand(inout vec3 col, vec2 p, float rr, float r0, float r1,
                   float cells, float mi, float useAlt, float dbl,
                   Ink ink, vec3 bg, vec3 acc, float w, float k) {
      float m = bandMask(rr, r0, r1);
      over(col, bg, m);

      vec3 c = bandCell(p, cells, r0, r1);
      Cell cl;
      cl.e  = cellBox(c);
      cl.hh = 0.46 * c.z;
      cl.lw = w * c.z / max(r1 - r0, 1e-3);
      cl.k  = k;
      cl.m  = m;

      // Alternation has to close on itself going round the band: on an odd cell
      // count the two cells meeting at the seam would both be "odd", so it is
      // switched off there rather than left to show a defect.
      float seg = TAU / cells;
      float idx = floor((atan(p.y, p.x) + seg * 0.5) / seg);
      cl.alt = useAlt * step(mod(cells, 2.0), 0.5) * mod(idx, 2.0);

      hennaMotif(col, cl, ink, acc, mi);

      over(col, ink.line, lineMask(rr - r1, w));
      over(col, ink.line, lineMask(rr - (r1 - 0.020), w * 0.7) * dbl);
    }

    vec3 modeHenna(vec2 uv, float t) {
      Ink ink = inkPalette(u_palette);
      vec3 col = ink.paper;

      vec2  p  = uv;
      float rr = length(p);
      float n  = max(floor(u_symmetry + 0.5), 4.0);
      float k  = clamp(u_complexity, 0.6, 1.6);    // motif density
      float rings = clamp(u_iterations, 1.0, 8.0) - 1.0;   // rings around the medallion
      float seed  = floor(u_petals + 0.5);

      // Stroke weight lives in scene units; each band converts it into its own
      // cell units below, so the line reads the same thickness everywhere.
      float w = 0.0040 * (0.5 + 0.8 * u_bloom);

      const float rM = 0.24;   // medallion edge
      const float rO = 1.30;   // outer edge of the last ring, fixed whatever the
                               // band count, so the plate keeps its framing

      // ---- medallion ----------------------------------------------
      float hm = hRand(seed * 3.0 + 1.0);
      over(col, inkSlot(ink, floor(hRand(seed * 5.0) * 3.0) + 1.0), fillMask(rr - rM));
      vec3 c0 = bandCell(p, n * (hm < 0.5 ? 4.0 : 6.0), 0.12, rM);
      over(col, ink.paper, fillMask(abs(c0.x) - mix(0.30, 0.55, hm)) * bandMask(rr, 0.125, 0.235));
      over(col, ink.paper, fillMask(rr - 0.075));
      over(col, ink.line,  fillMask(rr - 0.020));
      vec3 d0 = bandCell(p, n, 0.070, 0.130);
      over(col, ink.line,  fillMask(length(cellBox(d0)) - mix(0.24, 0.38, hRand(seed * 9.0))));
      over(col, ink.line,  lineMask(rr - rM, w));

      // ---- rings --------------------------------------------------
      // Widths are seeded but normalised to the same total: a three-ring plate
      // is three wide rings, not a small disc adrift in the paper. Two passes
      // because the normaliser needs the sum before the first ring is drawn.
      float tot = 0.0;
      for (int i = 0; i < 7; i++) {
        if (float(i) >= rings) break;
        tot += mix(0.7, 1.5, hRand(seed * 7.0 + float(i) * 3.0));
      }
      float unit = (rO - rM) / max(tot, 1e-3);

      float r0   = rM;
      float slot = 0.0;
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        if (fi >= rings) break;

        float r1 = r0 + unit * mix(0.7, 1.5, hRand(seed * 7.0 + fi * 3.0));
        float h1 = hRand(seed * 13.0 + fi * 5.0);
        float h2 = hRand(seed * 23.0 + fi * 11.0);

        // Cell count: start from the count that would make cells square (half
        // arc == band width), then let the seed thin it out or crowd it. Kept
        // to whole multiples of the symmetry so every ring stays in register.
        float want = 1.57 * (r0 + r1) / max(r1 - r0, 1e-3) / n;
        float mult = clamp(floor(want * mix(0.75, 1.35, h2) + 0.5), 1.0, 6.0);

        // Never the same flat colour twice in a row: adjacent rings would melt
        // into one wide band and the plate would lose its count of rings.
        slot = mod(slot + 1.0 + floor(hRand(seed * 41.0 + fi * 13.0) * 3.0), 4.0);

        hennaBand(col, p, rr, r0, r1, n * mult,
                  floor(h1 * 8.0),                          // motif
                  step(0.35, hRand(seed * 31.0 + fi * 7.0)), // alternate cells?
                  step(0.72, h2),                            // doubled rule?
                  ink, inkSlot(ink, slot), inkSlot(ink, slot + 2.0), w, k);

        r0 = r1;
      }

      // ---- rim finial ---------------------------------------------
      // Always drawn: it is what makes the disc look finished rather than cut.
      float fin = floor(hRand(seed * 53.0 + 2.0) * 3.0);
      vec3  fc  = bandCell(p, n * 4.0, rO, rO + 0.16);
      vec2  fe  = cellBox(fc);
      float g   = step(rO - 0.005, rr);
      if (fin < 0.5) {
        // dotted stalks
        float stalk = min(sdSegment(vec2(fc.x, fc.y), vec2(0.0, 0.0), vec2(0.0, 0.62)) - 0.10,
                          length(vec2(fc.x, (fc.y - 0.74) * fc.z)) - 0.26);
        over(col, ink.line, fillMask(stalk) * g);
      } else if (fin < 1.5) {
        // saw teeth
        float hh  = 0.46 * fc.z;
        float tri = max(abs(fe.x) * (hh / 0.75) + fe.y - hh, -fe.y - hh);
        over(col, ink.line, fillMask(tri) * g);
      } else {
        // scallops beaded at the crest
        vec2  q  = vec2(fe.x, fe.y + 0.46 * fc.z);
        float sc = length(q) - 0.80;
        over(col, ink.line, lineMask(sc, w * fc.z / 0.16) * g);
        over(col, ink.line, fillMask(length(q - vec2(0.0, 0.80)) - 0.18) * g);
      }

      return col;
    }

    // =================================================================
    //  MODE 9 - Muqarnas (stalactite vault seen from below)
    //  Flat-ink like mode 8. Concentric tiers of little arched niches, the
    //  cell count doubling every couple of tiers so the cells stay roughly
    //  square as the hood widens. Depth is carried by three flat tones, the
    //  way the vaults are drawn rather than the way they are lit.
    // =================================================================
    vec3 modeMuqarnas(vec2 uv, float t) {
      Ink ink = inkPalette(u_palette);
      vec3 col = ink.paper;

      float rr = length(uv);
      float n0 = max(u_symmetry, 4.0);
      float k  = clamp(u_complexity, 0.6, 1.6);
      float tiers = clamp(u_iterations, 2.0, 8.0);
      float w = 0.0040 * (0.5 + 0.8 * u_bloom);
      float R = 1.30;
      // The one control this mode had left unused, so the slider sat inert. Here
      // it is a lobe count: the fan cut into every niche head, the boss on the
      // alternating cells, and the crown rosette all take it, so a change reads
      // across the whole vault instead of in one detail.
      float pet = max(u_petals, 3.0);

      over(col, ink.c3, fillMask(rr - R));

      // i = 0 is the outermost tier. Tier depth follows a power law: equal
      // radial steps read as a flat target, not as a vault receding to a crown.
      for (int i = 0; i < 8; i++) {
        float fi = float(i);
        if (fi >= tiers) break;

        float r1 = R * pow((tiers - fi)       / tiers, 1.25);
        float r0 = R * pow((tiers - fi - 1.0) / tiers, 1.25);
        float cells = n0 * pow(2.0, floor((tiers - 1.0 - fi) * 0.5));

        float m = bandMask(rr, r0, r1);
        vec3  c = bandCell(uv, cells, r0, r1);
        vec2  e = cellBox(c);
        float hh = 0.5 * c.z;
        float lw = w * c.z / max(r1 - r0, 1e-3);

        // Which way the cell alternates: staggering by tier is what stops the
        // niches lining up into radial gutters.
        float seg = TAU / cells;
        float cid = floor((atan(uv.y, uv.x) + seg * 0.5) / seg);
        float alt = mod(cid + fi, 2.0);

        // Niche springing at the outer edge of the tier, apex pointing inward.
        vec2  a = vec2(e.x, hh - e.y);
        float niche  = sdArch(a, 0.92, 1.80 * hh);
        float soffit = sdArch(a - vec2(0.0, 0.24 * hh), 0.92 * (0.68 - 0.10 * k), 1.10 * hh);

        // Depth reads as tone, not as light: the hood steps lighter tier by
        // tier toward the crown. Alternation only moves the accent boss, so
        // the tiers stay legible instead of turning into a checkerboard.
        float tone = fi / max(tiers - 1.0, 1.0);
        // The tier ground goes down first: an arch only ever covers the middle
        // of its cell, so without it the spandrels leak the hood colour and the
        // vault reads as scattered tiles instead of a continuous surface.
        // The ramp stays inside the three fills: routing it through ink.paper
        // muddies every dark-paper palette to grey in the middle tiers.
        over(col, mix(ink.c1, ink.c3, tone), m);
        over(col, mix(ink.c2, ink.c1, tone), fillMask(niche) * m);
        over(col, mix(ink.c3, ink.c2, tone), fillMask(soffit) * m);

        // Flutes in the semidome, converging on its apex the way the ribs of a
        // real cell do. FW() widens them as length(q) shrinks, so they dissolve
        // near the meeting point instead of piling into a blot: no guard needed.
        vec2  q    = a - vec2(0.0, 1.34 * hh);
        float fseg = PI / pet;
        float fang = atan(q.x, -q.y);
        float fd   = abs(mod(fang + fseg * 0.5, fseg) - fseg * 0.5) * length(q);
        over(col, ink.line, lineMask(fd, lw * 0.6) * fillMask(soffit) * m);

        // Boss on the alternating cells: same lobe count, so the slider stays
        // one decision. sdRose is a polar radius, hence the 1/2.4 rescale that
        // keeps FW() antialiasing honest after the coordinate scale.
        over(col, ink.c1, fillMask(sdRose((a - vec2(0.0, 0.80 * hh)) * 2.4, pet) * 0.42) * m * alt);
        over(col, ink.line, lineMask(soffit, lw * 0.8) * m);
        over(col, ink.line, lineMask(niche,  lw) * m);
        over(col, ink.line, lineMask(rr - r1, w));
      }

      // Crown: the small rosette the tiers converge on.
      float rc = R * pow(1.0 / tiers, 1.25);
      over(col, ink.c1, fillMask(rr - rc));
      vec3 cc = bandCell(uv, pet * 2.0, 0.0, rc);
      over(col, ink.paper, fillMask(abs(cc.x) - 0.42) * fillMask(rr - rc * 0.92));
      over(col, ink.line,  fillMask(rr - rc * 0.20));
      over(col, ink.line,  lineMask(rr - rc, w));

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
      else if (u_mode < 8.5) col = modeHenna  (uv, t);
      else                   col = modeMuqarnas(uv, t);

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
