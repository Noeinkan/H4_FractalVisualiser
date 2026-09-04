# Fractal Mandala Visualiser

Bozza. Le milestone qui sotto sono dedotte dallo stato del codice, non da un
piano già concordato: scadenze e priorità vanno confermate.

## Milestone: Base giocabile

- [x] Otto modalità GLSL con dispatch da uniform <!-- size: XL; done: 2026-08-30 -->
- [x] Modalità 8 (Henna): mandala vettoriale piatto a bande concentriche <!-- size: L; done: 2026-08-31 -->
- [x] Modalità 8: composizione delle corone generata dal seme «petali» invece che fissa <!-- size: L; done: 2026-09-04 -->
- [x] Modalità 9 (Muqarnas): volta a stalattiti vista dal basso <!-- size: L; done: 2026-08-31 -->
- [x] Pannello controlli: simmetria, petali, zoom, iterazioni, complessità, velocità, palette, bloom <!-- size: M; done: 2026-08-30 -->
- [x] Pannello adattivo: slider spenti dove la modalità non li legge, nomi e Random per modalità <!-- size: M; done: 2026-09-04 -->
- [x] Pan, rotazione con Shift, zoom ancorato al puntatore, pinch <!-- size: M; done: 2026-08-30 -->
- [x] Permalink nell'hash e ripristino da localStorage <!-- size: M; done: 2026-08-30 -->
- [x] Export PNG del frame corrente <!-- size: S; done: 2026-08-30 -->
- [x] Gestione perdita del contesto WebGL <!-- size: S; done: 2026-08-30 -->
- [x] Fallback senza OES_standard_derivatives <!-- size: S; done: 2026-08-30 -->
- [x] Deploy statico dietro nginx condiviso <!-- size: M; done: 2026-08-30 -->
- [x] Documentazione: README, CLAUDE.md, project index <!-- size: M; done: 2026-08-30 -->

## Milestone: Le due modalità rotte

Chiusa. Entrambe le cause erano di parametrizzazione, non di stimatore. La 7
saturava perché il ciclo IFS ripiegava la curva sotto il pixel molto prima del
massimo dichiarato: ora ogni livello si dissolve quando il suo passo scende
sotto la dimensione del pixel, e il tetto è sceso da 10 a 6. La 6 è stata
riscritta sul frame di cella di `bandCell`/`cellBox` — costoloni, corsi di
losanghe a spaziatura geometrica e un'arcata di archi acuti sul bordo — al posto
dello spazio `(la*r, r)` non limitato che la faceva rendere come una ruota di
spicchi.

- [x] Diagnosi di modeMihrab: satura per eccesso di iterazioni, non per il termine <!-- size: M; done: 2026-08-31 -->
- [x] Diagnosi di modeVault: regione dell'arco non limitata, motivo sfasato per sid <!-- size: M; done: 2026-08-31 -->
- [x] Abbassare il tetto di iterazioni della 7 e ritarare l'arco a due centri <!-- size: M; done: 2026-09-04 -->
- [x] Riscrivere modeVault su una parametrizzazione limitata <!-- size: L; done: 2026-09-04 -->
- [x] Aggiungere i due shot mancanti a shotkit.config.mjs <!-- size: S; done: 2026-09-04 -->

## Milestone: Presentabilità

Chiusa. La licenza è MIT, scelta dall'autore. Le sei immagini del README vivono
in `screenshots/` e sono versionate: le produce `shotkit.readme.mjs`, che importa
le inquadrature da `shotkit.config.mjs` invece di riscriverle. Il menu dei preset
è dodici permalink e riusa `deserialize` + `applyState`, con un tempo iniziale
per le modalità che a `t=0` non hanno ancora risolto. Sotto i 620 px il pannello
diventa un foglio in basso con gli slider su due colonne e parte chiuso.

- [x] Scegliere e aggiungere una licenza <!-- size: S; done: 2026-09-04 -->
- [x] Screenshot versionati per il README, fuori da .shots/ <!-- size: S; done: 2026-09-04 -->
- [x] Preset nominati selezionabili dal pannello <!-- size: M; done: 2026-09-04 -->
- [x] Pannello usabile su schermo stretto <!-- size: M; done: 2026-09-04 -->

## Milestone: Tunabilità

Chiusa. Tre limiti diversi, tutti e tre chiusi: non si poteva tornare indietro
da una regolazione, col mouse non si raggiungevano i valori bassi del campo
visivo, e il colore aveva un solo grado di libertà. La storia, lo slot A/B, i
lucchetti, `Varia`, le viste salvate, i readout scrivibili e le bande di zona
vivono in `tuning.js`, che passa solo per la stringa del permalink e non tocca
né GL né `state`. L'hash ha tre chiavi nuove — `t` l'orologio, `h` la tinta, `k`
la saturazione — e un permalink più vecchio le ritrova ai valori neutri invece
di ereditarle dalla vista precedente.

- [x] Annulla e ripeti su una pila di stati serializzati, alimentata da `schedulePersist` <!-- size: M; done: 2026-09-04 -->
- [x] Confronto A/B: parcheggia una vista in uno slot e alternala con quella corrente <!-- size: S; done: 2026-09-04 -->
- [x] `t` nel permalink e scrubber del tempo, per fermare una modalità animata dove rende <!-- size: M; done: 2026-09-04 -->
- [x] Doppio click su uno slider: torna al valore che `modePresets` dà a questa modalità <!-- size: S; done: 2026-09-04 -->
- [x] Campo visivo su scala logaritmica, precisione relativa costante <!-- size: S; done: 2026-09-04 -->
- [x] Valore digitabile al posto del readout <!-- size: S; done: 2026-09-04 -->
- [x] Lucchetto per slider e pulsante «Varia»: mutazione ±15% dei soli parametri liberi <!-- size: M; done: 2026-09-04 -->
- [x] Trim di tinta e saturazione applicati dopo il dispatch in `main()` <!-- size: M; done: 2026-09-04 -->
- [x] Viste salvate dall'utente accanto ai preset nominati, in localStorage <!-- size: M; done: 2026-09-04 -->
- [x] Banda della zona utile sulla traccia degli slider, per modalità, senza toccare min/max <!-- size: M; done: 2026-09-04 -->

## Milestone: Qualità del rendering

L'export non passa più per la finestra: `exportPlan()` sceglie la dimensione e i
campioni per pixel, `setBufferExact()` dà a GL il buffer che serve e la riduzione
a valle è l'antialiasing. I due tetti veri — `MAX_VIEWPORT_DIMS` e la memoria —
abbassano prima il campionamento e solo in ultima istanza la dimensione, con un
avviso. Restano le due voci di prestazione, che vogliono hardware vero.

- [x] Supersampling opzionale per l'export PNG <!-- size: M; done: 2026-09-04 -->
- [x] Export a risoluzione scelta, indipendente dalla finestra <!-- size: M; done: 2026-09-04 -->
- [ ] Limitare il costo per frame sulle modalità pesanti a molte iterazioni <!-- size: L -->
- [ ] Verifica su GPU integrata e su mobile <!-- size: M -->

## Backlog

- [ ] Registrazione di un loop animato (WebM o sequenza PNG) <!-- size: XL -->
- [ ] Interfaccia in inglese accanto all'italiano <!-- size: M -->
- [ ] Nuove palette a partire da riferimenti fotografici <!-- size: M -->
- [ ] Modalità aggiuntive: tassellature aperiodiche, chahar bagh in pianta <!-- size: XL -->
- [ ] Famiglia completa di archi (ferro di cavallo, carena) sopra `sdArch` <!-- size: M -->
