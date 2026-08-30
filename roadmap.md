# Fractal Mandala Visualiser

Bozza. Le milestone qui sotto sono dedotte dallo stato del codice, non da un
piano già concordato: scadenze e priorità vanno confermate.

## Milestone: Base giocabile

- [x] Otto modalità GLSL con dispatch da uniform <!-- size: XL; done: 2026-08-30 -->
- [x] Pannello controlli: simmetria, petali, zoom, iterazioni, complessità, velocità, palette, bloom <!-- size: M; done: 2026-08-30 -->
- [x] Pan, rotazione con Shift, zoom ancorato al puntatore, pinch <!-- size: M; done: 2026-08-30 -->
- [x] Permalink nell'hash e ripristino da localStorage <!-- size: M; done: 2026-08-30 -->
- [x] Export PNG del frame corrente <!-- size: S; done: 2026-08-30 -->
- [x] Gestione perdita del contesto WebGL <!-- size: S; done: 2026-08-30 -->
- [x] Fallback senza OES_standard_derivatives <!-- size: S; done: 2026-08-30 -->
- [x] Deploy statico dietro nginx condiviso <!-- size: M; done: 2026-08-30 -->
- [x] Documentazione: README, CLAUDE.md, project index <!-- size: M; done: 2026-08-30 -->

## Milestone: Le due modalità rotte

Modalità 6 (Volta a Spicchi) e 7 (Mihrab) collassano in una silhouette piena su
tutte le combinazioni di parametri provate. Sono nel menu ma non mostrabili.

- [ ] Diagnosi di modeMihrab: capire quale termine satura la nicchia <!-- size: M -->
- [ ] Diagnosi di modeVault: capire perché solo alcuni spicchi si riempiono <!-- size: M -->
- [ ] Correggere le due modalità o rimuoverle dal menu <!-- size: L -->
- [ ] Aggiungere i due shot mancanti a shotkit.config.mjs <!-- size: S -->

## Milestone: Presentabilità

- [ ] Scegliere e aggiungere una licenza <!-- size: S -->
- [ ] Screenshot versionati per il README, fuori da .shots/ <!-- size: S -->
- [ ] Preset nominati selezionabili dal pannello <!-- size: M -->
- [ ] Pannello usabile su schermo stretto <!-- size: M -->

## Milestone: Qualità del rendering

- [ ] Supersampling opzionale per l'export PNG <!-- size: M -->
- [ ] Export a risoluzione scelta, indipendente dalla finestra <!-- size: M -->
- [ ] Limitare il costo per frame sulle modalità pesanti a molte iterazioni <!-- size: L -->
- [ ] Verifica su GPU integrata e su mobile <!-- size: M -->

## Backlog

- [ ] Registrazione di un loop animato (WebM o sequenza PNG) <!-- size: XL -->
- [ ] Interfaccia in inglese accanto all'italiano <!-- size: M -->
- [ ] Nuove palette a partire da riferimenti fotografici <!-- size: M -->
- [ ] Modalità aggiuntive: muqarnas, tassellature aperiodiche <!-- size: XL -->
