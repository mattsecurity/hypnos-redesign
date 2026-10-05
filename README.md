# HYPNOS — Redesign

Sito professionale in italiano con catalogo di sei soluzioni, schede di approfondimento e sequenze fotografiche guidate dallo scroll per lettura targhe, varchi ZTL, autovelox, Tutor e parcometri.

## Anteprima locale

Dalla cartella del progetto:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Aprire http://127.0.0.1:4173.

## Contenuti e immagini

Servizi, indirizzo, telefono, e-mail, WhatsApp e dati societari ripresi da https://www.hypnosweb.it. La spiegazione della velocità media è stata verificata sul sito di Autostrade per l’Italia: https://www.autostrade.it/it/tecnologia-sicurezza/sicurezza/il-tutor.

I dispositivi e l’auto sono visual illustrativi generati con lo strumento integrato ImageGen. Targa, velocità e tempi delle animazioni sono esempi. Non sono fotografie dei modelli effettivamente commercializzati. Le immagini ottimizzate si trovano in `dist/assets/`; i prompt sono in `image-prompts.json` e `car-prompt.json`.

Il pannello software è un flusso illustrativo e non una riproduzione del gestionale reale.

Il modulo contatti prepara una richiesta nel programma di posta dell’utente, con riepilogo prima dell’apertura. Non invia messaggi dal server. Per invio diretto occorre collegare un servizio e-mail o il backend aziendale.

## Implementazione

HTML, CSS e JavaScript senza build. La sezione narrativa usa posizionamento sticky e Web Animations API; lo scorrimento controlla il tempo delle sequenze. Supporto tastiera per menu, dialoghi e schede; rispetto di `prefers-reduced-motion`. Nessun tracciamento e nessuna persistenza dei dati del modulo.

La pubblicazione Sites è separata dal dominio aziendale hypnosweb.it.
