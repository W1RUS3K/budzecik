# Budżet — osobista PWA do śledzenia wydatków

Prywatna aplikacja webowa do budżetu domowego. Działa w przeglądarce, instaluje się jak natywna apka na iPhonie (Safari → Udostępnij → Dodaj do ekranu początkowego), wszystkie dane trzyma lokalnie w przeglądarce. Po pierwszym wczytaniu działa offline.

## Co potrafi (v1)

- Wydatki i przychody z kategoriami, datą i notatką
- Limity budżetowe per kategoria z paskami postępu (zielony → żółty 80% → czerwony przekroczone)
- Pulpit miesięczny: saldo, top wydatki, limity
- Lista transakcji pogrupowana po dniach, edycja po tapnięciu
- Raporty miesięczne i roczne z wykresami kołowymi + tabelą procentową
- W trybie rocznym dodatkowy wykres słupkowy przychody/wydatki po miesiącach
- Edytowalne kategorie (kolor, nazwa, limit), dodawanie własnych
- Eksport i import JSON do przenoszenia między urządzeniami
- Ciemny motyw, polski interfejs

---

## Wdrożenie krok po kroku (GitHub Pages)

### Krok 1 — Załóż repozytorium

1. Wejdź na https://github.com i zaloguj się (jak nie masz konta — załóż, darmowe)
2. Kliknij `+` w prawym górnym rogu → `New repository`
3. Nazwa repo: `budzet` (albo cokolwiek innego — nazwa pojawi się w URL aplikacji)
4. Wybierz **Public** (na publicznym Pages działa zawsze za darmo; private też zadziała przy darmowym koncie GitHub Free, ale dla bezpieczeństwa zostaw publiczne — dane i tak siedzą tylko u ciebie w przeglądarce, nie w repo)
5. **Nie zaznaczaj** "Add README" ani niczego innego — wgrasz pliki ręcznie
6. `Create repository`

### Krok 2 — Wgraj pliki

Najprościej przez interfejs www:

1. Na stronie nowego (pustego) repo zobaczysz link `uploading an existing file` w środku ekranu — kliknij
2. Przeciągnij do okna **wszystkie pliki z tej paczki**:
   - `index.html`
   - `app.js`
   - `manifest.json`
   - `service-worker.js`
   - `README.md`
   - cały folder `icons/` (przeciągnij folder, GitHub zachowa strukturę)
3. Na dole strony kliknij `Commit changes`

Alternatywnie przez git z konsoli:
```bash
git clone https://github.com/TWOJ_LOGIN/budzet.git
cd budzet
# skopiuj tutaj wszystkie pliki z paczki
git add .
git commit -m "Initial commit"
git push
```

### Krok 3 — Włącz GitHub Pages

1. W repo: `Settings` (zakładka u góry) → `Pages` (lewa kolumna na dole)
2. **Source**: `Deploy from a branch`
3. **Branch**: `main`, folder `/ (root)` — kliknij `Save`
4. Po ~1–2 minutach (czasem dłużej za pierwszym razem) na górze strony pojawi się zielony pasek z adresem typu:
   `https://twoj-login.github.io/budzet/`
5. Zapisz sobie ten link — to będzie URL aplikacji

### Krok 4 — Otwórz w iPhonie i zainstaluj

1. W **Safari** na iPhonie (musi być Safari, nie Chrome) wejdź na ten adres
2. Dotknij przycisku Udostępnij (kwadrat ze strzałką w górę) na dolnym pasku
3. Przewiń w dół, dotknij **Dodaj do ekranu początkowego**
4. Możesz zmienić nazwę (domyślnie „Budżet"), zatwierdź `Dodaj`
5. Ikonka pojawi się na ekranie początkowym obok innych apek
6. Otwórz z ikonki — apka leci na pełny ekran, bez paska Safari, działa offline

### Krok 5 — Otwórz na innych urządzeniach

Po prostu wejdź na ten sam adres `https://twoj-login.github.io/budzet/` w przeglądarce na komputerze, tablecie, drugim telefonie. Każde urządzenie ma **własne, niezależne dane** (siedzą w localStorage przeglądarki).

---

## Synchronizacja między urządzeniami

W v1 nie ma automatycznej synchronizacji — bo to wymagałoby backendu (Firebase, własny serwer). Zamiast tego masz **ręczny eksport/import JSON**:

1. Na urządzeniu A: `Ustawienia` → `Eksportuj dane` → zapisuje plik `budzet-YYYY-MM-DD.json`
2. Zapisz ten plik do iCloud Drive / Google Drive
3. Na urządzeniu B: `Ustawienia` → `Importuj dane` → wybierz plik z chmury
4. Import **zastępuje** obecne dane na tym urządzeniu

To trochę uciążliwe, jeśli planujesz aktywnie używać apki na kilku urządzeniach jednocześnie. Realnie wybierz sobie jedno „main" urządzenie (telefon) i traktuj eksport jako backup, nie synchro. Pełną synchronizację można dorobić w v2.

---

## Aktualizacja aplikacji

Jak będziesz coś zmieniał w kodzie:

1. Edytuj pliki w repo (przez GitHub UI albo `git push`)
2. **Ważne**: w `service-worker.js` zmień linijkę `const CACHE_VERSION = 'budget-v1';` na `'budget-v2'` (kolejny numer). Bez tego użytkownicy (czyli ty) dostaną starą wersję z cache i nie zobaczą zmian.
3. Pages odbuduje stronę automatycznie po pushu, w ~1 minutę
4. Na iPhonie: zamknij apkę z multitaskingu i otwórz ponownie. Service worker pobierze nową wersję.

---

## Struktura plików

```
budzet/
├── index.html          ← shell aplikacji + cały CSS w <style>
├── app.js              ← logika: stan, render, modal, eksport/import
├── manifest.json       ← metadane PWA (nazwa, ikony, kolory)
├── service-worker.js   ← cache offline
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   └── apple-touch-icon.png
└── README.md           ← ten plik
```

Wszystkie dane aplikacji żyją w `localStorage` pod kluczem `budget-pwa-v1`. Możesz je obejrzeć w DevTools przeglądarki (Application → Local Storage).

---

## Co dalej (pomysły na v2)

- **Transakcje cykliczne** (Netflix, abonamenty, rata) — wpisujesz raz, samo się generuje co miesiąc
- **Wiele kont / źródeł** (gotówka, karta Millennium, karta firmowa, PayPal) z osobnymi saldami
- **Tagi** obok kategorii — drugi wymiar do filtrowania w raportach
- **Wielowalutowość z kursami** — automatyczne przeliczanie EUR/USD na PLN
- **Cele oszczędnościowe** ze śledzeniem postępu
- **Porównanie miesiąc-do-miesiąca** w raporcie (słupek poprzedni vs aktualny)
- **Widok kalendarza** z heatmapą wydatków
- **Zdjęcia paragonów** (input capture=camera)
- **Sync** przez Firebase albo zapis pliku w iCloud przez Files

Jak zaczniesz aktywnie używać, sam zobaczysz, czego brakuje. Wtedy dorzucamy.
