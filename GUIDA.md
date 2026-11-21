# Guida ad Amit 🎤

Spiegata passo per passo, senza dare nulla per scontato.

---

## 1. Pubblicare l'app su internet (gratis, una volta sola)

L'app vive su **GitHub Pages**: un hosting gratuito di GitHub. Il codice è già pronto,
devi solo accendere l'interruttore.

1. Apri il repository su GitHub (da browser, anche da telefono va bene).
2. Tocca **Settings** (Impostazioni). Da telefono: tocca i tre puntini `…` o scorri il menu in alto.
3. Nel menu a sinistra tocca **Pages**.
4. Alla voce **Source** scegli **GitHub Actions**.
5. Fatto! Ora vai nella scheda **Actions** del repository: vedrai "Pubblica su GitHub Pages".
   - Se è già partito, aspetta il pallino verde ✅ (1–2 minuti).
   - Se non è partito: toccalo e premi **Run workflow** → **Run workflow**.
6. Il tuo indirizzo sarà:
   **`https://TUO-NOME-UTENTE.github.io/NOME-REPOSITORY/`**
   (lo trovi anche in Settings → Pages, in alto).

Da ora in poi, **ogni modifica al codice viene pubblicata da sola**.

---

## 2. Installare l'app sul telefono

Così hai l'icona sulla schermata Home e funziona **anche senza internet**.

**iPhone (Safari)**
1. Apri l'indirizzo con **Safari** (non Chrome).
2. Tocca il pulsante **Condividi** (quadrato con freccia in su).
3. Scegli **Aggiungi alla schermata Home** → **Aggiungi**.

**Android (Chrome)**
1. Apri l'indirizzo con **Chrome**.
2. Tocca i **tre puntini** in alto a destra.
3. Scegli **Installa app** (o **Aggiungi a schermata Home**).

La prima volta che registri una nota vocale, il telefono ti chiede il permesso per il microfono: tocca **Consenti**.

---

## 3. Come si usa

**Pulsante giallo +** (sempre in basso al centro): salva subito un'idea.
- **Scrivi** → scrivi la barra → (facoltativo) scegli i tag e la traccia → **Salva idea**.
- **Registra** → parte subito la registrazione → tocca ■ per fermare → **Salva idea**.

**Taccuino**: tutte le idee, dalla più recente. Cerca con la barra in alto o filtra per tag.
Tocca un'idea per modificarla, collegarla a una traccia o creare una traccia nuova da lì.

**Tracce**: tutte le tue canzoni. Ogni traccia ha 3 schede:
- **Testo** – l'editor (vedi sotto).
- **Dettagli** – titolo, stato, BPM (puoi anche toccare "Tap a tempo" a ritmo del beat), progetto, note.
- **Idee** – le idee collegate. Per le idee scritte c'è "Aggiungi al testo".

**Progetti**: album, EP, singoli. Dentro trovi la tracklist (riordinabile con le frecce).

### L'editor testi
- Ogni blocco è una **sezione** (Strofa, Ritornello, Bridge, Intro, Outro). Tocca il nome per cambiarlo.
- **Una barra per riga**. A destra vedi il **numero di sillabe** (regola approssimata, tiene conto delle sinalefe).
- **Rime**: le parole con lo stesso suono finale (dalla vocale accentata in poi) hanno **lo stesso colore**,
  anche dentro la stessa riga. Se una parola ha l'accento in un posto strano, scrivilo tu (es. *àncora* / *ancóra*) e il colore si aggiusta.
- Gli interruttori **Rime** e **Sillabe** in alto li accendono e spengono.
- **Salva da solo** mentre scrivi (vedi "Salvato" in verde).
- "Copia testo" in fondo copia tutto il testo con le sezioni.

---

## 4. Backup: non perdere niente ⚠️

I dati sono salvati **solo sul tuo telefono** (non su internet). Se cancelli i dati del browser
o cambi telefono, li perdi… **a meno che non hai un backup**.

**Fare il backup** (consigliato una volta a settimana):
1. Vai in **Altro**.
2. Tocca **Condividi backup** e scegli Google Drive, iCloud/File, o mandalo a te stesso su WhatsApp/email.
   Oppure **Scarica backup** per salvarlo nei download.
3. Il file si chiama `amit-backup-DATA.json` e contiene **tutto**, note vocali comprese.

**Recuperare i dati** (es. su un telefono nuovo):
1. Installa l'app sul nuovo telefono.
2. Vai in **Altro** → **Ripristina backup (sostituisci tutto)** → scegli il file.
   - "Importa (unisci)" invece aggiunge i dati del file a quelli già presenti, senza cancellare nulla.

---

## 5. Problemi comuni

- **Non vedo le modifiche nuove dell'app**: chiudi l'app del tutto e riaprila (si aggiorna da sola).
- **Il microfono non funziona**: controlla nelle impostazioni del telefono che il browser/app abbia il permesso microfono.
- **La pagina di GitHub dà errore 404**: aspetta 2 minuti dopo il pallino verde in Actions, poi ricarica.
