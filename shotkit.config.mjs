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
 *   c=complexity v=speed b=bloom g=palette x/y=pan r=rotation.
 * - `z` multiplies the uv coordinates: HIGHER z = wider view, LOWER z = deep
 *   zoom. Modes 0, 2 and 3 only show structure below z≈1; modes 1 and 5 want
 *   z≈1.6–2.8.
 * - **u_time matters more than any slider.** At t=0 (speed 0) modes 0, 2, 3 and
 *   4 render as a near-flat wash — they only resolve once the animation has run
 *   a few seconds. So every shot sets a speed `v` and each `prepare` RELOADS the
 *   page: a hash-only navigation does not reload, so without it `timeAccum`
 *   would carry over from the previous shot and nothing would be reproducible.
 *   With the reload, t ≈ (settleMs/1000 + ~0.3) * v, i.e. ≈6.5 at v=2.
 * - The panel is toggled with `#toggle`; the page is reused across shots, so
 *   each shot must state which panel state it wants rather than assume.
 * - Modes 6 (Volta a Spicchi) and 7 (Mihrab) are deliberately NOT captured.
 *   Across ~20 parameter combinations both render as a flat filled silhouette —
 *   mode 7's niche fills solid gold, mode 6 only fills a couple of its panels.
 *   That looks like a shader bug, not a framing problem; captioning either as
 *   working would oversell it.
 * - No async loading: the first frame is up as soon as the shader links.
 */

const hash = o => '/#' + Object.entries(o).map(([k, v]) => `${k}=${v}`).join('&');

const setPanel = async (page, collapsed) => {
  const is = await page.$eval('#panel', el => el.classList.contains('collapsed'));
  if (is !== collapsed) await page.click('#toggle');
  await page.waitForSelector(collapsed ? '#panel.collapsed' : '#panel:not(.collapsed)');
};

// Reload so u_time restarts at 0 for this shot, then set the panel state.
const fresh = collapsed => async page => {
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
      shows: 'the app as it opens: Giardino Floreale (islimi) at twelve-fold symmetry in the Emerald Garden palette, with the full control panel — mode, symmetry, petals, field of view, iterations, complexity, speed, palette, bloom, and the Pausa / Random / PNG / Centra row',
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
      shows: 'Henna — the flat-ink mandala mode: eight concentric bands, each with its own symmetry count and motif, drawn as flat fills with a constant-width outline instead of the glow used by modes 0-7; Persian Blue',
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
