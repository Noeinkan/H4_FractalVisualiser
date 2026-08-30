# Fractal Mandala Visualiser

Visualizzatore WebGL di mandala ispirati alla geometria islamica: nove
modalità di rendering, otto palette, simmetria e iterazioni regolabili dal vivo,
e un permalink nell'URL che descrive per intero la vista che stai guardando.

Live: <https://fractal.77.42.70.26.nip.io>

## Cos'è

Una singola pagina HTML che disegna un fullscreen quad e lascia tutto il lavoro
a un fragment shader GLSL. Niente build step, niente dipendenze, niente backend:
`index.html` + tre file. Aprirlo da `file://` funziona esattamente come servirlo
da un web server.

Le nove modalità:

| # | Modalità | Cosa disegna |
|---|---|---|
| 0 | Kaleido IFS | pieghe caleidoscopiche + inversione sferica (orbit trap) |
| 1 | Giardino Floreale | arabesco islimi: rose SDF annidate con steli ondulati |
| 2 | Girih Stars | tassellatura stellare su anelli radiali, con intreccio |
| 3 | Julia Bloom | insieme di Julia filtrato attraverso il caleidoscopio |
| 4 | Shamsa | medaglione solare: stelle annidate e raggiera |
| 5 | Cupola Spirale | tassellatura a spirale in stile Sheikh Lotfollah |
| 6 | Volta a Spicchi | volta a crociera con spicchi ad arco — **incompleta** |
| 7 | Mihrab | nicchia ad arco acuto con viticci islimi — **incompleta** |
| 8 | Henna | mandala vettoriale piatto: bande concentriche di motivi disegnati |

Le modalità 6 e 7 sono lasciate accessibili ma non rendono correttamente: su
tutte le combinazioni di parametri provate collassano in una silhouette piena
invece di risolvere la struttura. Vedi [roadmap.md](roadmap.md).

La modalità 8 non è un frattale: è illustrazione. Otto bande concentriche,
ciascuna con la propria simmetria e il proprio motivo, rese a campiture piatte
con un contorno di spessore costante su fondo chiaro. È l'unica che ignora il
tonemap e la vignette, e l'unica che va guardata ferma (velocità 0).

## Come si usa

Apri `index.html` nel browser, oppure servi la cartella:

```bash
python -m http.server 5188
# poi http://127.0.0.1:5188
```

Interazione sul canvas:

| Gesto | Effetto |
|---|---|
| trascina | sposta la vista (pan) |
| Shift + trascina | ruota |
| rotella / pinch | zoom ancorato al puntatore |
| doppio click | fullscreen |

Il pannello a destra si apre e chiude col pulsante `☰`. `PNG` esporta il frame
corrente, `Random` genera una combinazione di parametri, `Centra` azzera pan e
rotazione.

## Il permalink

Ogni modifica riscrive l'hash dell'URL (con debounce a 250 ms) e lo salva in
`localStorage`. Copiare la barra degli indirizzi condivide la vista esatta.

```
#m=1&s=12&p=6&i=7&z=2.8&c=1.1&v=2&b=1&g=7&x=-0.12&y=0&r=0
```

| Chiave | Significato | Range |
|---|---|---|
| `m` | modalità | 0–8 |
| `s` | simmetria (ordine del caleidoscopio) | 3–24 |
| `p` | petali | 3–16 |
| `i` | iterazioni | 1–14, con un massimo per modalità |
| `z` | campo visivo | 0.2–8 — **più alto = più largo**, più basso = zoom profondo |
| `c` | complessità (fattore di scala per iterazione) | 0.50–1.80 |
| `v` | velocità dell'animazione | 0–2 |
| `b` | bloom | 0–2 |
| `g` | palette | 0–7 |
| `x`, `y` | pan, in unità di schermo | — |
| `r` | rotazione, in radianti | — |

All'avvio l'hash esplicito vince sull'ultima sessione salvata. Se `localStorage`
non è disponibile (finestra privata, sandbox) resta l'URL come sola fonte.

## Screenshot

Gli screenshot si rigenerano con
[screenshot-kit](file:///C:/Personal_utilities/screenshot-kit) leggendo
`shotkit.config.mjs`:

```bash
node C:/Personal_utilities/screenshot-kit/shotkit.mjs --serve
```

L'output finisce in `.shots/`, che è in `.gitignore`: le immagini non sono
versionate.

## Deploy

Sito statico dietro l'nginx condiviso, configurato in [.deploy/](.deploy/):
nessun build sul server, il checkout è montato in sola lettura, quindi un
rollback è un `git checkout` del commit precedente.

## Compatibilità

Serve WebGL 1. `OES_standard_derivatives` è opzionale: se manca, l'anti-aliasing
usa una soglia fissa al posto di `fwidth()` e la pagina lo segnala. La perdita di
contesto WebGL è gestita: il programma viene ricompilato al ripristino.

## Licenza

Non ancora definita — vedi [roadmap.md](roadmap.md).
