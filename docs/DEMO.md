# Demo pubblica

Il visualizzatore online ha due ingressi sulla stessa installazione:

| Indirizzo | Chi entra | Cosa ottiene |
| --- | --- | --- |
| `https://fractal.demos.noeinsolutions.com/demo` | chiunque, senza registrazione | il visualizzatore intero per **45 minuti, una volta sola**, con un banner e una vista iniziale scelta |
| `https://fractal.demos.noeinsolutions.com/` | solo il proprietario, con password | la versione completa, senza limiti né banner |

Il sito Noein linka `/demo`. In locale non cambia niente: `index.html` si apre
ancora da `file://` o da `python -m http.server`, senza limite e senza banner.
Il server esiste solo per il deploy.

## Come funziona

Tutto il rendering gira nel browser del visitatore; il server decide solo **a
chi consegnare i file**. `demo/server.mjs` usa soltanto ciò che Node ha già
dentro (server web e SQLite), quindi non c'è niente da installare.

1. **Prima visita a `/demo`.** Il server crea una sessione di 45 minuti, la
   ricorda in un cookie del browser e in un piccolo database, e manda
   `index.html` con due righe in più: il foglio `demo/demo.css` e lo script
   `demo/demo.js`. Il file `index.html` sul disco non viene toccato.
2. **La pagina.** `demo/demo.js` gira prima di `main.js`: se l'indirizzo non ha
   già una vista, mette «Giardino di smeraldo», la stessa della prima immagine
   sul sito Noein. Poi mostra il banner: testo, minuti rimasti, **Ricomincia**
   (torna alla vista iniziale; Ctrl+Z la annulla), **Contatti** e ×. La ×
   riduce il banner al solo orologio, che resta per tutta la sessione; un click
   sull'orologio lo riapre.
3. **Ritorno nella finestra.** Chiudere la scheda e tornare entro i 45 minuti
   riporta la stessa sessione con il tempo che resta, mai una nuova.
4. **Allo zero.** La scheda si ricarica e il server risponde con la pagina «La
   demo è finita»: il disegno si ferma perché la pagina non c'è più. Da quel
   momento il server rifiuta a quella sessione anche `main.js` e `shader.js`,
   non solo la pagina. Quando la scheda torna
   in primo piano chiede l'ora al server, così un portatile rimasto in
   sospensione non conta male.
5. **La versione completa.** `/` chiede la password (qualunque nome utente).
   Senza `SITE_PASSWORD` impostata resta chiusa (503): non si apre per errore.

### Quanto regge il limite

È un limite morbido, e va detto:

- una finestra privata o un altro browser valgono come un nuovo visitatore;
  il tetto di **3 sessioni al giorno per indirizzo IP** frena chi ci prova da
  una sola connessione, ma una rete condivisa (ufficio, operatore mobile) può
  raggiungerlo davvero, e allora il visitatore vede «Troppe demo da questa rete»;
- il codice è pubblico su GitHub con licenza MIT.

Serve a far provare il prodotto, non a proteggerlo.

## Cosa conserva il server, e per quanto

Per ogni sessione, una riga nel database: un identificativo casuale (lo stesso
del cookie), un hash con chiave dell'indirizzo IP (l'indirizzo in chiaro non
viene mai scritto), l'ora di inizio e quella di fine. Nessun nome, nessuna
email, nessuna vista. Le righe si cancellano dopo **90 giorni**; da quel
momento lo stesso browser può avere una nuova sessione, perché la regola «una
volta sola» dura quanto la sua traccia.

Il database sta in `/data/demo.sqlite`, sul volume Docker `demo-data`, e
sopravvive ai deploy. Non ha backup, e non gli serve: perderlo vuol dire solo
che chi aveva già fatto la demo può rifarla.

## Variabili d'ambiente

Sul server stanno in `/opt/sites/fractal/.env`, mai in git.

| Variabile | Default | Cosa fa |
| --- | --- | --- |
| `DEMO_MODE` | spento | L'interruttore. `true` accende la demo e la password; qualunque altro valore spegne entrambe. |
| `SITE_PASSWORD` | nessuna | Password della versione completa su `/`. Senza, `/` risponde 503. |
| `DEMO_SESSION_MINUTES` | `45` | Durata di una sessione. |
| `DEMO_SESSIONS_PER_IP_PER_DAY` | `3` | Sessioni nuove per indirizzo IP per giorno UTC. |
| `DEMO_RETENTION_DAYS` | `90` | Dopo quanti giorni una riga viene cancellata. |
| `DEMO_DB_PATH` | `demo/data/demo.sqlite` | Dove sta il database. `compose.yml` lo mette su `/data`. |
| `PORT` | `8080` | Porta del server. |

Un valore `0` o non numerico non significa mai «nessun limite»: il server usa il
default e lo scrive nel log.

## Spegnere la demo

Nel file `.env` del server: `DEMO_MODE=false`, poi `bash deploy.sh`. Il sito
torna com'era prima della demo: il visualizzatore intero pubblico su `/`, senza
password e senza orologio, e `/demo` che rimanda a `/`, così il link sul sito
Noein continua a funzionare.

Per togliere la demo anche dal sito Noein: cancellare il blocco `demo` della
scheda `h4-fractal-visualiser` e il suo gemello italiano in
`W8_NoeinSolLandingPage/src/_data/builds.js`.

## Provarla in locale

Serve Node 22.13 o più recente.

```powershell
$env:DEMO_MODE = "true"; $env:SITE_PASSWORD = "prova"; $env:DEMO_SESSION_MINUTES = "2"
npm start
```

Poi `http://127.0.0.1:8080/demo` (la demo) e `http://127.0.0.1:8080/` (password
`prova`). Con due minuti si vede anche la fine. Per ricominciare da zero,
cancellare la cartella `demo/data/`, che git ignora.

Test del server, senza browser:

```bash
npm test
```

Coprono: la sessione che finisce alla sua durata e non si rinnova, il ritorno
dentro la finestra, i file dell'app negati a una sessione scaduta, il tetto per
IP e il suo azzeramento il giorno dopo, la password su `/` (e il 503 senza),
l'interruttore spento, i file fuori elenco mai serviti, la pulizia dopo 90
giorni, un limite a `0` che resta un limite, e che `index.html` abbia ancora i
due punti in cui la demo si aggancia.

## Messa online

Prima di cominciare: il deploy rifiuta una copia di lavoro con modifiche non
salvate in un commit, e il server scarica da GitHub, non dal tuo computer.

1. **Commit e push.** La modalità 10 in corso va chiusa in un suo commit;
   la demo in un altro (`demo/`, `docs/DEMO.md`, `package.json`, `.gitignore`,
   `.deploy/`). Poi `git push`.
2. **Primo deploy, con la demo ancora spenta.** Da Git Bash, nella cartella
   della repo: `bash deploy.sh --dry-run`, controlla che dica `type: node` e
   `upstream: site-fractal-web:8080/healthz`, poi `bash deploy.sh`. Il file
   `.env` del server è ancora vuoto, quindi il sito resta pubblico com'è oggi:
   nessuno vede una password. Se il deploy fallisce, torna da solo al commit
   precedente.
3. **Controllo.** `curl -s -o /dev/null -w '%{http_code}' https://fractal.demos.noeinsolutions.com/demo`
   deve dare `302` (la demo spenta rimanda a `/`).
4. **Sito Noein.** In `W8_NoeinSolLandingPage/src/_data/builds.js`, scheda
   `h4-fractal-visualiser`, sostituisci il blocco `demo`:

   ```js
   demo: {
     url: 'https://fractal.demos.noeinsolutions.com/demo',
     kind: 'sandbox',
     note: 'No sign-up, 45 minutes per visitor. Needs WebGL; the control panel is in Italian.',
     newTab: true
   }
   ```

   e, più in basso in `IT_BUILDS`, quello italiano:

   ```js
   demo: {
     url: 'https://fractal.demos.noeinsolutions.com/demo',
     kind: 'sandbox',
     note: 'Nessuna registrazione, 45 minuti per visitatore. Serve un browser con WebGL.',
     newTab: true
   }
   ```

   Poi `npm run check` in quella repo, apri `/en/builds.html` e
   `/it/builds.html` e verifica il link e la nota, e pubblica il sito come di
   consueto. Con la demo ancora spenta il nuovo link porta già al visualizzatore.
5. **Accendere.** Collegati al server con `ssh root@77.42.70.26`, apri il file
   con `nano /opt/sites/fractal/.env` e scrivi due righe:

   ```
   DEMO_MODE=true
   SITE_PASSWORD=<una password lunga, solo tua>
   ```

   Salva (Ctrl+O, Invio, Ctrl+X) ed esci dal server. Poi di nuovo
   `bash deploy.sh` dal tuo computer: il contenitore riparte con le variabili
   nuove.
6. **Verifica finale.** In una finestra privata: `/demo` mostra il banner con
   44:5x minuti; `/` chiede la password e con la tua apre la versione completa.
   Sul server, `docker logs site-fractal-web` deve mostrare
   `DEMO_MODE=true` e `45 min per session, 3 per IP per day`, e nessun avviso
   su `SITE_PASSWORD`.
7. **Aggiorna i due file che dicono ancora il contrario**, dopo il commit della
   modalità 10: in `README.md` la riga `Live:` diventa
   `https://fractal.demos.noeinsolutions.com/demo`; in `CLAUDE.md` la sezione
   «Forma del progetto» deve dire che esiste un server, ma solo per il deploy
   (`demo/`, `package.json`), e la nota sulla soglia dei 620 px deve contare tre
   file, perché anche `demo/demo.css` la usa. Infine, in `demo/demo.json`,
   `status` diventa `"live"`, `url` l'indirizzo di `/demo` e
   `registeredOnLanding` `true`.

## File

| Percorso | Ruolo |
| --- | --- |
| `demo/server.mjs` | Il server: le due porte, la sessione, i file concessi. |
| `demo/store.mjs` | Il database delle sessioni. |
| `demo/pages.mjs` | Le pagine in italiano (fine, troppe demo, riservata) e l'aggancio in `index.html`. |
| `demo/demo.js` | Banner, orologio, Ricomincia, vista iniziale. |
| `demo/demo.css` | Stile del banner. |
| `demo/server.test.mjs` | I test (`npm test`). |
| `demo/demo.json` | La scheda della demo letta dal sito Noein. |
| `package.json` | Solo gli script `start` e `test`: nessuna dipendenza. |
| `.deploy/` | Configurazione del server: tipo `node`, volume `demo-data`, controllo di salute su `/healthz`. |
