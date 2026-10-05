# HYPNOS — Redesign

Sito professionale in italiano con catalogo di sei soluzioni, schede di approfondimento e un’unica sequenza con camera 3D guidata dallo scroll: vista dall’alto, passaggio al retro e avvicinamento alla targa. La sequenza viene mostrata una sola volta, seguita da esempi distinti di impiego del dato (ZTL, transiti e sicurezza stradale).

## Anteprima locale

Dalla cartella del progetto:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Aprire http://127.0.0.1:4173.

## Contenuti e immagini

Servizi, indirizzo, telefono, e-mail, WhatsApp e dati societari ripresi da https://www.hypnosweb.it. La spiegazione della velocità media è stata verificata sul sito di Autostrade per l’Italia: https://www.autostrade.it/it/tecnologia-sicurezza/sicurezza/il-tutor.

I dispositivi sono visual illustrativi generati con lo strumento integrato ImageGen. L’auto della nuova sequenza è un modello 3D illustrativo renderizzato in tempo reale; la fotografia dell’auto generata nella prima versione non è più usata nella pagina. Targa, velocità e tempi delle animazioni sono esempi. Non sono fotografie dei modelli effettivamente commercializzati. Le immagini ottimizzate si trovano in `dist/assets/`; i prompt sono in `image-prompts.json` e `car-prompt.json`.

Il pannello software è un flusso illustrativo e non una riproduzione del gestionale reale.

Il modulo contatti prepara una richiesta nel programma di posta dell’utente, con riepilogo prima dell’apertura. Non invia messaggi dal server. Per invio diretto occorre collegare un servizio e-mail o il backend aziendale.

## Implementazione

HTML, CSS e JavaScript senza build. La sezione narrativa usa posizionamento sticky e Three.js 0.180.0. Lo scroll controlla un percorso continuo della camera, interpolato con Catmull–Rom, dall’alto al retro e fino alla targa. La targa è una texture dimostrativa e il riquadro di acquisizione è proiettato dalla sua posizione 3D. Nessun ciclo automatico e nessuna animazione dell’auto nelle applicazioni successive. Three.js e il decoder Draco sono serviti localmente. Rendering sospeso quando la scheda è nascosta e dopo che la camera ha raggiunto la posizione richiesta; fallback testuale se WebGL non è disponibile. Supporto tastiera per menu, dialoghi e schede; rispetto di `prefers-reduced-motion`. Nessun tracciamento e nessuna persistenza dei dati del modulo.

La pubblicazione Sites è separata dal dominio aziendale hypnosweb.it.

## Asset 3D e attribuzioni

- Modello auto Ferrari 458 Italia: vicent091036, fonte indicata nell’esempio ufficiale Three.js https://threejs.org/examples/webgl_materials_car.html e https://sketchfab.com/models/57bf6cc56931426e87494f554df1dab6. Modello distribuito negli esempi Three.js: https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/ferrari.glb. Materiali e targa dimostrativa personalizzati.
- Ambiente HDR Venice sunset: asset degli esempi Three.js, https://github.com/mrdoob/three.js/blob/dev/examples/textures/equirectangular/venice_sunset_1k.hdr.
- Three.js: licenza MIT conservata in dist/vendor/three/LICENSE.txt.
