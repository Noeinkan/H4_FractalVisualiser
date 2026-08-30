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
├── main.js               contesto GL, stato, UI, permalink, input, render loop
├── shotkit.config.mjs    config screenshot-kit (non usata a runtime)
├── .deploy/              deploy statico dietro nginx condiviso
├── .shots/               screenshot generati (gitignored)
├── README.md             panoramica per chi usa il progetto
├── CLAUDE.md             note per gli agenti
└── roadmap.md            piano, nel formato letto da repo-radar
```

## [index.html](index.html)

Nessuno script inline. Carica `shader.js` prima di `main.js` — l'ordine conta:
`main.js` legge `window.FRACTAL_SHADER` all'avvio e si ferma con un notice
fatale se non lo trova.

Elementi con id, tutti letti da `main.js`: `gl` (canvas), `notice`, `panel`,
`toggle`, `controls`, `mode`, `symmetry`, `petals`, `zoom`, `iterations`,
`complexity`, `speed`, `palette`, `bloom`, `pause`, `randomize`, `screenshot`,
`reset`. Ogni slider ha un `<span data-out="<id>">` accoppiato che ne mostra il
valore.

## [shader.js](shader.js) — 572 righe

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
| [75](shader.js#L75) | `pal()` + `pickPalette()` — le otto palette |
| [110](shader.js#L110) | `modeKaleido` — modalità 0, IFS + inversione |
| [142](shader.js#L142) | `modeFloral` — modalità 1, arabesco islimi |
| [201](shader.js#L201) | `modeGirih` — modalità 2, tassellatura stellare |
| [261](shader.js#L261) | `modeJulia` — modalità 3, insieme di Julia |
| [293](shader.js#L293) | `modeVault` — modalità 6, **incompleta** |
| [360](shader.js#L360) | `modeMihrab` — modalità 7, **incompleta** |
| [433](shader.js#L433) | `modeDome` — modalità 5, spirale a cupola |
| [499](shader.js#L499) | `modeShamsa` — modalità 4, medaglione |
| [536](shader.js#L536) | toolkit inchiostro piatto: `Ink`, `inkPalette`, `over`, `fillMask`, `lineMask` |
| [566](shader.js#L566) | vocabolario di motivi: `sdSegment`, `sdLeaf`, `sdDrop`, `sdRings`, `sdHatch`, `sdCurl` |
| [611](shader.js#L611) | `bandCell` / `cellBox` / `bandMask` — coordinate locali di una corona |
| [635](shader.js#L635) | `modeHenna` — modalità 8, mandala a bande piatte |
| [760](shader.js#L760) | `main()` — pan/zoom/rotazione, dispatch, vignette e tonemap (solo modalità 0–7) |

L'ordine delle funzioni nel file non segue quello delle modalità: il dispatch in
`main()` è la sola fonte affidabile.

## [main.js](main.js) — 539 righe

IIFE in `"use strict"`. Sezioni, nell'ordine in cui compaiono:

| Riga | Sezione | Contenuto |
|---|---|---|
| [4](main.js#L4) | Notices | `showNotice` / `hideNotice`, errori fatali con escaping |
| [29](main.js#L29) | Contesto GL | `GL_OPTS`, `getContext`, uscita se WebGL manca |
| [47](main.js#L47) | Programma GL | `compile()`, `buildGL()`, header `FW()`, uniform in `U` |
| [125](main.js#L125) | Context loss | listener `webglcontextlost` / `restored` |
| [142](main.js#L142) | Costanti | `ZOOM_MIN/MAX`, `MODE_ITER_MAX`, `clamp` |
| [152](main.js#L152) | Stato | oggetto `state`, `modePresets` per modalità |
| [185](main.js#L185) | Resize | DPR limitato a 2, viewport |
| [200](main.js#L200) | UI | `$`, `setControl`, `bindRange`, `applyMode`, i bottoni |
| [309](main.js#L309) | Screenshot | `saveScreenshot` — disegna e cattura nello stesso task |
| [326](main.js#L326) | Permalink | `serialize`/`deserialize`/`applyState`/`persist`, `HASH_MAP`, restore |
| [405](main.js#L405) | Interazione | `clientToUV`, `panBy`, `zoomAt`, pointer, pinch, wheel |
| [509](main.js#L509) | Render loop | `render()` on-demand + `frame()` con `requestAnimationFrame` |

Concetti chiave: `dirty`/`markDirty()` (si disegna solo quando serve),
`restoring` (sopprime preset e scritture URL durante un restore),
`schedulePersist()` (debounce 250 ms su hash + `localStorage`).

## [style.css](style.css) — 193 righe

Variabili di tema in `:root` ([1](style.css#L1)). Blocchi: `#gl`
([22](style.css#L22)), `#notice` e la variante `.fatal` ([35](style.css#L35)),
`#panel` con lo stato `.collapsed` ([70](style.css#L70)), controlli e slider
([107](style.css#L107)), `.row` dei bottoni ([171](style.css#L171)).

## [shotkit.config.mjs](shotkit.config.mjs)

Config per screenshot-kit: non viene caricata dall'app. Il commento in testa
raccoglie quello che è costato tempo alla prima esecuzione — server statico,
`gpu: true` obbligatorio, il reload necessario fra uno shot e l'altro, e perché
le modalità 6 e 7 non sono catturate.

## [.deploy/](.deploy/)

| File | Cosa |
|---|---|
| [site.json](.deploy/site.json) | slug, dominio, repo, tipo statico, limiti |
| [compose.yml](.deploy/compose.yml) | nginx unprivileged, read-only, checkout montato ro |
| [site-nginx.conf](.deploy/site-nginx.conf) | server block interno al container |
| [vhost.conf](.deploy/vhost.conf) | vhost sull'nginx di bordo |
| [vhost.bootstrap.conf](.deploy/vhost.bootstrap.conf) | vhost temporaneo per l'emissione TLS |

`.deploy/.env` (segreti) vive solo sul server ed è in `.gitignore`.
