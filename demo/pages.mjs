// Everything the demo server says in words: the walls a visitor can meet, and
// the two tags that turn index.html into the demo page. UI copy is Italian,
// like the rest of the visualiser.

export const CONTACT_URL = "https://noeinsolutions.com/it/contact.html";

// The first script tag of index.html. The demo boot goes right before it, so
// demo.js runs ahead of main.js and can seed the hash that restore() reads.
const FIRST_SCRIPT = '<script src="shader.js"></script>';

export function injectDemo(indexHtml, boot) {
  if (!indexHtml.includes("</head>") || !indexHtml.includes(FIRST_SCRIPT)) {
    throw new Error(`index.html no longer has </head> and ${FIRST_SCRIPT}: demo/pages.mjs cannot inject the demo`);
  }
  // `<` escaped so no value can close the inline script early.
  const json = JSON.stringify(boot).replace(/</g, "\\u003c");
  const css = '<link rel="stylesheet" href="demo/demo.css" />\n';
  const js = `<script>window.FRACTAL_DEMO = ${json};</script>\n<script src="demo/demo.js"></script>\n`;
  // Function replacers: a string replacement would read `$&` and friends.
  return indexHtml
    .replace("</head>", () => css + "</head>")
    .replace(FIRST_SCRIPT, () => js + FIRST_SCRIPT);
}

const shell = (title, body) => `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>${title} · Fractal Mandala Visualiser</title>
<style>
  html, body { margin: 0; height: 100%; }
  body {
    display: grid; place-items: center; padding: 24px; box-sizing: border-box;
    background: radial-gradient(ellipse at center, #0c1226 0%, #05070d 70%);
    color: #d8e6ff; font: 15px/1.6 "Inter", "Segoe UI", system-ui, sans-serif;
  }
  main {
    max-width: 480px; padding: 28px 30px; border-radius: 14px;
    background: rgba(10, 14, 28, 0.78); border: 1px solid rgba(120, 180, 255, 0.18);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }
  h1 { margin: 0 0 12px; font-size: 20px; font-weight: 600; }
  p { margin: 0 0 12px; color: #b9c9e6; }
  a { color: #6fb4ff; }
  .cta {
    display: inline-block; margin-top: 8px; padding: 8px 14px; border-radius: 8px;
    background: rgba(60, 100, 170, 0.55); border: 1px solid rgba(120, 180, 255, 0.3);
    color: #d8e6ff; text-decoration: none;
  }
</style>
</head>
<body><main>
<h1>${title}</h1>
${body}
</main></body>
</html>
`;

// The ended wall names what the visitor saw and offers one way onward. It
// never offers to start again: only the owner can grant another session.
export const ended = cfg => shell("La demo è finita", `
<p>I tuoi ${cfg.sessionMinutes} minuti con il visualizzatore sono finiti: le modalità
di rendering ispirate alla geometria islamica, le palette e le simmetrie
regolate dal vivo, le viste che diventano un link.</p>
<p>Ogni visitatore ha una sessione sola, e questa non si rinnova.</p>
<p><a class="cta" href="${CONTACT_URL}">Scrivici per parlarne</a></p>`);

export const capacity = cfg => shell("Troppe demo da questa rete", `
<p>Da questa connessione sono già partite ${cfg.sessionsPerIpPerDay} demo oggi,
il massimo per un solo indirizzo. Il conteggio si azzera a mezzanotte UTC.</p>
<p>Capita su reti condivise, come un ufficio o un operatore mobile.</p>
<p><a class="cta" href="${CONTACT_URL}">Scrivici per parlarne</a></p>`);

export const privateSite = () => shell("Versione completa riservata", `
<p>Questo indirizzo è la versione completa del visualizzatore, riservata.</p>
<p><a class="cta" href="/demo">Apri la demo pubblica</a></p>`);

export const notConfigured = () => shell("Versione completa chiusa", `
<p>La versione completa non è disponibile in questo momento.</p>
<p><a class="cta" href="/demo">Apri la demo pubblica</a></p>`);

export const notFound = () => shell("Pagina non trovata", `
<p>Qui non c'è niente.</p>
<p><a class="cta" href="/demo">Apri la demo</a></p>`);
