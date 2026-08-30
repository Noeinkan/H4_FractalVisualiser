# Fractal Mandala Visualiser

Visualizzatore WebGL di mandala frattali ispirati alla geometria islamica: otto
modalità di rendering GLSL, palette e simmetrie regolabili dal vivo, e un
permalink nell'URL che descrive per intero la vista corrente.

Questo file è per gli agenti che lavorano sulla repo. Panoramica per chi la usa:
[README.md](README.md). Mappa dei file: [PROJECT_INDEX.md](PROJECT_INDEX.md).
Piano: [roadmap.md](roadmap.md).

## Forma del progetto

Quattro file serviti così come sono. **Non c'è build step, non c'è package.json,
non ci sono dipendenze, non c'è backend.** Non introdurne senza che l'utente lo
chieda: l'apertura da `file://` è una proprietà voluta, e `shader.js` è uno
script classico (non un modulo) proprio per quello.

```
index.html   markup + pannello dei controlli
style.css    tema scuro, pannello, slider
shader.js    sorgenti GLSL (VERT, FRAG_BODY) su window.FRACTAL_SHADER
main.js      contesto GL, stato, UI, permalink, interazione, render loop
```

## Come si prova una modifica

Non ci sono test. La verifica è visiva:

```bash
python -m http.server 5188        # poi http://127.0.0.1:5188
```

Per confrontare due stati, naviga con l'hash completo e **ricarica**: un cambio
di solo hash non ricarica la pagina, quindi `timeAccum` si trascina dal frame
precedente e il confronto non è riproducibile.

Per screenshot riproducibili usa la skill `screenshot-kit` con
`shotkit.config.mjs`, che contiene già le combinazioni che rendono bene.

## Cose che non si vedono dal codice

- **`u_time` conta più di qualsiasi slider.** A `t=0` le modalità 0, 2, 3 e 4
  rendono una macchia quasi piatta: risolvono solo dopo qualche secondo di
  animazione. Se una modalità "sembra rotta" a velocità 0, prima falla girare.
- **`u_zoom` è un campo visivo, non un ingrandimento.** Moltiplica le coordinate
  uv: valori alti = vista larga, valori bassi = zoom profondo. Le modalità 0, 2 e
  3 mostrano struttura solo sotto `z≈1`; la 1 e la 5 vogliono `z≈1.6–2.8`.
- **Le modalità 6 (Volta) e 7 (Mihrab) non rendono correttamente**: collassano in
  una silhouette piena. È un bug dello shader, non di inquadratura, ed è già in
  roadmap. Non presentarle come funzionanti.
- **`preserveDrawingBuffer` è disattivato di proposito** (costa a ogni frame).
  L'export PNG disegna e cattura nello stesso task: se tocchi `saveScreenshot`
  in [main.js](main.js#L309), quell'invariante va mantenuta.
- **`MODE_ITER_MAX`** in [main.js](main.js#L148) deve restare allineato ai bound
  dei loop nello shader. Se cambi il `for (int i = 0; i < N; i++)` di una
  modalità, aggiorna anche la voce corrispondente, altrimenti lo slider ha una
  coda inerte.
- **Il flag `restoring`** sopprime l'applicazione dei preset e la riscrittura
  dell'URL mentre si carica uno stato. Ogni nuovo percorso che chiama
  `setControl` o `applyMode` durante un restore deve rispettarlo.
- **Il rendering è on-demand**: `render()` esce subito se `dirty` è falso. Ogni
  cambiamento di stato deve chiamare `markDirty()`, altrimenti non si vede nulla
  finché l'animazione non è in pausa... e in pausa non si vede proprio.

## Convenzioni

- **UI in italiano, codice e commenti in inglese.** Le stringhe visibili
  (`index.html`, i notice in `main.js`) sono italiane; identificatori e commenti
  sono inglesi. Mantieni la divisione.
- I commenti nel codice spiegano *perché*, non *cosa*. La densità attuale è
  bassa e mirata alle invarianti non ovvie: seguila.
- Nello shader ogni modalità è una funzione `modeXxx(vec2 uv, float t)` che
  ritorna un `vec3` lineare; il tonemap, la gamma e la vignette stanno solo in
  `main()`. Non duplicarli dentro una modalità.
- `FW(x)` è la macro per `fwidth(x)`: `main.js` la mappa su `fwidth` quando
  `OES_standard_derivatives` c'è, e su una costante quando manca. Nel fragment
  shader usa sempre `FW(...)`, mai `fwidth(...)` diretto, e **non** aggiungere
  righe `#extension`: l'header viene anteposto da `buildGL()`.

## Aggiungere una modalità

1. Scrivi `modeNuova(vec2 uv, float t)` in [shader.js](shader.js), accanto alle
   altre, con lo stesso commento di intestazione a banda.
2. Aggiungi il ramo in `main()` (catena `u_mode < N.5`).
3. Aggiungi l'`<option>` in [index.html](index.html) con il valore numerico.
4. Aggiungi la voce in `MODE_ITER_MAX` e in `modePresets` in [main.js](main.js).
5. Aggiungi uno shot in `shotkit.config.mjs` con i parametri che la mostrano.

## Perimetro

`.deploy/` descrive il sito sul server condiviso: toccalo solo se la richiesta
riguarda il deploy. `.deploy/.env` contiene segreti, vive solo sul server ed è in
`.gitignore`. `.shots/` è output rigenerabile, anch'esso ignorato.
