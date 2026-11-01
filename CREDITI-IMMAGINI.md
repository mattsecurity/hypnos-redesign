# Registro fonti e permessi delle immagini

Registro interno (non pubblicato) di ogni immagine e asset grafico del sito: da dove viene e con quale permesso è usato.
La versione pubblica è `dist/crediti/index.html` (link "Crediti immagini" nel footer).

Aggiornato: 1 novembre 2026 · Responsabile: Matteo Sicurezza

## Fotografie (tutte generate con AI)

Generate con lo strumento immagini di OpenAI (`image_gen`) tramite Codex CLI, script `assets-src/gen.sh`, prompt in `assets-src/prompts/`.
Permesso: le condizioni d'uso di OpenAI assegnano a chi genera i diritti sull'output; usate per conto di HYPNOS Srl.
Nessuna ritrae prodotti venduti da HYPNOS, luoghi riconoscibili o persone reali.

| File in `dist/assets/img/` | Prompt (`assets-src/prompts/`) | Dove compare | Note |
|---|---|---|---|
| `aerial.webp` | `aerial.txt` | Sequenza 3D, cruscotto software | |
| `aerial-lod1.webp` | `lod1.txt` (dal ritaglio di `aerial`) | Sequenza 3D da vicino | |
| `anpr.webp`, `anpr-sm.webp` | `anpr.txt` | Soluzioni · Lettura targhe | |
| `autovelox.webp`, `autovelox-sm.webp` | `autovelox.txt` | Soluzioni · Autovelox, Verbali | |
| `tutor.webp`, `tutor-sm.webp` | `tutor.txt` | Soluzioni · Tutor, Verbali | Nome "Tutor" in attesa di conferma marchio da Hypnos |
| `ztl.webp`, `ztl-sm.webp` | `ztl.txt` | Soluzioni · ZTL, Verbali | |
| `parcometro.webp`, `parcometro-sm.webp` | `parcometro.txt` | Soluzioni · Parcometri | |
| `control.webp`, `control-sm.webp` | `control.txt` | Soluzioni · Software | |
| `speed-shot.webp` | `speed-shot.txt` | Verbali · Controllo velocità | Targa ridipinta a mano in "AB 123 CD" (1/11/2026), prima era "GM 471 KX" |
| `parcometro-front.webp` | `pk-front.txt` | Sosta · Fornitura | |
| `parking-street.webp` | `pk-street.txt` | Sosta · simulazione | |
| `van-top.webp` | `pk-van2.txt` | Sosta · simulazione | Scontornato |
| `meter-top.webp` | `pk-meter-top.txt` | Sosta · simulazione | |
| `cars/car-1…6.webp` | `car-top-1…6.txt` | Sosta · simulazione | Senza marchi |
| `cars/car-7…18.webp` | `pk-cars-a.txt`, `pk-cars-b.txt` | Sosta · simulazione | Ritagliate dai due fogli generati |
| `../tex/median-veg.webp` | `assets-src/veg/` | Sequenza 3D, spartitraffico | Siepi, rose, erba |

## Immagini fatte da noi

| File | Come | Permesso |
|---|---|---|
| `assets/og/hypnos-og.jpg` | Composta in HTML (foto `aerial`, logo, testi) e salvata con Chrome | Nostra |
| `assets/og/logo-512.png`, `logo-180.png`, `assets/favicon.svg` | Dalla scritta vettoriale HYPNOS (512: scritta intera; 180 e favicon: la O arancione) | Marchio del cliente |
| Telecamera ANPR, palo, città 3D, cartello | Geometria scritta in codice (`js/story.js`, `js/city.js`) | Nostra |

## Asset di terze parti

| Asset | Fonte | Licenza | Stato |
|---|---|---|---|
| `assets/3d/sedan.glb`, `sedan-atlas*.jpg` | github.com/ChenZongHeng/car (`benchi2.glb`), loghi e targa rimossi | MIT | OK, conservare la nota di licenza |
| `assets/3d/driver.glb` | Avatar Ready Player Me dagli esempi three.js (`examples/models/gltf/readyplayer.me.glb`) | Non indicata negli esempi three.js | **Da verificare**: termini Ready Player Me per uso commerciale; in alternativa sostituirlo |
| `assets/tex/rooftop_night_1k.hdr`, `asphalt_*`, `pavement_*` | Poly Haven | CC0 | OK |
| `assets/3d/car-shadow.png` | Esempio three.js `webgl_materials_car` | MIT (three.js) | OK |
| Font Inter, Inter Tight, JetBrains Mono (`assets/fonts/`) | Google Fonts, ospitati sul sito | SIL OFL 1.1 | OK |
| three.js, Lenis | npm | MIT | OK |
| GSAP + ScrollTrigger | GreenSock | Licenza standard GSAP (gratuita anche per uso commerciale) | OK |
