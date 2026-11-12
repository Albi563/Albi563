# Albero di famiglia

Web app per telefono (installabile come app) per ricostruire l'albero genealogico
di famiglia insieme ai parenti, condividendo un link segreto.

- **Albero** con tutta la famiglia: zoom a pizzico, tocca una persona per
  centrarla, toccala di nuovo per aprire il profilo.
- **Profilo**: foto, nome, cognome, sesso, data di nascita (anno obbligatorio,
  giorno e mese facoltativi), luogo di nascita, in vita / data di morte,
  luogo di residenza, note, familiari, chi l'ha aggiunta e modificata.
- **Parentele calcolate automaticamente** rispetto a chi usa l'app
  (nonna, cugino, cognata, prozio…).
- **Mappa** del mondo con i familiari raggruppati, interruttore *Nato a / Vive in*.
- **4 lingue**: italiano, inglese, rumeno, spagnolo.
- **Cronologia** di ogni modifica con ripristino; solo l'organizzatore può eliminare.
- 100% gratuito: Firebase (piano Spark) + GitHub Pages.

👉 **Per attivarla segui [SETUP.md](SETUP.md).**

## Struttura

```
docs/                 l'app (servita da GitHub Pages)
  index.html
  css/app.css
  js/app.js           schermate e navigazione
  js/store.js         dati: modalità demo (locale) o Firebase
  js/relations.js     calcolo delle parentele
  js/tree.js          impaginazione e gesti dell'albero
  js/map.js           mappa (Leaflet + OpenStreetMap)
  js/i18n.js          traduzioni
  js/config.js        ← qui va la configurazione Firebase
  vendor/leaflet/     libreria mappa (licenza BSD-2 / MIT)
firebase/firestore.rules   regole di sicurezza del database
```

## Provarla in locale

```
cd docs && python3 -m http.server 8000
```
poi apri <http://localhost:8000>.
