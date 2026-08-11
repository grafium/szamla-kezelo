# Munkanapló

Munkamenetenként rögzíti, mi történt és miért — az `ALLAPOT.md` a *jelenlegi*
állapotot írja le, ez a napló a hozzá vezető utat. Új munkamenet a lista
tetejére ír.

## 2. munkamenet — 2026. 08. 09. (Vercel-ellenőrzés + nyitott ügyek)

Session: `session_018KwqZsjibw6ouYhyWMp3Cs` („Számla- és előfizetés-kezelő
webalkalmazás 2.")

### Mi történt, időrendben

1. **Vercel-connector ellenőrzés.** A connector működött; a build-logból
   megerősítést nyert az 1. munkamenet gyanúja: a demó projekt (`szamla-kezelo`)
   production ága `main` volt, ezért minden production buildje elhasalt
   (`P1012: DIRECT_DATABASE_URL`), és a `szamla-kezelo.vercel.app` egy régi
   buildön ragadt. Mellékleletek: mindkét projekten SSO-védettek a preview
   URL-ek; a `szamla-kezelo-2026` Preview környezetéből hiányzik a
   `DIRECT_DATABASE_URL`.
2. **Négy nyitott ügy lezárva kódból** (commit `dbc0576`): biztonsági
   HTTP-fejlécek; audit `ipAddress` mind a 16 hívási ponton; `/setup`
   versenyhelyzet (tranzakció + `SetupGuard` zár + opcionális `SETUP_TOKEN`);
   adatbázis-alapú, elosztott bejelentkezési sebességkorlát (`LoginAttempt`
   tábla, cron-takarítással). Mindegyik végponttól végpontig tesztelve helyi
   SQLite-on + böngészőben (részletek az `ALLAPOT.md` „Lezárt ügyek" alatt).
3. **Merge a `main`-be** és éles deploy — az éles oldalon igazolva a fejlécek
   és a `/login`-átirányítás. A `prisma db push` létrehozta a `SetupGuard` és
   `LoginAttempt` táblát az éles Neonban.
4. **A demó production ága javítva** (felületen, Environments → Production →
   Branch Tracking = `vercel-demo`), majd a `main` átvezetve a demó ágra
   (a `next.config.ts` ütközését a demó-blokkok ÉS a fejléc-blokk megtartásával
   oldottuk fel). A push `target: production` deployt adott — ez igazolta a
   beállítást. A demó azóta a friss kódot adja.
5. **Keresztbuildek kizárva mindkét irányban** (`0f87a1b`, `f2d9db5`):
   `vercel.json` → `ignoreCommand` → `scripts/vercel-ignore-build.sh`. Hét
   ág+projekt kombinációra tesztelve; a Vercelen a kihagyás `CANCELED`-ként
   látszik, és mindkét kereszt-eset így viselkedik éles pushnál is.
6. **`EMAIL_FROM` javítva** (felületen, `szamlakezelo@aidomain.hu`) + redeploy.
   A runtime-logok a régi hibát dokumentálják (Resend 422, a webcím volt a
   feladó); az új érték tényleges küldése még nincs igazolva — lásd az
   `ALLAPOT.md` nyitott ügyeit.
7. **Takarítás + állapotmentés**: a `claude/nyitott-ugyek` ág törölve (a
   GitHubon kézzel — a session git-proxyja a ref-törlést nem engedte), az
   `ALLAPOT.md` teljesen újraírva a végállapotra.

### Döntések és indokaik

- **CSP `'unsafe-inline'`-nal indul**: a Next.js RSC-adatfolyam inline
  scriptje és az inline `style` attribútumok miatt; nonce-alapú szigorítás
  későbbre. A HSTS csak élesben megy ki, `preload` nélkül.
- **A sebességkorlát adatbázis-hibánál „nyitva hagy"**: egy DB-kiesés ne
  zárjon ki minden felhasználót; a korlát célja a próbálkozás drágítása.
- **Az ignore-szkript alapértelmezése az „építs"**, és csak nevesített
  kombinációra hagy ki: hiányzó env-változó ne tudjon éles buildet elnyomni.
- **Az `ALLAPOT.md` nem rögzít commit-SHA-t**: a saját frissítése is commit,
  tehát a beírt érték azonnal elavulna — az ágfejre hivatkozunk.

### Tanulságok (hibákból)

- A preview URL 302-je (SSO-átirányítás) nem jelenti a build sikerét — a
  deploy állapotát mindig az API-ból kell nézni, ne HTTP-szondából.
- A demó `src/lib/prisma.ts` csak `process.env.VERCEL` esetén állítja be a
  `DATABASE_URL`-t — helyi próbája ezért `VERCEL=1 npm start`.
- A `*.vercel.app` domainen a Vercel saját HSTS-t ad (`max-age=63072000; preload`)
  — ennek jelenléte nem bizonyítja a saját fejléceink élesedését; a CSP a jó jel.

## 1. munkamenet — 2026. 08. 08–09. (építkezés)

Session: `session_0163WoBLJvuoYP51BgmDvNx2` („…webalkalmazás 1.")

Ez a munkamenet építette fel az alkalmazást a specifikációból az A/B/D
csomagokon, az élesítési csomagon, az MNB/ECB árfolyam-bekötésen, a
biztonsági és teljesítmény-javításokon át a két környezet (éles + demó)
felállításáig. Lezárásként létrehozta az `ALLAPOT.md`-t (`f2fef75`) — a
részletes történet a `git log`-ban (2026-08-08 20:50 – 08-09 19:23), az
eredmény-állapot az `ALLAPOT.md` korábbi verziójában.
