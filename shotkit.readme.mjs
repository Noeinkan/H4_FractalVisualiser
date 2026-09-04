/**
 * shotkit config — the handful of screenshots the README links to.
 *
 *   node C:/Personal_utilities/screenshot-kit/shotkit.mjs --config shotkit.readme.mjs --serve
 *
 * Run it from the repo root: outDir is resolved against the working directory,
 * not against this file.
 *
 * Why a second config rather than more shots in the first one:
 *
 * - `.shots/` is scratch and is gitignored. These are versioned, so they must
 *   land somewhere else and stay small — 1200x750 at scale 1, not the 2880x1800
 *   of the main suite, because they go into git history and never come out.
 * - Only the outputs of a run are ignored (manifest, contact sheet, server log);
 *   the PNGs themselves are committed, so the README renders on GitHub and on
 *   the deployed copy without a capture step.
 * - The shot definitions are taken from shotkit.config.mjs and only renamed, so
 *   a re-framed shot there re-frames the README image too. The one shot defined
 *   here is the narrow-screen panel, which the main suite has no reason to hold.
 */

import base, { fresh, hash } from './shotkit.config.mjs';

const pick = (from, name) => {
  const shot = base.shots.find(s => s.name === from);
  if (!shot) throw new Error(`shotkit.readme: no shot named ${from} in shotkit.config.mjs`);
  return { ...shot, name };
};

export default {
  ...base,

  outDir: 'screenshots',
  viewport: { width: 1200, height: 750 },
  deviceScaleFactor: 1,

  shots: [
    pick('01-floral-garden', 'hero-floral-garden'),
    pick('11-vault-arcade', 'vault'),
    pick('12-mihrab-lamp', 'mihrab'),
    pick('10-muqarnas', 'muqarnas'),
    pick('08-henna-navy', 'henna'),
    {
      // Below 620px the panel is a bottom sheet and main.js starts it closed,
      // so `fresh(false)` is doing real work here: it opens the panel the way a
      // user would, through the toggle.
      name: 'panel-narrow',
      viewport: { width: 390, height: 760 },
      path: hash({ m: 9, s: 6, p: 6, i: 6, z: 2.9, c: 1, v: 0, b: 0.85, g: 2, x: 0, y: 0, r: 0 }),
      waitFor: '#gl',
      prepare: fresh(false),
      shows: 'the control panel on a phone-width viewport: below 620px it becomes a bottom sheet with the sliders in two columns, and it opens from the toggle rather than covering the canvas on load',
      alt: 'A phone-shaped screenshot of the mandala app with the control panel docked as a sheet across the bottom half'
    }
  ]
};
