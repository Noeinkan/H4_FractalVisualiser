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
├── brush.js              disegno a mano della modalità 10 — window.FRACTAL_BRUSH
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

Nessuno script inline. Carica `shader.js`, `tuning.js` e `brush.js` prima di
`main.js` — l'ordine conta: `main.js` legge `window.FRACTAL_SHADER` all'avvio e
si ferma con un notice fatale se non lo trova, mentre di `window.FRACTAL_TUNING`
e `window.FRACTAL_BRUSH` fa a meno con uno stub.

Elementi con id: `gl` (canvas), `notice`, `panel`, `toggle`, `controls`,
`preset`, `mode`, `symmetry`, `petals`, `zoom`, `iterations`, `complexity`,
`speed`, `time`, `palette`, `module`, `hue`, `sat`, `bloom`, `exportSize`, `exportSS`,
`pause`, `randomize`, `vary`, `screenshot`, `reset`, `strokeUndo`, `drawClear`,
`undo`, `redo`, `ab`, `saveview`. Gli elementi con l'attributo `data-brush` — la
riga *Annulla tratto / Cancella disegno* e il suggerimento sul pennello — li
mostra `syncPanel()` solo in modalità 10.

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

## [shader.js](shader.js) — 1113 righe

IIFE che espone `window.FRACTAL_SHADER = { VERT, FRAG_BODY, INK, TRIM }`.
`FRAG_BODY` **non** contiene la riga `#extension`: la antepone `buildGL()`. `INK`
(le palette a inchiostro) e `TRIM` (la correzione di colore) sono stringhe
inserite in `FRAG_BODY` con `${...}` ed esportate per lo shader di `brush.js`.
Sono template literal: niente backtick nei commenti GLSL.

| Riga | Cosa |
|---|---|
| [11](shader.js#L11) | `VERT` — fullscreen quad, passthrough |
| [19](shader.js#L19) | `INK` — `struct Ink` + `inkPalette()`, le nove palette piatte |
| [45](shader.js#L45) | `TRIM` — `trim()`, rotazione di tinta e saturazione |
| [55](shader.js#L55) | inizio `FRAG_BODY`: uniform, `PI`/`TAU`/`GOLD`, `rot()` |
| [83](shader.js#L83) | `kaleido(p, n)` — piega caleidoscopica a n specchi |
| [93](shader.js#L93) | `sdRose(p, k)` — SDF di una rosa a k petali |
| [101](shader.js#L101) | `sdPolygon(p, n, R)` — SDF poligono regolare |
| [109](shader.js#L109) | `sdStar(p, n, R)` — intersezione di due poligoni ruotati |
| [120](shader.js#L120) | `fillMask` / `lineMask` — copertura antialiasata da una distanza |
| [123](shader.js#L123) | `sdSegment(p, a, b)` — SDF di un segmento |
| [133](shader.js#L133) | `sdArch(p, w, h)` — arco a due centri, acuto o a tutto sesto |
| [149](shader.js#L149) | `bandCell` / `cellBox` / `bandMask` — coordinate locali di una corona |
| [167](shader.js#L167) | `pal()` + `pickPalette()` — le nove palette a gradiente |
| [205](shader.js#L205) | `modeKaleido` — modalità 0, IFS + inversione |
| [237](shader.js#L237) | `modeFloral` — modalità 1, arabesco islimi |
| [296](shader.js#L296) | `modeGirih` — modalità 2, tassellatura stellare |
| [356](shader.js#L356) | `modeJulia` — modalità 3, insieme di Julia |
| [395](shader.js#L395) | `modeVault` — modalità 6, volta costolonata con arcata sul bordo |
| [489](shader.js#L489) | `modeMihrab` — modalità 7, nicchia con lampada e viticci |
| [584](shader.js#L584) | `modeDome` — modalità 5, spirale a cupola |
| [650](shader.js#L650) | `modeShamsa` — modalità 4, medaglione |
| [693](shader.js#L693) | toolkit inchiostro piatto: `INK` inserito qui, poi `over` |
| [703](shader.js#L703) | vocabolario di motivi: `sdLeaf`, `sdDrop`, `sdRings`, `sdHatch`, `sdCurl` |
| [746](shader.js#L746) | `hRand` / `inkSlot` — hash del seme e scelta di una campitura |
| [763](shader.js#L763) | `Cell` + `hennaMotif` — gli otto motivi che una banda può ospitare |
| [843](shader.js#L843) | `hennaBand` — una corona: fondo, motivo in ogni cella, filetto |
| [870](shader.js#L870) | `modeHenna` — modalità 8, mandala a bande piatte generate dal seme |
| [974](shader.js#L974) | `modeMuqarnas` — modalità 9, volta a stalattiti |
| [1061](shader.js#L1061) | `TRIM` inserito qui |
| [1064](shader.js#L1064) | `main()` — pan/zoom/rotazione, dispatch (modalità 10: solo la carta), vignette e tonemap (solo modalità 0–7), poi il trim |

L'ordine delle funzioni nel file non segue quello delle modalità: il dispatch in
`main()` è la sola fonte affidabile.

## [main.js](main.js) — 1135 righe

IIFE in `"use strict"`. Sezioni, nell'ordine in cui compaiono:

| Riga | Sezione | Contenuto |
|---|---|---|
| [4](main.js#L4) | Notices | `showNotice` / `hideNotice`, errori fatali con escaping |
| [29](main.js#L29) | Contesto GL | `GL_OPTS`, `getContext`, uscita se WebGL manca |
| [47](main.js#L47) | Disegno a mano | `BRUSH_MODE`, crea `brush` da `brush.js`, o lo stub se manca |
| [57](main.js#L57) | Programma GL | `compile()`, `buildGL()` (ricostruisce anche il GL del pennello), header `FW()`, uniform in `U`, `posLoc` |
| [147](main.js#L147) | Context loss | listener `webglcontextlost` / `restored` |
| [160](main.js#L160) | Costanti | `ZOOM_MIN/MAX`, `MODE_ITER_MAX`, `MODE_LAST`, `SLIDERS` + `toSlider`/`fromSlider`, `MODE_UI`, `ONLY_IN`, `isInert`, `clamp` |
| [269](main.js#L269) | Stato | oggetto `state`, `modePresets` per modalità |
| [328](main.js#L328) | `NAMED_PRESETS` | le viste nominate del menu: permalink + `t` iniziale |
| [369](main.js#L369) | Resize + risoluzione adattiva | `setBufferExact()`/`setBuffer()`, `renderScale`, `touchInput()` |
| [409](main.js#L409) | UI | `$`, `setControl`, `bindRange`, palette e modulo, i bottoni, Random per modalità, `undoStroke`/`clearDrawing` |
| [487](main.js#L487) | Pannello adattivo | `sliders` (più il menu `module`), `syncPanel()` (anche `[data-brush]`), `applyMode()` |
| [519](main.js#L519) | Banco di regolazione | crea `tuning` da `tuning.js`, o lo stub se manca |
| [645](main.js#L645) | Export PNG | `exportPlan()`, `runExport()` — dimensione scelta, sovracampionamento, copia nello stesso task |
| [743](main.js#L743) | Permalink | `serialize`/`deserialize`/`applyState`/`persist`, `HASH_MAP`, `HASH_LATE`, restore |
| [842](main.js#L842) | Menu dei preset | riempie `#preset` e installa la vista scelta |
| [868](main.js#L868) | Interazione | `clientToUV`, `clientToScene`, `panBy`, `zoomAt`, pointer (in modalità 10 il trascinamento disegna), pinch, wheel, tasti del pennello |
| [1041](main.js#L1041) | Render loop | `render()` on-demand (carta, poi `brush.render`), `adapt()` e `frame()` (con `brush.tick()`) |

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

## [brush.js](brush.js) — 574 righe

IIFE che espone `window.FRACTAL_BRUSH = { create(ctx) }`. È l'unica parte con
memoria: `main.js` gli passa `gl`, `shader` (per `INK` e `TRIM`) e `showNotice`,
e riceve `{ buildGL, render, begin, moveTo, tick, end, undo, clear, isDrawing,
count }`. I tratti sono percorsi del puntatore in unità di scena, salvati in
`localStorage` sotto `fractal-mandala-drawing-v1` e mai nell'hash; gli stampi
se ne ricavano.

| Riga | Cosa |
|---|---|
| [20](brush.js#L20) | Costanti — chiave di storage, passo e larghezza per unità di slider, distanza fra veli, arrotondamento |
| [33](brush.js#L33) | `VERT` — quad di ogni stampo nel frame della sua corda, scena → clip come `main()` al contrario |
| [94](brush.js#L94) | `frag(shader)` — i nove moduli dello sketch, filo e perle, `INK` + `TRIM` inseriti, colori premoltiplicati |
| [188](brush.js#L188) | `BLIT_VERT` / `BLIT_FRAG` — compone la texture del disegno sulla carta |
| [204](brush.js#L204) | Tratti — `strokes`, `undoOps`, il tratto in corso |
| [213](brush.js#L213) | Geometria — `push`, `startGen`, `feed()` (il `draw()` dello sketch), `replay`, `rebuild` |
| [287](brush.js#L287) | Input — `begin`, `moveTo`, `tick()` una volta per frame, `end`, `undo`, `clear` |
| [343](brush.js#L343) | Persistenza — `readStrokes`, `save` con avviso se lo spazio finisce |
| [371](brush.js#L371) | GL — `buildGL`, `upload`, `ensureCache` (la texture che tiene il disegno), `drawStamps`, `blit` |
| [536](brush.js#L536) | `render(v)` — ricostruisce se passo o veli cambiano, disegna solo gli stampi nuovi finché la chiave della vista non cambia |

## [style.css](style.css) — 327 righe

Variabili di tema in `:root` ([1](style.css#L1)). Blocchi: `#gl`
([22](style.css#L22)), `#notice` e la variante `.fatal` ([39](style.css#L39)),
`#panel` con lo stato `.collapsed` ([74](style.css#L74)), bottoni e select
([111](style.css#L111)), un controllo — `.ctl`, `.head`, `.name`, il readout
scrivibile e il lucchetto ([132](style.css#L132)) —, `.ctl.inert` — lo slider
spento dalla modalità ([184](style.css#L184)) —, gli slider e la banda
`.zoned` della zona utile ([192](style.css#L192)), le `.row` di bottoni
([234](style.css#L234)) con la regola che fa valere `hidden` dentro il pannello
([242](style.css#L242)), il pannello a foglio sotto i 620 px
([288](style.css#L288)) e i bersagli più grandi con puntatore grosso
([319](style.css#L319)).

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
