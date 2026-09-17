# Fractal Mandala Visualiser

Visualizzatore WebGL di mandala ispirati alla geometria islamica: undici
modalità di rendering GLSL, palette e simmetrie regolabili dal vivo, e un
permalink nell'URL che descrive per intero la vista corrente.

Questo file è per gli agenti che lavorano sulla repo. Panoramica per chi la usa:
[README.md](README.md). Mappa dei file: [PROJECT_INDEX.md](PROJECT_INDEX.md).
Piano: [roadmap.md](roadmap.md).

## Forma del progetto

Sei file serviti così come sono. **Non c'è build step, non c'è package.json,
non ci sono dipendenze, non c'è backend.** Non introdurne senza che l'utente lo
chieda: l'apertura da `file://` è una proprietà voluta, e `shader.js`,
`tuning.js` e `brush.js` sono script classici (non moduli) proprio per quello.

```
index.html   markup + pannello dei controlli
style.css    tema scuro, pannello, slider
shader.js    sorgenti GLSL (VERT, FRAG_BODY, INK, TRIM) su window.FRACTAL_SHADER
tuning.js    storia, A/B, lucchetti, Varia, viste salvate su window.FRACTAL_TUNING
brush.js     disegno a mano della modalità 10: tratti, localStorage, GL suo, su window.FRACTAL_BRUSH
main.js      contesto GL, stato, UI, permalink, interazione, render loop
```

`brush.js` è l'unica parte con memoria propria: vedi le note sulla modalità 10
più sotto. Come `tuning.js`, se manca `main.js` usa uno stub e la modalità 10
resta carta vuota.

`tuning.js` non tocca né GL né `state`: passa tutto per la stringa serializzata
del permalink, ed è per questo che l'annulla può essere una pila di stringhe.
Riceve da `main.js` un contesto con `setControl`, `serialize`, `applyState`,
`persist` e le tabelle per modalità; se il file manca, `main.js` usa uno stub e
il visualizzatore resta in piedi senza il banco di regolazione.

## Come si prova una modifica

Non ci sono test. La verifica è visiva:

```bash
python -m http.server 5188        # poi http://127.0.0.1:5188
```

Per confrontare due stati basta navigare con l'hash completo: da quando
l'orologio viaggia nell'hash come `t`, un cambio di solo hash — che *non*
ricarica la pagina — riporta anche l'istante, e un hash vecchio senza `t`
riparte da zero invece di trascinarsi il frame precedente. Ricarica solo se
stai provando il percorso di avvio (`restore()`) o se hai toccato `index.html`.

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
  `applyMode` azzera l'orologio con `setTime(0)` quando un preset chiede
  velocità 0 (vale anche per le modalità 8 e 9). Un preset nuovo che dipende
  dall'orientamento deve fare lo stesso.
- **Un preset nominato è un permalink, non un secondo tipo di stato.**
  `NAMED_PRESETS` in [main.js](main.js#L328) tiene stringhe nello stesso formato
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
  Quindi l'export deve disegnare e *copiare* nello stesso task: `runExport()` in
  [main.js](main.js#L701) fa `render()` e subito un `drawImage` su una canvas 2D,
  ed è quella copia che poi va a `toBlob`. Passare la canvas GL direttamente
  all'encoder funziona per caso — finché nessuno ridimensiona il buffer prima
  che l'encoder legga. Se tocchi l'export, la copia resta.
- **L'export non ha niente a che vedere con la finestra.** `exportPlan()` in
  [main.js](main.js#L662) calcola una dimensione a partire dal lato lungo scelto
  nel pannello (conservando l'aspetto della finestra, perché lo shader mappa uv
  su `min(resolution)` e un rapporto diverso reinquadrerebbe la scena invece di
  ingrandirla) e la moltiplica per i campioni per pixel; `setBufferExact()` dà a
  GL quel buffer, e la riduzione a valle è l'antialiasing. Due tetti sono veri e
  clampano il *campionamento*, non la dimensione richiesta: `maxDim` — letto da
  `MAX_VIEWPORT_DIMS` in `buildGL()`, oltre il quale GL non disegna e il PNG
  esce vuoto — e `EXPORT_MAX_PIXELS`, che è memoria. Se anche a ×1 non ci sta,
  allora scende la dimensione, e in quel caso il notice lo dice.
- **Rendere più grande non è solo più grande.** Le modalità 6 e 7 dissolvono
  ogni livello IFS quando il suo passo scende sotto il pixel: più pixel = più
  livelli sopravvivono, quindi un export a 4096 px del mihrab ha viticci che
  sullo schermo non c'erano. Vale la pena saperlo prima di inseguire una
  differenza fra schermo e PNG credendola un bug.
- **`MODE_ITER_MAX`** in [main.js](main.js#L166) deve restare allineato ai bound
  dei loop nello shader. Se cambi il `for (int i = 0; i < N; i++)` di una
  modalità, aggiorna anche la voce corrispondente, altrimenti lo slider ha una
  coda inerte.
- **`MODE_UI`** in [main.js](main.js#L229) dice cosa ogni modalità fa degli
  slider, e `syncPanel()` lo applica: `inert` spegne e sbiadisce un controllo
  che lo shader non legge, `names` gli dà il nome che quella modalità gli dà
  davvero (in modalità 8 «Petali» è il seme del piatto), `upright` marca le
  modalità con un alto perché il Random non le metta a girare. È solo etichetta:
  `state`, l'hash e i preset non lo vedono, e uno slider inerte conserva il suo
  valore — `setControl` raggiunge anche un input `disabled`, quindi un permalink
  scritto sotto un'altra modalità si ripristina intero. Regola: se una modalità
  nuova ignora un uniform, mettilo in `inert` invece di lasciare la manopola a
  fingere; se lo legge come altro, dagli il nome in `names`. `bloom` non va mai
  in `inert`: nelle modalità 0–7 passa comunque dal tonemap di `main()`. Per un
  controllo che legge *una sola* modalità c'è il rovescio, `ONLY_IN`: «Modulo»
  sta lì come `{ module: [10] }` invece che in dieci liste `inert`, e `isInert`
  guarda entrambi.
- **Il flag `restoring`** sopprime l'applicazione dei preset e la riscrittura
  dell'URL mentre si carica uno stato. Ogni nuovo percorso che chiama
  `setControl` o `applyMode` durante un restore deve rispettarlo.
- **L'orologio è stato, non una variabile a parte.** `state.time` sta nell'hash
  come `t`, quindi un permalink porta anche *quale istante* di una modalità
  animata stai guardando, e l'annulla lo riporta indietro con tutto il resto.
  Chi lo scrive fuori da uno slider usa `setTime()`, non `setControl("time")`:
  un input dispatchato passerebbe da `schedulePersist`, che azzera il menu dei
  preset — ed è esattamente ciò che succedeva scegliendo una vista nominata.
  `frame()` invece chiama `reflectTime()`, che aggiorna manopola e readout
  scrivendo nel DOM **senza** dispatchare: altrimenti l'URL verrebbe riscritto
  sessanta volte al secondo. Oltre i 300 s la manopola si ferma in fondo e il
  numero continua: la manopola può bloccarsi, il readout non può mentire.
- **`t`, `h`, `k` e `o` sono arrivati dopo i primi permalink condivisi.** `HASH_LATE`
  in [main.js](main.js#L754) dà loro un valore di default quando mancano
  dall'hash, così un vecchio URL rende come rendeva invece di ereditare tinta e
  orologio dalla vista precedente. Ogni chiave nuova va aggiunta lì.
- **La traccia del campo visivo è esponenziale.** `min`/`max` di `#zoom`
  nell'HTML sono unità di traccia, non valori di zoom: la conversione sta tutta
  in `SLIDERS`, `toSlider` e `fromSlider` ([main.js](main.js#L177)), e chi chiama
  `setControl` parla sempre in valori. Effetto collaterale accettato: un valore
  che arriva dall'hash viene riquantizzato dello 0.2% circa (`z=2.8` torna
  `2.801`). Se aggiungi un'altra traccia logaritmica, dichiarala lì e basta.
- **La storia è una pila di stringhe e `persist()` è l'unico che la scrive.**
  Chi installa uno stato che *è già* nella pila — l'annulla, il rifai — chiama
  `persist({ record: false })`, altrimenti Ctrl+Z diventa un punto fisso da cui
  non si esce. Vale anche per il `hashchange`: incollare un URL registra la
  vista da cui vieni, così ci torni con l'annulla.
- **Il trim di colore sta solo in `main()`, dopo il tonemap.** `trim()` ruota la
  tinta attorno all'asse dei grigi e scala la saturazione: si applica a tutte le
  modalità, comprese quelle a inchiostro, dove muove anche la carta (voluto: lo
  stesso piatto su carta calda o fredda sono due poster). Una modalità non deve
  averne una copia sua, come per tonemap e vignette. L'unico altro posto in cui
  gira è lo shader dei tratti di brush.js, che riceve la stessa funzione da
  shader.js (`TRIM`): è lineare, quindi applicarla a ogni tratto equivale ad
  applicarla all'immagine finita.
- **Un controllo bloccato col lucchetto è fuori da Random e da Varia**, e i due
  rispettano anche `inert` e `upright`: una modalità con un alto non riceve mai
  una velocità da nessuno dei due. I lucchetti stanno in `localStorage` e non
  nell'hash — sono una preferenza di lavoro, non parte della vista.
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
- **La modalità 10 è l'unica con memoria, e la memoria non sta nell'hash.** È
  un disegno a mano, dallo sketch P_2_3_4_01 di *Generative Gestaltung*:
  [brush.js](brush.js) registra i percorsi del puntatore e li tiene in
  `localStorage` sotto `fractal-mandala-drawing-v1`. Il permalink porta solo
  l'aspetto (passo, veli, larghezza, modulo, palette) e un preset nominato non
  tocca mai il disegno. Gli stampi non si salvano: si ricavano dai percorsi,
  quindi cambiare «Passo» o «Veli» ridisegna tutto come se fosse stato fatto
  così.
- **Un tratto si rigioca identico solo se il generatore vede campioni, non il
  puntatore.** `tick()` campiona una volta per frame, come lo sketch, anche a
  puntatore fermo finché gli inseguitori non arrivano; arrotonda a cinque
  decimali e passa il campione a `feed()`. Dopo un ricarico gli stessi numeri
  ripassano dalla stessa funzione, e l'immagine è identica al pixel (verificato).
  Logica nuova del pennello va in `feed()`, mai nei gestori degli eventi. Ogni
  tratto ricorda lo zoom a cui è stato fatto (`z`), e passo, larghezza e
  spessore lo moltiplicano: un tratto fatto da vicino non è più grossolano.
- **Il disegno si accumula in una texture, e la sua chiave decide quando
  rifarlo.** `render()` di brush.js disegna nella texture solo gli stampi nuovi
  e la compone sopra la carta che `main()` ha già dipinto. La rifà da zero
  quando cambia la chiave (dimensione, pan, zoom, rotazione, larghezza, modulo,
  opacità, palette, tinta, saturazione) o `rev` (annulla, cancella, passo,
  veli). Un parametro nuovo che cambia l'aspetto va nella chiave, altrimenti si
  vede solo sui tratti successivi. Se la GPU non concede la texture (un export
  enorme) gli stampi vanno dritti sulla carta: più lento, stessa immagine.
- **brush.js ha programmi e attributi suoi.** WebGL 1 non ha VAO, quindi gli
  attributi abilitati sono stato globale: `render()` in main.js si riprende
  programma, buffer e `a_pos` a ogni frame, e brush.js disabilita i suoi dopo
  ogni draw. Colori premoltiplicati (`ONE, ONE_MINUS_SRC_ALPHA`) sia nella
  texture sia nella composizione. Il suo shader non riceve l'header di
  `buildGL()`, quindi niente `FW()`: l'antialiasing usa `u_px`, la dimensione
  del pixel, che vale anche nell'export.
- **Palette e trim sono condivisi per interpolazione.** `INK` e `TRIM` in
  shader.js sono stringhe inserite in `FRAG_BODY` con `${...}` ed esportate, e
  brush.js le inserisce nel suo shader. Una palette nuova si scrive una volta,
  in `INK` e in `pickPalette`. Da qui anche la regola dei backtick: uno dentro un
  commento GLSL chiude il template literal, e il sintomo non è un errore GLSL ma
  `shader.js` che non si carica.
- **In modalità 10 trascinare disegna.** Spazio+trascina, tasto centrale e due
  dita spostano la vista; Maiusc+trascina ruota; Backspace toglie l'ultimo
  tratto e Canc cancella tutto (Backspace riporta indietro anche la
  cancellazione, finché la pagina è aperta); il doppio click non va a schermo
  intero. L'annulla dei tratti è separato da ↶ ↷, che camminano sul permalink.
  `symmetry`, `speed` e `time` sono in `inert`, e `frame()` non anima una
  modalità con la velocità inerte: per questo `clientToScene` in main.js e il
  vertex shader di brush.js possono ignorare la rotazione da orologio di
  `main()`.
- **«Modulo» (`o` nell'hash) segue l'ordine dei file SVG dello sketch**, 01–09,
  e quell'indice è anche il ramo nello shader di brush.js. Riordinare il menu o
  i rami cambia l'aspetto di ogni permalink già condiviso: un modulo nuovo va in
  fondo.
- **Una modalità pesante può rallentare tutte le altre.** Il backend D3D11 di
  ANGLE (Chrome ed Edge su Windows) può portare fuori dal ramo del dispatch il
  lavoro di preparazione di una modalità e pagarlo su ogni pixel di ogni
  modalità. È successo con la prima modalità 10, uno spirografo calcolato nello
  shader poi sostituito dal disegno a mano: la 9 era passata da 20 a 30 ms per
  frame a 1440×900 su una GPU Intel integrata senza mai chiamarla, e la
  compilazione a ogni caricamento da 1,7 a 2,6 s. La cura per il primo costo era
  una guardia in testa alla funzione, `if (abs(u_mode - N) > 0.5) return
  vec3(0.0);`; il secondo non si toglie. Una modalità nuova con cicli va
  misurata sul tempo di una modalità *vecchia*, prima e dopo.
- **Gli screenshot headless perdono il contesto WebGL in modalità 10.** Chrome
  headless sulla GPU D3D11 a volte perde il contesto mentre cattura una pagina
  della modalità 10 con dei tratti: 2–3 volte su 5 su una Intel integrata, 0 su
  4 con la finestra visibile e 0 su 3 in SwiftShader. È il percorso di cattura,
  non l'app: si rifà lo scatto, o si usa `--headed`.
- **La risoluzione cala mentre la scena si muove.** `setBuffer()` in
  [main.js](main.js#L387) ridimensiona il drawing buffer: `renderScale` scende
  fino a 0.45 quando le frame superano i 24 ms e risale quando ne bastano 13, ma
  solo durante l'animazione, un drag o uno slider. Passati 220 ms dall'ultimo
  input il buffer torna a piena risoluzione e disegna una frame nitida. Quindi
  ogni nuovo percorso di input deve chiamare `touchInput()` accanto a
  `markDirty()`, altrimenti manipola l'immagine grande; e chi cattura pixel
  (`runExport`) si dà il buffer che vuole con `setBufferExact()` e poi rimette a
  posto con `resize(true)`.
- **Velocità 0 vuol dire nessuna frame, non frame lente.** `frame()` avanza
  `state.time` e sporca la scena solo se `state.speed !== 0`: le modalità 7, 8 e
  9 sono ferme per preset e senza quel controllo ridisegnano un'immagine
  identica sessanta volte al secondo. Lo slider «Tempo» resta comunque vivo: è
  l'unico modo di muoverle, e passa da `bindRange`, non da `frame()`. Una
  modalità che ha `speed` in `inert` (la 10) non anima mai, qualunque valore
  abbia lasciato sullo slider un permalink di un'altra modalità.
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
   Se ha cicli, misurala come dice la nota su ANGLE e, se rallenta le altre,
   dalle in testa la guardia sul proprio numero.
2. Aggiungi il ramo in `main()` (catena `u_mode < N.5`).
3. Aggiungi l'`<option>` in [index.html](index.html) con il valore numerico.
4. Aggiungi la voce in `MODE_ITER_MAX`, in `modePresets` e in `MODE_UI` in
   [main.js](main.js), e alza `MODE_LAST`, che è il tetto a cui `applyState`
   riporta la `m` dell'hash. `MODE_UI` dice quali slider la modalità ignora
   (`inert`), come chiama quelli che usa con un altro significato (`names`), se
   ha un alto (`upright`) e in che fascia rende (`zones`, la banda dipinta sulla
   traccia).
5. Aggiungi uno shot in `shotkit.config.mjs` con i parametri che la mostrano, e
   misura il costo per frame di una modalità esistente prima e dopo (vedi la
   nota su ANGLE sopra).
6. Aggiungi una voce in `NAMED_PRESETS`, con il `t` che serve se la modalità è
   una di quelle che a tempo zero non hanno ancora risolto.

## Perimetro

`.deploy/` descrive il sito sul server condiviso: toccalo solo se la richiesta
riguarda il deploy. `.deploy/.env` contiene segreti, vive solo sul server ed è in
`.gitignore`. `.shots/` e `.shots-probe/` sono output rigenerabile, ignorati.
`screenshots/` invece è versionata — sono le immagini del README — e i file di
servizio che screenshot-kit ci lascia dentro (manifest, contact sheet, log del
server) sono ignorati uno per uno in `.gitignore`.
