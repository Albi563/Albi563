# Albero di famiglia — guida all'attivazione

Tempo stimato: **20–30 minuti**, solo clic, nessun codice da scrivere.
Costo: **0 €** (piano gratuito Firebase "Spark" + GitHub Pages, nessuna carta di credito).

L'app è già funzionante in **modalità demo** (dati di esempio salvati solo sul
telefono). Questi passaggi la collegano a un database condiviso, così tutti i
familiari vedono e modificano lo stesso albero.

---

## Passo 1 — Pubblicare l'app su internet (GitHub Pages)

1. Apri `https://github.com/Albi563/Albi563` → **Settings** → **Pages**.
2. In *Build and deployment* → *Source* scegli **Deploy from a branch**.
3. Branch: **`main`** (oppure `claude/family-tree-app-y7mppk` finché non lo unisci), cartella **`/docs`** → **Save**.
4. Dopo 1–2 minuti l'app è su: **`https://albi563.github.io/Albi563/`**

> GitHub Pages gratuito richiede che il repository sia **pubblico**. È pubblico
> solo il *codice*: i dati della famiglia stanno nel database e si raggiungono
> solo con il link segreto.

Aprendo l'indirizzo vedrai la modalità demo: provala pure.

## Passo 2 — Creare il progetto Firebase

1. Vai su <https://console.firebase.google.com> e accedi con il tuo account Google.
2. **Crea un progetto** → nome a piacere (es. `albero-famiglia`) → Google Analytics **disattivato** → Crea.
3. Nella pagina del progetto clicca l'icona **`</>`** (Aggiungi app web) → nome `albero` → **non** spuntare Firebase Hosting → *Registra app*.
4. Ti mostra un blocco `const firebaseConfig = { apiKey: "...", ... }`. **Tienilo aperto**: serve al Passo 5.

## Passo 3 — Attivare il database (Firestore)

1. Menu a sinistra → **Build → Firestore Database** → **Crea database**.
2. Posizione: **`eur3 (europe-west)`** (o la più vicina a te) → Avanti.
3. Scegli **Avvia in modalità di produzione** → Crea.
4. Apri la scheda **Regole**, cancella tutto e incolla il contenuto del file
   [`firebase/firestore.rules`](firebase/firestore.rules) di questo repository → **Pubblica**.

## Passo 4 — Attivare l'accesso con Google (solo per te, organizzatore)

1. Menu → **Build → Authentication** → *Inizia*.
2. Scheda **Sign-in method** → **Google** → Abilita → scegli la tua email di assistenza → Salva.
3. Scheda **Settings → Domini autorizzati** → **Aggiungi dominio** → `albi563.github.io`.

I familiari **non** devono accedere con Google: a loro basta il link.

## Passo 5 — Collegare l'app a Firebase

1. Su GitHub apri il file `docs/js/config.js` → icona matita (Modifica).
2. Sostituisci il blocco `firebaseConfig` con quello copiato al Passo 2, ad esempio:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "albero-famiglia.firebaseapp.com",
     projectId: "albero-famiglia",
     storageBucket: "albero-famiglia.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
3. **Commit changes**. Dopo 1–2 minuti GitHub Pages si aggiorna.

> Questi valori **non sono segreti** (Google li prevede pubblici). La sicurezza
> la danno le regole del Passo 3 e il codice segreto nel link.

## Passo 6 — Creare la famiglia e condividerla

1. Apri `https://albi563.github.io/Albi563/` dal telefono.
2. Scrivi il nome della famiglia → **Accedi con Google** → diventi l'**organizzatore**.
3. L'app ti porta a un indirizzo tipo `…/Albi563/?f=Xk3…` : **questo è il link segreto**.
4. "Aggiungi me stesso", poi aggiungi genitori, nonni, ecc. dal tuo profilo.
5. **Impostazioni → Link da condividere → Copia** e mandalo ai familiari
   (già presenti nell'albero). Al primo accesso scriveranno il loro nome per farsi riconoscere.

### Installare l'app sul telefono (icona in home)
- **iPhone (Safari)**: tasto Condividi → *Aggiungi alla schermata Home*.
- **Android (Chrome)**: menu ⋮ → *Installa app* / *Aggiungi a schermata Home*.

---

## Cose da sapere (leggile)

- **Chi ha il link può modificare tutto.** Se il link finisce nelle mani sbagliate:
  fai un backup, crea una nuova famiglia (nuovo link) e importa il backup.
- **"Chi sei?" non è una password.** Serve a firmare le modifiche, ma chiunque
  abbia il link può dichiararsi chiunque. Per una famiglia va bene; non è una banca.
- **Solo tu (account Google organizzatore) puoi eliminare persone.** Gli altri
  possono solo aggiungere e modificare. Ogni salvataggio finisce nella
  **cronologia**, da cui si può ripristinare qualsiasi versione, anche una persona eliminata.
- **Fai un backup ogni tanto**: Impostazioni → *Esporta backup* (file .json).
- **Limiti gratuiti**: 1 GB di dati e 50.000 letture al giorno. Con ~100 persone
  e foto ridotte (circa 30 KB l'una) usi meno dell'1%.
- **Foto**: vengono ritagliate a quadrato e ridotte automaticamente.
- **Luoghi**: scrivi il nome e premi la lente 🔍, poi scegli il risultato giusto.
  Senza questo passaggio il luogo non compare sulla mappa.
