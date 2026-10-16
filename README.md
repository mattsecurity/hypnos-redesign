# HYPNOS Srl — Redesign

Sito one-page in italiano per HYPNOS Srl (contenuti da https://www.hypnosweb.it).

## Struttura

- **Intro** — il logo originale (marchio "H" ricostruito in SVG dalla favicon ufficiale + wordmark corallo) si disegna, poi vola nella barra di navigazione.
- **Sequenza 3D guidata dallo scroll** (`js/story.js`, Three.js 0.180):
  1. città dall'alto all'ora blu, auto che percorre il viale, traffico che si muove;
  2. zoom zenitale sull'auto (mirino HUD);
  3. volo fino al punto di controllo, discesa sulla telecamera ANPR montata sul palo dello spartitraffico, passaggio alle spalle della telecamera con profondità di campo;
  4. "flash" e passaggio nel feed della telecamera: rilevamento veicolo, box targa, ritaglio targa, OCR carattere per carattere;
  5. verifiche: classe, colore, velocità, RCA, revisione, veicoli rubati, ZTL, transito registrato.
- **Sezioni**: manifesto (parole che si accendono), soluzioni (galleria orizzontale fissata), sosta chiavi in mano (pianta animata con stalli e occupazione), servizio integrato verbali (flusso a 5 fasi), software (cruscotto live con transiti fittizi), metodo, azienda + gestione tributi, contatti (modulo che prepara una e-mail).

## Anteprima locale

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Aprire http://127.0.0.1:4173. Debug: `window.__go(0.7)` salta a un punto della sequenza; `?q=high` / `?q=low` forza la qualità.

## Tecnica della sequenza

- Terreno: foto aerea zenitale generata (`assets/img/aerial.webp`) + un secondo livello di dettaglio (`aerial-lod1.webp`) generato a partire dal ritaglio centrale e allineato in colore. Lo shader del terreno fonde i due livelli in base alla quota, aggiunge micro-dettaglio d'asfalto reale (Poly Haven) e calcola in modo analitico i coni dei fari e le luci posteriori.
- Segnaletica, cordoli, lampioni e palo sono geometria 3D allineata alle misure della foto.
- **Città 3D** (`js/city.js`), allineata alla foto e prolungata oltre i suoi bordi: marciapiedi rialzati con cordoli in granito, aiuola spartitraffico all'italiana (pacciamatura, siepi di bosso potate sui due lati, rose arbustive rosa e bianche, sfere di bosso, ciuffi d'erba) fatta con ritagli fotografici generati (`assets/tex/median-veg.webp`, sorgenti in `assets-src/veg/`); filari di platani con aiuole quadrate alla base; palazzi del primo fronte con facciate milanesi procedurali (finestre accese, persiane, vetrine, portoni, cornicioni, balconi in ferro battuto) e tetti presi dalla foto aerea. La vegetazione è un unico sistema di card istanziate (alpha-to-coverage, vento, illuminazione dei lampioni con traslucenza).
- Le inquadrature aeree restano la foto originale: la città 3D compare con una dissolvenza solo quando la camera scende verso il punto di controllo.
- **Guidatore** (`js/driver.js`): avatar umano con scheletro, rivestito in abito scuro e camicia bianca (texture ricolorate), capelli corti aggiunti come guscio skinnato, seduto e messo in posa con IK analitica (mani sul volante, piedi sui pedali), micro-movimenti della testa.
- **Camera**: movimento da drone con rumore organico, leggero rollio in virata, micro-oscillazione del palo nel feed; motion blur sui movimenti rapidi; aloni dei lampioni; cielo dell'ora blu nelle inquadrature radenti.
- Post-produzione: bloom, profondità di campo vicino alla telecamera, grading con grana/vignettatura, modalità "feed" (distorsione, aberrazione, linee).
- Fallback a immagine statica se WebGL2 non è disponibile; qualità ridotta su mobile.

## Immagini generate (Codex image_gen)

Prompt in `assets-src/prompts/`, script `assets-src/gen.sh`. Auto viste dall'alto della pianta sosta (`assets/img/cars/`, 6 modelli con sfondo trasparente). Foto: vista aerea, LOD aerea, telecamera ANPR, autovelox, Tutor, varco ZTL, parcometro, sala operativa. Sono immagini illustrative, non foto dei prodotti commercializzati. Targa, velocità ed esiti dei controlli sono fittizi.

## Asset di terze parti

- Auto: berlina dal repository https://github.com/ChenZongHeng/car (`data/benchi2.glb`, licenza MIT), compressa con glTF-Transform (Draco, WebP). Loghi e targa originale rimossi dalla texture (`assets/3d/sedan-atlas.jpg`); carrozzeria nera, cerchi e luci ridefiniti nel codice; targhe italiane fittizie aggiunte in 3D. Ombra di contatto dall'esempio Three.js `webgl_materials_car`.
- Poly Haven (CC0): modello `security_camera_01`, HDRI `rooftop_night`, texture `asphalt_04`.
- Guidatore: avatar Ready Player Me dagli esempi di three.js (`examples/models/gltf/readyplayer.me.glb`), alleggerito con glTF-Transform (rimossi cappello, baffi, denti e morph target) → `assets/3d/driver.glb`.
- Three.js (MIT), GSAP + ScrollTrigger, Lenis.
- Font: Inter, Inter Tight, JetBrains Mono (Google Fonts).

Il modulo contatti non invia dati a server: apre il programma di posta con il riepilogo.
