/**
 * shotkit config — Fractal Mandala Visualiser
 *   node C:/Personal_utilities/screenshot-kit/shotkit.mjs --serve
 *
 * What took time on the first run, so it does not have to next time:
 *
 * - Static site, no build step and no npm scripts: any static file server on
 *   the repo root works. `python -m http.server` is used below.
 * - One full-screen WebGL canvas, so `gpu: true` is not optional — on
 *   SwiftShader the heavier modes cost seconds per frame.
 * - Every state is reachable from the URL hash; main.js `restore()` reads it on
 *   load. Keys: m=mode s=symmetry p=petals i=iterations z=field-of-view
 *   c=complexity v=speed b=bloom g=palette t=clock h=hue k=saturation
 *   x/y=pan r=rotation. A hash that omits t, h or k gets 0, 0 and 1 — so the
 *   shots below, written before those keys existed, still frame what they say.
 * - In mode 8 `p` is not a petal count but the plate's seed: it decides band
 *   widths, cell counts, motifs and fills. Change it and the whole composition
 *   changes, so a Henna shot is only reproducible with its p pinned. In mode 9
 *   `p` is a lobe count — the flutes in each niche head, the boss on the
 *   alternating cells and the crown rosette — so it changes the drawing there
 *   too, just without moving the geometry of the tiers.
 * - `z` multiplies the uv coordinates: HIGHER z = wider view, LOWER z = deep
 *   zoom. Modes 0, 2 and 3 only show structure below z≈1; modes 1 and 5 want
 *   z≈1.6–2.8.
 * - **u_time matters more than any slider.** At t=0 (speed 0) modes 0, 2, 3 and
 *   4 render as a near-flat wash — they only resolve once the animation has run
 *   a few seconds. So every shot sets a speed `v` and each `prepare` RELOADS the
 *   page: a hash-only navigation does not reload, and the clock would otherwise
 *   carry over from the previous shot. With the reload, t ≈ (settleMs/1000 +
 *   ~0.3) * v, i.e. ≈6.5 at v=2. Since the clock became the hash key `t`, a
 *   shot can also pin the instant outright — set t and v=0 — which is steadier
 *   than timing it, but the shots below still use the settle-time recipe.
 * - The panel is toggled with `#toggle`; the page is reused across shots, so
 *   each shot must state which panel state it wants rather than assume.
 * - Modes 6 (Volta a Spicchi) and 7 (Mihrab) were rewritten on bounded frames
 *   and are captured again in shots 11 and 12. Both are still worth probing
 *   before you re-frame them: mode 6 goes hazy in the inner courses at high
 *   complexity, mode 7 is the mode whose iteration slider used to flood the
 *   niche solid gold, so check the top of its range rather than assuming it.
 * - Mode 7 has an up. Like the two ink modes it ships with speed 0, because
 *   main() spins the scene with u_time: give it a speed and the niche tips.
 * - No async loading: the first frame is up as soon as the shader links.
 */

// Exported by name as well as through the default config: shotkit.readme.mjs
// builds the versioned README screenshots on top of these, so there stays one
// definition of what a shot of this app is.
export const hash = o => '/#' + Object.entries(o).map(([k, v]) => `${k}=${v}`).join('&');

export const setPanel = async (page, collapsed) => {
  const is = await page.$eval('#panel', el => el.classList.contains('collapsed'));
  if (is !== collapsed) await page.click('#toggle');
  await page.waitForSelector(collapsed ? '#panel.collapsed' : '#panel:not(.collapsed)');
};

// Reload so u_time restarts at 0 for this shot, then set the panel state.
// Below 620px main.js starts the panel collapsed, so `fresh(false)` is what
// opens it in a narrow viewport — do not assume the load state.
export const fresh = collapsed => async page => {
  await page.reload({ waitUntil: 'load' });
  await setPanel(page, collapsed);
};

// Deterministic "Random": the click handler calls Math.random(), so seeding it
// first makes the randomised state reproducible.
const seededRandom = seed => async page => {
  await page.reload({ waitUntil: 'load' });
  await setPanel(page, false);
  await page.evaluate(s => {
    let x = s;
    Math.random = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  }, seed);
  await page.click('#randomize');
};

export default {
  baseUrl: 'http://127.0.0.1:5188',

  server: {
    command: 'python -m http.server 5188 --bind 127.0.0.1',
    readyUrl: 'http://127.0.0.1:5188/',
    timeoutMs: 60000
  },

  outDir: '.shots',
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  settleMs: 3000,          // this is the animation clock, not a load wait
  gpu: true,

  mask: [],

  shots: [
    {
      name: '01-floral-garden',
      // panned left (x) so the mandala clears the control panel
      path: hash({ m: 1, s: 12, p: 6, i: 7, z: 2.8, c: 1.1, v: 2, b: 1, g: 7, x: -0.12, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(false),
      shows: 'the app as it opens: Giardino Floreale (islimi) at twelve-fold symmetry in the Emerald Garden palette, with the full control panel — mode, symmetry, petals, field of view, iterations, complexity, speed, time, palette, hue, saturation, bloom, each with its padlock, then the Pausa / Random / Varia / PNG / Centra row and the undo / redo / A-B / save row under it',
      alt: 'A twelve-fold green and gold arabesque mandala on deep blue, with a dark control panel of sliders on the right'
    },
    {
      name: '02-julia-bloom',
      path: hash({ m: 3, s: 10, p: 6, i: 9, z: 0.5, c: 1.05, v: 2, b: 1, g: 3, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'Julia Bloom — the escape-time fractal mode, ten-fold, nine iterations, zoomed to field of view 0.5 so the filaments resolve; Turquoise Night palette',
      alt: 'A ring of blue and red Julia-set filaments around a pale core on a turquoise ground'
    },
    {
      name: '03-dome-spiral',
      path: hash({ m: 5, s: 18, p: 5, i: 6, z: 1.6, c: 1.1, v: 2, b: 1, g: 1, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'Cupola Spirale (Lotfollah) at eighteen-fold symmetry in Azulejo — the log-polar dome tessellation receding to a vanishing point, the mode that reads most like real tilework',
      alt: 'A dome seen from below, rings of blue rosette tiles spiralling into a dark centre'
    },
    {
      name: '04-kaleido-ifs',
      // bloom 1.8 (not the 0.85 default): at b=1 this mode's line work is barely
      // above the background — the glow term is what makes it legible.
      path: hash({ m: 0, s: 12, p: 6, i: 10, z: 0.6, c: 0.9, v: 2, b: 1.8, g: 2, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'Kaleido IFS at ten iterations — the fold-and-invert iterated function system, the most purely fractal of the eight modes; Gold & Cobalt',
      alt: 'A dense teal kaleidoscopic web of twelve-fold folded fractal lines'
    },
    {
      name: '05-girih-stars',
      // z=0.25: the girih tiles only read this far in; wider and they smear
      // into concentric blur.
      path: hash({ m: 2, s: 8, p: 6, i: 7, z: 0.25, c: 1, v: 0.7, b: 1, g: 5, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'Girih Stars — the radial star-and-polygon lattice at eight-fold, zoomed into the inner rings where the nested stars and interlacing lines are readable',
      alt: 'Gold girih star and polygon fragments scattered in rings on a deep blue ground'
    },
    {
      name: '06-shamsa-medallion',
      path: hash({ m: 4, s: 12, p: 8, i: 8, z: 0.8, c: 1.3, v: 2, b: 1, g: 5, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'Shamsa — the sunburst medallion at twelve-fold symmetry, its nested star outlines over the radial ray field; Isfahan Gold',
      alt: 'A twenty-four ray sunburst in gold and magenta radiating from a small nested star rosette'
    },
    {
      name: '07-monochrome-ink',
      path: hash({ m: 5, s: 10, p: 5, i: 6, z: 0.5, c: 1.2, v: 2, b: 1, g: 4, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'what the palette and field-of-view controls do to one mode: the same dome as shot 03, re-coloured to Monochrome Ink and zoomed from 1.6 to 0.5 so individual tiles fill the frame',
      alt: 'A grey and gold monochrome dome of oval tiles receding into the distance'
    },
    {
      name: '08-henna-navy',
      // v=0 on purpose: mode 8 is a plate, not an animation, and any speed
      // spins it. z=3.2 is the framing that just holds the outer crown (r~1.46).
      path: hash({ m: 8, s: 8, p: 6, i: 8, z: 3.2, c: 1, v: 0, b: 0.85, g: 0, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'Henna — the flat-ink mandala mode: eight concentric bands, each with its own symmetry count and motif, drawn as flat fills with a constant-width outline instead of the glow used by modes 0-7; Persian Blue at seed p=6',
      alt: 'A navy, coral and sage mandala of concentric petal and teardrop rings on off-white paper'
    },
    {
      name: '09-henna-saffron',
      // same plate, palette 5: the two reference plates differ only in colour,
      // which is the point of keeping the ink scheme separate from the geometry.
      path: hash({ m: 8, s: 10, p: 6, i: 8, z: 3.2, c: 1.2, v: 0, b: 0.85, g: 5, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'the same Henna plate at ten-fold symmetry in Isfahan Gold — showing that in the ink modes the palette swaps flat fills rather than shifting a gradient',
      alt: 'A saffron, red and teal mandala of concentric petal rings on cream paper'
    },
    {
      name: '10-muqarnas',
      // g=2 (Gold & Cobalt) is the one palette with a dark paper: in an ink
      // mode that reads as glazed tilework rather than as a drawing, which is
      // what a muqarnas hood wants.
      path: hash({ m: 9, s: 6, p: 6, i: 6, z: 2.9, c: 1, v: 0, b: 0.85, g: 2, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'Muqarnas — the stalactite vault seen from below: six tiers of little pointed-arch niches, the cell count doubling every couple of tiers so the cells stay roughly square as the hood widens; Gold & Cobalt',
      alt: 'A cobalt and gold vault of concentric tiers of small arched niches seen from directly below'
    },
    {
      name: '11-vault-arcade',
      // s=16 rather than the mode's own preset of 10: the rim arcade is what
      // makes this read as a vault, and it needs enough panels to be a rhythm.
      path: hash({ m: 6, s: 16, p: 6, i: 4, z: 2.7, c: 0.8, v: 0.5, b: 1.2, g: 5, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'Volta a Spicchi — the ribbed vault from below: sixteen ribs converging on the boss, four courses of lozenges across the webbing, and the arcade of pointed arches where the webbing springs from the wall; Isfahan Gold',
      alt: 'A vault seen from below, green arches around the rim and blue ribs converging on a dark central boss'
    },
    {
      name: '12-mihrab-lamp',
      // v=0 like the ink modes: the niche has an up, and main()'s u_time
      // rotation would tip it. i=5 is deliberately near the top of this mode's
      // range — the point of the rewrite is that the range is now usable.
      path: hash({ m: 7, s: 10, p: 5, i: 5, z: 1.7, c: 1, v: 0, b: 0.85, g: 5, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'Mihrab — the pointed-arch niche: a two-centred arch on a rectangular jamb, the hanging lamp on its chain, and the islimi vine filling the ground at five folds; Isfahan Gold',
      alt: 'A pointed-arch niche in magenta and gold, filled with a fine vine lattice, a hanging lamp at its centre'
    },
    {
      name: '13-henna-seed',
      // Same controls as shot 08 apart from p: in mode 8 that slider is the
      // plate's seed, so this is the fastest way to see how far the composition
      // moves without touching symmetry, band count or palette.
      path: hash({ m: 8, s: 8, p: 11, i: 8, z: 3.2, c: 1, v: 0, b: 0.85, g: 0, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'the Henna seed at work — shot 08 with p changed from 6 to 11 and nothing else: different band widths, different cell counts, different motifs and fills, same symmetry and same palette',
      alt: 'A navy, coral and sage mandala of concentric rings on off-white paper, differently composed from the earlier one'
    },
    {
      name: '14-muqarnas-lobes',
      // Shot 10 with p taken from 6 to 12 and nothing else: the tiers, their
      // cell counts and the tones are unchanged, only the carving inside each
      // niche and the crown. It is the cheapest way to see the Petali slider
      // doing something in this mode, which for a while it did not.
      path: hash({ m: 9, s: 6, p: 12, i: 6, z: 2.9, c: 1, v: 0, b: 0.85, g: 2, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(true),
      shows: 'the Petali slider in Muqarnas — the same vault as shot 10 at p=12: twelve flutes fanning across each niche head, twelve-pointed bosses on the alternating cells, and a denser crown rosette',
      alt: 'A cobalt and gold muqarnas vault whose small arched niches are each carved with a fan of fine gold ribs'
    },
    {
      name: '08-randomize',
      path: hash({ m: 5, s: 12, p: 5, i: 6, z: 1.2, c: 1, v: 0.7, b: 1, g: 2, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      // Math.random is seeded in prepare, so this randomised state is stable.
      prepare: seededRandom(2024),
      shows: 'the Random button in action — one click rewrites symmetry, petals, iterations, field of view, speed, bloom and palette at once, and the panel on the right shows the values it landed on',
      alt: 'A randomised turquoise and blue dome pattern with the control panel showing the new slider values'
    }
  ]
};
