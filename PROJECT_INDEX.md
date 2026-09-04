# Project Index

Mappa dei file della repo, con i punti di ingresso di ciascuno. I numeri di riga
si riferiscono allo stato del ramo `main`; se non tornano più, il titolo di
sezione resta comunque cercabile.

## Struttura

```
H4_FractalVisualiser/
├── index.html            markup, canvas, pannello dei controlli
├── style.css             tema scuro, pannello, slider, notice
├── shader.js             sorgenti GLSL — window.FRACTAL_SHADER
├── tuning.js             storia, A/B, lucchetti, viste salvate — window.FRACTAL_TUNING
├── main.js               contesto GL, stato, UI, permalink, input, render loop
├── shotkit.config.mjs    config screenshot-kit, suite di lavoro (non usata a runtime)
├── shotkit.readme.mjs    config screenshot-kit, le immagini del README
├── screenshots/          le sei immagini del README — versionate
├── .deploy/              deploy statico dietro nginx condiviso
├── .shots/               screenshot generati (gitignored)
├── LICENSE               MIT
├── README.md             panoramica per chi usa il progetto
├── CLAUDE.md             note per gli agenti
└── roadmap.md            piano, nel formato letto da repo-radar
```

## [index.html](index.html)

Nessuno script inline. Carica `shader.js` e `tuning.js` prima di `main.js` —
l'ordine conta: `main.js` legge `window.FRACTAL_SHADER` all'avvio e si ferma con
un notice fatale se non lo trova, mentre di `window.FRACTAL_TUNING` fa a meno
con uno stub.

Elementi con id: `gl` (canvas), `notice`, `panel`, `toggle`, `controls`,
`preset`, `mode`, `symmetry`, `petals`, `zoom`, `iterations`, `complexity`,
`speed`, `time`, `palette`, `hue`, `sat`, `bloom`, `pause`, `randomize`, `vary`,
`screenshot`, `reset`, `undo`, `redo`, `ab`, `saveview`.

Ogni controllo è un `<div class="ctl">` con dentro una `.head` — il nome
(`<label class="name" for>`, riscritto per modalità da `syncPanel()`), il valore
(`<span data-out="<id>">`, reso scrivibile da `tuning.js`) e il lucchetto
(`<button class="lock" data-lock="<id>">`) — e poi l'input. Il nome è un `label`
con `for` invece di un `<label>` che avvolge tutto proprio perché lucchetto e
readout non vengano inghiottiti dall'attivazione dell'etichetta.

`#zoom` ha `min`/`max` in unità di traccia (0–2000), non in valori di zoom: la
traccia è esponenziale, vedi `SLIDERS` in `main.js`. `#preset` ha in markup solo
il segnaposto: le viste nominate le aggiunge `main.js` da `NAMED_PRESETS` e
quelle dell'utente `tuning.js` in un `<optgroup>`. La classe `wide` sui tre
`.ctl` che contengono un `<select>` è ciò che, su schermo stretto, li fa occupare
entrambe le colonne della griglia.

## [shader.js](shader.js) — 1094 righe

IIFE che espone `window.FRACTAL_SHADER = { VERT, FRAG_BODY }`. `FRAG_BODY`
**non** contiene la riga `#extension`: la antepone `buildGL()`.

| Riga | Cosa |
|---|---|
| [11](shader.js#L11) | `VERT` — fullscreen quad, passthrough |
| [16](shader.js#L16) | inizio `FRAG_BODY`: uniform, `PI`/`TAU`/`GOLD`, `rot()` |
| [42](shader.js#L42) | `kaleido(p, n)` — piega caleidoscopica a n specchi |
| [52](shader.js#L52) | `sdRose(p, k)` — SDF di una rosa a k petali |
| [60](shader.js#L60) | `sdPolygon(p, n, R)` — SDF poligono regolare |
| [68](shader.js#L68) | `sdStar(p, n, R)` — intersezione di due poligoni ruotati |
| [79](shader.js#L79) | `fillMask` / `lineMask` — copertura antialiasata da una distanza |
| [82](shader.js#L82) | `sdSegment(p, a, b)` — SDF di un segmento |
| [92](shader.js#L92) | `sdArch(p, w, h)` — arco a due centri, acuto o a tutto sesto |
| [108](shader.js#L108) | `bandCell` / `cellBox` / `bandMask` — coordinate locali di una corona |
| [126](shader.js#L126) | `pal()` + `pickPalette()` — le otto palette |
| [161](shader.js#L161) | `modeKaleido` — modalità 0, IFS + inversione |
| [193](shader.js#L193) | `modeFloral` — modalità 1, arabesco islimi |
| [252](shader.js#L252) | `modeGirih` — modalità 2, tassellatura stellare |
| [312](shader.js#L312) | `modeJulia` — modalità 3, insieme di Julia |
| [351](shader.js#L351) | `modeVault` — modalità 6, volta costolonata con arcata sul bordo |
| [445](shader.js#L445) | `modeMihrab` — modalità 7, nicchia con lampada e viticci |
| [540](shader.js#L540) | `modeDome` — modalità 5, spirale a cupola |
| [606](shader.js#L606) | `modeShamsa` — modalità 4, medaglione |
| [643](shader.js#L643) | toolkit inchiostro piatto: `Ink`, `inkPalette`, `over` |
| [672](shader.js#L672) | vocabolario di motivi: `sdLeaf`, `sdDrop`, `sdRings`, `sdHatch`, `sdCurl` |
| [715](shader.js#L715) | `hRand` / `inkSlot` — hash del seme e scelta di una campitura |
| [732](shader.js#L732) | `Cell` + `hennaMotif` — gli otto motivi che una banda può ospitare |
| [812](shader.js#L812) | `hennaBand` — una corona: fondo, motivo in ogni cella, filetto |
| [839](shader.js#L839) | `modeHenna` — modalità 8, mandala a bande piatte generate dal seme |
| [943](shader.js#L943) | `modeMuqarnas` — modalità 9, volta a stalattiti |
| [1038](shader.js#L1038) | `trim()` — rotazione di tinta e saturazione, per tutte le modalità |
| [1047](shader.js#L1047) | `main()` — pan/zoom/rotazione, dispatch, vignette e tonemap (solo modalità 0–7), poi il trim |

L'ordine delle funzioni nel file non segue quello delle modalità: il dispatch in
`main()` è la sola fonte affidabile.

## [main.js](main.js) — 891 righe

IIFE in `"use strict"`. Sezioni, nell'ordine in cui compaiono:

| Riga | Sezione | Contenuto |
|---|---|---|
| [4](main.js#L4) | Notices | `showNotice` / `hideNotice`, errori fatali con escaping |
| [29](main.js#L29) | Contesto GL | `GL_OPTS`, `getContext`, uscita se WebGL manca |
| [47](main.js#L47) | Programma GL | `compile()`, `buildGL()`, header `FW()`, uniform in `U` |
| [129](main.js#L129) | Context loss | listener `webglcontextlost` / `restored` |
| [142](main.js#L142) | Costanti | `ZOOM_MIN/MAX`, `MODE_ITER_MAX`, `SLIDERS` + `toSlider`/`fromSlider`, `MODE_UI`, `clamp` |
| [236](main.js#L236) | Stato | oggetto `state`, `modePresets` per modalità |
| [289](main.js#L289) | `NAMED_PRESETS` | le viste nominate del menu: permalink + `t` iniziale |
| [324](main.js#L324) | Resize + risoluzione adattiva | `setBuffer()`, `renderScale`, `touchInput()` |
| [358](main.js#L358) | UI | `$`, `setControl`, `bindRange`, i bottoni, Random per modalità |
| [426](main.js#L426) | Pannello adattivo | `sliders`, `syncPanel()`, `applyMode()` |
| [455](main.js#L455) | Banco di regolazione | crea `tuning` da `tuning.js`, o lo stub se manca |
| [566](main.js#L566) | Screenshot | `saveScreenshot` — piena risoluzione, cattura nello stesso task |
| [586](main.js#L586) | Permalink | `serialize`/`deserialize`/`applyState`/`persist`, `HASH_MAP`, restore |
| [685](main.js#L685) | Menu dei preset | riempie `#preset` e installa la vista scelta |
| [711](main.js#L711) | Interazione | `clientToUV`, `panBy`, `zoomAt`, pointer, pinch, wheel |
| [818](main.js#L818) | Render loop | `render()` on-demand, `adapt()` e `frame()` |

Concetti chiave: `dirty`/`markDirty()` (si disegna solo quando serve),
`renderScale` (il buffer si restringe mentre la scena si muove),
`restoring` (sopprime preset e scritture URL durante un restore),
`schedulePersist()` (debounce 250 ms su hash + `localStorage`, ed è anche il
punto in cui il menu dei preset torna al segnaposto).

## [tuning.js](tuning.js) — 342 righe

IIFE che espone `window.FRACTAL_TUNING = { create(ctx) }`. Non tocca GL né
`state`: `main.js` gli passa un contesto (`setControl`, `serialize`,
`deserialize`, `applyState`, `persist`, `MODE_UI`, `modePresets`, `DEFAULTS`,
`SLIDER_IDS`, `toSlider`) e riceve `{ record, isLocked, applyZones, mountViews,
loadView }`. Tutto passa per la stringa serializzata del permalink, ed è per
questo che l'annulla è una pila di stringhe.

| Riga | Cosa |
|---|---|
| [45](tuning.js#L45) | Storia — `record`, `replay`, `undo`, `redo`; `persist()` è l'unico che registra |
| [83](tuning.js#L83) | Slot A/B — parcheggia una vista e la alterna con quella corrente |
| [102](tuning.js#L102) | Lucchetti — set in `localStorage`, letto da Random e Varia |
| [128](tuning.js#L128) | `vary()` — nudge in unità di traccia, salta bloccati, inerti e velocità delle modalità con un alto |
| [160](tuning.js#L160) | Viste salvate — `<optgroup>` nel menu Preset, valori `u:<nome>` |
| [224](tuning.js#L224) | Readout scrivibili — `contenteditable`, Invio conferma, Esc annulla |
| [259](tuning.js#L259) | Doppio click su uno slider — torna al valore di `modePresets` |
| [276](tuning.js#L276) | `applyZones()` — dipinge la banda della zona utile sulla traccia |
| [297](tuning.js#L297) | Bottoni e tasti — Ctrl+Z, Ctrl+Maiusc+Z, B, V |

## [style.css](style.css) — 316 righe

Variabili di tema in `:root` ([1](style.css#L1)). Blocchi: `#gl`
([22](style.css#L22)), `#notice` e la variante `.fatal` ([39](style.css#L39)),
`#panel` con lo stato `.collapsed` ([74](style.css#L74)), bottoni e select
([111](style.css#L111)), un controllo — `.ctl`, `.head`, `.name`, il readout
scrivibile e il lucchetto ([132](style.css#L132)) —, `.ctl.inert` — lo slider
spento dalla modalità ([184](style.css#L184)) —, gli slider e la banda
`.zoned` della zona utile ([192](style.css#L192)), le due `.row` di bottoni
([234](style.css#L234)), il pannello a foglio sotto i 620 px
([277](style.css#L277)) e i bersagli più grandi con puntatore grosso
([308](style.css#L308)).

## [shotkit.config.mjs](shotkit.config.mjs)

Config per screenshot-kit: non viene caricata dall'app. Il commento in testa
raccoglie quello che è costato tempo alla prima esecuzione — server statico,
`gpu: true` obbligatorio, il reload necessario fra uno shot e l'altro, e cosa
guardare nelle modalità 6 e 7. Oltre al `default` esporta `hash`, `setPanel` e
`fresh`, che sono ciò su cui è costruita la seconda config.

## [shotkit.readme.mjs](shotkit.readme.mjs)

Le sei immagini che il README mostra, in `screenshots/`, versionate. Non
ridefinisce le inquadrature: prende quelle di `shotkit.config.mjs` e le rinomina,
abbassando la risoluzione a 1200×750 a scala 1. L'unico scatto suo è
`panel-narrow`, il pannello a foglio su una finestra larga 390 px.

## [.deploy/](.deploy/)

| File | Cosa |
|---|---|
| [site.json](.deploy/site.json) | slug, dominio, repo, tipo statico, limiti |
| [compose.yml](.deploy/compose.yml) | nginx unprivileged, read-only, checkout montato ro |
| [site-nginx.conf](.deploy/site-nginx.conf) | server block interno al container |
| [vhost.conf](.deploy/vhost.conf) | vhost sull'nginx di bordo |
| [vhost.bootstrap.conf](.deploy/vhost.bootstrap.conf) | vhost temporaneo per l'emissione TLS |

`.deploy/.env` (segreti) vive solo sul server ed è in `.gitignore`.
