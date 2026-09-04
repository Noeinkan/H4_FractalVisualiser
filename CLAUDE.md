# Fractal Mandala Visualiser

Visualizzatore WebGL di mandala ispirati alla geometria islamica: dieci
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

Ci sono due configurazioni e fanno cose diverse. `shotkit.config.mjs` è la suite
di lavoro: alta risoluzione, output in `.shots/`, ignorata da git, la si guarda e
si butta. `shotkit.readme.mjs` produce le sei immagini che il README mostra, in
`screenshots/`, e quelle **sono versionate**: rilanciala solo quando cambia
davvero ciò che mostrano, perché ogni giro lascia sei PNG nella storia di git.
Non duplica le inquadrature, le importa dalla prima e le rinomina.

## Cose che non si vedono dal codice

- **`u_time` conta più di qualsiasi slider.** A `t=0` le modalità 0, 2, 3 e 4
  rendono una macchia quasi piatta: risolvono solo dopo qualche secondo di
  animazione. Se una modalità "sembra rotta" a velocità 0, prima falla girare.
- **`u_zoom` è un campo visivo, non un ingrandimento.** Moltiplica le coordinate
  uv: valori alti = vista larga, valori bassi = zoom profondo. Le modalità 0, 2 e
  3 mostrano struttura solo sotto `z≈1`; la 1 e la 5 vogliono `z≈1.6–2.8`.
- **Un motivo dentro un settore radiale va scritto in coordinate di cella.**
  Era questo a rompere la modalità 6: la vecchia versione definiva l'arco in uno
  spazio `(la*r, r)`, dove la coordinata tangenziale cresce con il raggio, così
  una forma di dimensione fissa scivolava fuori dalla campata e la volta si
  leggeva come una ruota di spicchi. Il frame giusto è quello di
  `bandCell`/`cellBox`: x diviso per il semiarco della cella stessa, y riportata
  in proporzione dall'aspetto. Vale per ogni nuova modalità radiale.
- **Nelle modalità 6 e 7 il numero di iterazioni è limitato dalla risoluzione,
  non dal budget.** La 7 saturava in una silhouette d'oro piena perché il ciclo
  IFS continuava a ripiegare la curva ben oltre il pixel; ora ogni livello viene
  sfumato via quando il suo passo scende sotto la dimensione del pixel
  (`smoothstep(...) / FW(p.x)`), e nella 6 lo stesso vale per un corso più
  sottile di un pixel. Se aggiungi un livello a un ciclo, dagli la stessa
  dissolvenza invece di alzare `MODE_ITER_MAX`.
- **La modalità 7 ha un alto.** `main()` ruota la scena con `u_time * 0.04`, che
  per una nicchia significa vederla storta: il suo preset mette `speed: 0`, e
  `applyMode` azzera `timeAccum` quando un preset chiede velocità 0 (vale anche
  per le modalità 8 e 9). Un preset nuovo che dipende dall'orientamento deve
  fare lo stesso.
- **Un preset nominato è un permalink, non un secondo tipo di stato.**
  `NAMED_PRESETS` in [main.js](main.js#L195) tiene stringhe nello stesso formato
  che `serialize()` scrive, e sceglierne una passa per `deserialize` +
  `applyState`, cioè per la stessa strada dell'hash. Non aggiungere un percorso
  parallelo che scriva su `state`: si perderebbero il ri-clamp delle iterazioni
  e la riscrittura dell'URL. Il campo `t` di un preset carica l'orologio prima
  del primo frame, perché le modalità 0, 2, 3 e 4 a `t=0` non sono ancora quello
  che il nome del preset promette; le modalità con un alto lo omettono.
  Il menu si riazzera da solo dentro `schedulePersist`, che è il punto in cui
  passa ogni modifica fatta a mano.
- **La soglia dei 620 px è scritta in due file.** `style.css` la usa per il
  `@media` che trasforma il pannello in un foglio in basso, e `main.js` per
  decidere se aprirlo o no al caricamento. Sono due linguaggi, non c'è modo di
  condividerne una sola: se la sposti, spostala in entrambi.
- **`preserveDrawingBuffer` è disattivato di proposito** (costa a ogni frame).
  L'export PNG disegna e cattura nello stesso task: se tocchi `saveScreenshot`
  in [main.js](main.js#L367), quell'invariante va mantenuta.
- **`MODE_ITER_MAX`** in [main.js](main.js#L148) deve restare allineato ai bound
  dei loop nello shader. Se cambi il `for (int i = 0; i < N; i++)` di una
  modalità, aggiorna anche la voce corrispondente, altrimenti lo slider ha una
  coda inerte.
- **Il flag `restoring`** sopprime l'applicazione dei preset e la riscrittura
  dell'URL mentre si carica uno stato. Ogni nuovo percorso che chiama
  `setControl` o `applyMode` durante un restore deve rispettarlo.
- **Le modalità dalla 8 in su sono illustrazione, non luce.** Campiture piatte,
  tratto di spessore costante, fondo carta. `main()` salta tonemap e vignette
  per loro — `x/(1+1.2x)` porterebbe il bianco a 0.45 di grigio — quindi i
  colori di `inkPalette` sono già valori da display, non radianza lineare. Nelle
  modalità inchiostro `u_bloom` non è un bagliore: è il **peso del tratto**, e
  la composizione deve restare `mix()`, mai additiva.
- **Un arco a due centri si inverte se `h < w`.** `sdArch` clampa `h` a `w`
  proprio per questo: sotto quella soglia i centri degli archi finiscono dal
  lato sbagliato e la forma diventa un'altra senza segnalare nulla. Stessa
  trappola di `sdLeaf`.
- **In `modeMuqarnas` il fondo del girone va steso prima delle nicchie.** Un
  arco copre solo la parte centrale della sua cella: senza il fondo i pennacchi
  lasciano passare il colore della calotta e la volta si legge come piastrelle
  sparse. E la rampa di tono resta dentro le tre campiture, mai attraverso
  `ink.paper`, che nelle palette a fondo scuro ingrigisce i gironi centrali.
- **Nella modalità 9 `u_petals` è un numero di lobi, e serve a tre cose
  insieme.** Fino a poco fa la modalità non lo leggeva affatto: lo slider
  «Petali» c'era ma non muoveva nulla, che dall'esterno si legge come un bug.
  Ora conta le scanalature del catino di ogni nicchia, i lobi della rosetta di
  accento sulle celle alterne e i raggi della rosetta di chiave (là `pet * 2`).
  Regola generale per le modalità nuove: un controllo che la modalità non usa va
  agganciato a qualcosa di visibile, non lasciato inerte.
- **In `modeHenna` le celle si normalizzano sulla cella, non sulla banda.**
  `bandCell` ritorna x in [-1,1] sulla cella e l'aspetto in `.z`: un motivo
  dimensionato sulla larghezza della banda lascia carta vuota a ogni giunzione.
  E `sdLeaf` è un profilo di larghezza, non una lente fra due cerchi: quella
  costruzione si inverte silenziosamente quando la foglia è più larga che alta,
  che è il caso normale sulle corone esterne.
- **Nella modalità 8 `u_petals` non conta petali: è il seme del piatto.** È
  l'unico controllo che la modalità non usa per altro, e da lì escono la
  larghezza di ogni corona, quante celle contiene, quale motivo le riempie e
  quale campitura ci sta sotto. Quindi due cose: cambiare lo slider «Petali»
  ridisegna la composizione (ed è questo che fa funzionare il pulsante Random),
  e cambiare le costanti di `hRand` rimescola *tutti* i permalink già condivisi.
  I motivi vivono in `hennaMotif`, uno per ramo, scritti solo in coordinate di
  cella: uno nuovo si aggiunge come ramo lì e alzando l'8.0 in `floor(h1 * 8.0)`.
- **Le corone della modalità 8 finiscono sempre a r=1.30**, qualunque sia il
  numero di bande: le larghezze sono normalizzate sul totale, così con tre bande
  si hanno tre corone larghe invece di un dischetto perso nella carta. Se ci
  aggiungi qualcosa fuori, tienilo entro il finale di bordo (r ≈ 1.46), che è
  ciò che il campo visivo 3.2 del preset inquadra.
- **La risoluzione cala mentre la scena si muove.** `setBuffer()` in
  [main.js](main.js#L231) ridimensiona il drawing buffer: `renderScale` scende
  fino a 0.45 quando le frame superano i 24 ms e risale quando ne bastano 13, ma
  solo durante l'animazione, un drag o uno slider. Passati 220 ms dall'ultimo
  input il buffer torna a piena risoluzione e disegna una frame nitida. Quindi
  ogni nuovo percorso di input deve chiamare `touchInput()` accanto a
  `markDirty()`, altrimenti manipola l'immagine grande; e chi cattura pixel
  (`saveScreenshot`) deve forzare `setBuffer(1)` prima di disegnare.
- **Velocità 0 vuol dire nessuna frame, non frame lente.** `frame()` avanza
  `timeAccum` e sporca la scena solo se `state.speed !== 0`: le modalità 7, 8 e
  9 sono ferme per preset e senza quel controllo ridisegnano un'immagine
  identica sessanta volte al secondo.
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
6. Aggiungi una voce in `NAMED_PRESETS`, con il `t` che serve se la modalità è
   una di quelle che a tempo zero non hanno ancora risolto.

## Perimetro

`.deploy/` descrive il sito sul server condiviso: toccalo solo se la richiesta
riguarda il deploy. `.deploy/.env` contiene segreti, vive solo sul server ed è in
`.gitignore`. `.shots/` e `.shots-probe/` sono output rigenerabile, ignorati.
`screenshots/` invece è versionata — sono le immagini del README — e i file di
servizio che screenshot-kit ci lascia dentro (manifest, contact sheet, log del
server) sono ignorati uno per uno in `.gitignore`.
