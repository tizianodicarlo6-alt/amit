# Quaderno

Web app (PWA) in italiano per scrivere rap dal telefono.

**Fase 1 (pronta):** Taccuino (idee di testo e note vocali), Progetti e Tracce, Editor testi con sillabe e rime colorate, backup.
**In arrivo:** Libreria beat e Studio (fase 2), Allenamento (fase 3).

👉 Leggi **[GUIDA.md](GUIDA.md)** per pubblicarla e installarla sul telefono.

## Per sviluppatori

```bash
npm install
npm run dev     # anteprima locale
npm test        # test di sillabe e rime
npm run build   # versione finale in dist/
```

Struttura:

```
src/
  db/          database locale (Dexie / IndexedDB) e backup
  lib/         regole italiane: sillabe e rime (con test)
  components/  barra in basso, fogli, lettore audio, registratore, salvataggio automatico
  features/
    taccuino/  idee
    progetti/  progetti e tracce
    editor/    editor testi
    altro/     backup e funzioni in arrivo
```
