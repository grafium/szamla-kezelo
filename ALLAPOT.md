# Állapot és folytatási útmutató

Ez a dokumentum a projekt aktuális állapotát rögzíti, hogy egy új munkamenet
azonnal folytatni tudja. Utolsó frissítés: 2026. 08. 09. (2. munkamenet vége).

## Hol tartunk

| | Éles | Nyilvános demó |
|---|---|---|
| URL | https://szamla-kezelo-2026.vercel.app | https://szamla-kezelo.vercel.app |
| Vercel projekt | `szamla-kezelo-2026` | `szamla-kezelo` |
| Git ág (production branch) | `main` | `vercel-demo` |
| Utolsó élesített commit | `f2d9db5` | `05e060d` |
| Utolsó production deploy | `dpl_5RQ5jzEfwPASNoQZk3TqbJ7VBB6S` | `dpl_WV7MqfrJXhfHycUXAcV6Fak18W8X` |
| Adatbázis | Neon Postgres (`neon-amber-envelope`) | build közben generált SQLite, a lambda `/tmp`-jébe másolva |
| Bejelentkezés | kötelező (`/` → `/login`) | kikapcsolva (`DEMO_MODE=1`) |
| Adatok | valós, tartós | demó adatok, példány újraindulásakor visszaáll |

Mindkét környezet `READY`, és mindkettő a friss kódot szolgálja ki. A gyors
ellenőrzés két jele:

```bash
curl -sI https://szamla-kezelo.vercel.app | grep -i content-security-policy  # van fejléc = friss kód
curl -s -o /dev/null -w '%{http_code}\n' https://szamla-kezelo.vercel.app/api/rates/refresh  # 405 = friss, 404 = régi
```

## Ágak és deploy-szabályok

A két ág **ugyanaz a kód**, a demó öt fájlban tér el (adatbázis-provider,
`next.config.ts`, `src/lib/prisma.ts`, `package.json` build-parancs, `src/auth.ts`).
Fejlesztés mindig a `main`-en; utána `git checkout vercel-demo && git merge main`.

> A demóba átvezetésnél a `next.config.ts` ütközni fog: a demó-ág `env: { DEMO_MODE }`
> és `outputFileTracingIncludes` blokkjait **és** a `main` biztonsági fejléc-blokkját
> is meg kell tartani.

Mindkét Vercel-projekt ugyanahhoz a repóhoz kapcsolódik, ezért minden ágra
mindkettő indítana buildet. A keresztkombinációkat a `vercel.json`
`ignoreCommand`-ja szűri (`scripts/vercel-ignore-build.sh`) — mindkét irányban:

- a `vercel-demo` ág az **éles** projektben nem épül (a séma SQLite, a
  `DATABASE_URL` viszont Postgres: a build lefutna, de futásidőben minden oldal
  hibára fut);
- a `main` ág a **demó** projektben nem épül (Postgres séma, de ott nincs
  `DIRECT_DATABASE_URL`: `P1012`).

A szkript alapértelmezése az „építs" (1-es kilépés), és csak e két nevesített
kombinációra lép ki 0-val, így hiányzó `VERCEL_PROJECT_ID` /
`VERCEL_GIT_COMMIT_REF` nem tud éles buildet elnyomni. Bármely más ág mindkét
projektben épül. A kihagyás a Vercelen `CANCELED` állapotú deployként látszik —
ez a működés jele, nem hiba.

A production ág a Vercel új felületén: **Project Settings → Environments →
Production → Branch Tracking** (a régi „Git → Production Branch" helyén).

## Környezeti változók (Vercel → Settings → Environment Variables)

Élesben szükséges: `DATABASE_URL` (pooled Neon), `DIRECT_DATABASE_URL` (direct Neon),
`AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `CRON_SECRET`.
E-mailhez: `RESEND_API_KEY`, `EMAIL_FROM` (hitelesített domainről:
`szamlakezelo@aidomain.hu`), `APP_URL`.
Ajánlott: `SETUP_TOKEN` — ha be van állítva, a `/setup` varázsló csak ezzel a
kulccsal telepít, és a felület „Telepítési kulcs" mezőt kér.
A demóban egyik sem kell (`DEMO_MODE` és `SEED_DEMO` a kódba/branchbe van égetve).

> A titkok kizárólag a Vercel felületén élnek, a repóban nincsenek — a
> `.env.example` csak a változónevek listája.
> Környezeti változó megváltoztatása **csak redeploy után** érvényes a futó
> példányban.

## Nyitott ügyek

1. **Az e-mail küldés működése nincs igazolva.** Az `EMAIL_FROM` a helyes
   értékre (`szamlakezelo@aidomain.hu`) állítva, és a redeploy megtörtént, tehát
   a futó példány már ezt látja. A tényleges küldés viszont csak a cron
   meghívásával derül ki, ahhoz pedig `CRON_SECRET` kell:
   `GET /api/cron/reminders?token=<CRON_SECRET>&digest=daily` → `emailsSent: 1`
   és üres `emailErrors` a jó válasz. Kézzel a Vercel **Cron Jobs** fülén is
   futtatható; a napi cron egyébként 06:00 UTC-kor magától lefut.
   Előzmény a runtime-logokból: a Resend kétszer `422 Invalid \`from\` field`-del
   utasította el, mert az `EMAIL_FROM` értéke a webcím volt
   (`"https://szamla-kezelo-2026.vercel.app"`).
2. **A `szamla-kezelo-2026` Preview környezetéből hiányzik a
   `DIRECT_DATABASE_URL`.** A `DATABASE_URL` be van állítva (Postgres), a direct
   nincs, ezért minden feature-ág preview buildje elhasal a séma-validációnál
   (`P1012`), a kódtól függetlenül. Teendő, ha kell működő preview: a direct URL
   felvétele a Preview környezetbe is — ideálisan külön Neon-ágra, hogy a preview
   `prisma db push` ne az éles adatbázist érje.
3. **Preview-linkek Vercel-belépés mögött.** Mindkét projekten
   `ssoProtection: all_except_custom_domains`, ezért a `…-git-<ág>-…` preview
   URL-ek kívülről nem oszthatók meg; publikusan csak a production alias érhető el.
4. **A `/setup` varázsló nyitva áll, amíg nincs `SETUP_TOKEN`.** Az éles rendszer
   már be van állítva (a `SetupGuard` sor és a szervezet létezik), tehát ez a
   jövőbeli telepítésekre óvintézkedés.

## Lezárt ügyek (2. munkamenet)

- **A demó production ága javítva.** A `szamla-kezelo` projekt Branch Trackingje
  `main`-ről `vercel-demo`-ra állt, ezért a demó minden buildje production
  targetet kap. Igazolás: a `vercel-demo` push `target: production`, `READY`
  (korábban `target: null`, azaz preview, és a production alias egy régi
  deployon állt).
- **Keresztbuildek kizárva** (`vercel.json` → `ignoreCommand` →
  `scripts/vercel-ignore-build.sh`), hét ág+projekt kombinációra tesztelve.
  Igazolás: a két kereszt-eset most `CANCELED`, a két helyes eset `READY`.
- **Biztonsági HTTP-fejlécek** — `next.config.ts`: CSP, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, és élesben HSTS
  (`max-age=31536000; includeSubDomains`). A CSP-ben egyelőre kell a script/style
  `'unsafe-inline'` (a Next.js RSC-adatfolyam inline script-je és az inline
  `style` attribútumok miatt); nonce-alapú CSP-vel szigorítható. Chromiumban
  ellenőrizve: a `/login` és `/setup` CSP-sértés nélkül renderel és interaktív.
- **Auditnapló `ipAddress`** — `src/lib/audit.ts` (`clientIp`) az
  `x-forwarded-for` lánc első eleméből, tartalék fejlécekkel; mind a 16
  `auditLog.create` hívás kitölti. A fejléc a proxyn kívülről hamisítható, ezért
  nyomkövetésre jó, döntést ne alapozzunk rá.
- **`/setup` versenyhelyzet** — a telepítés egyetlen tranzakcióban fut, és fix
  azonosítóval létrehoz egy `SetupGuard` sort, így két egyidejű kérés közül a
  második egyedi-kulcs hibára (P2002) fut. Igazolás: 2 párhuzamos kérésből 1 db
  201 + 1 db 403, és pontosan egy szervezet jött létre. Opcionális `SETUP_TOKEN`:
  kulcs nélkül/rossz kulccsal 403, helyessel 201; a kulcs értéke nem kerül a
  HTML-be.
- **Elosztott sebességkorlát** — a számláló a `LoginAttempt` táblában él a
  memóriabeli Map helyett, atomi `increment`-tel; 8 sikertelen próbálkozás után
  15 percre zárol. Igazolás böngészőből: a zárolás alatt a helyes jelszó is
  elutasul; 5 párhuzamos hibás próbálkozásnál a számláló pontosan 5. Adatbázis-
  hiba esetén „nyitva hagy", hogy egy DB-kiesés ne zárjon ki mindenkit. A lejárt
  sorokat a napi cron takarítja (`attemptsPurged` a válaszban).

Új táblák ebben a munkamenetben: `SetupGuard`, `LoginAttempt` (a `vercel-build`
`prisma db push`-a hozta létre az éles Neonban is).

## Amit a specifikációból nem építettünk meg

- OCR és valódi fájlfeltöltés (a Beérkező a seedelt OCR-mezőket mutatja;
  S3/tárolás és OCR-szolgáltatás bekötése hiányzik).
- MT940 / CAMT.053 / PDF banki import (a CSV-varázsló kész, a sablonok megvannak).
- CSV/XLSX export a listákból és a riportokból (az adatexport a Beállításokban kész).
- Inline cellaszerkesztés, oszlop-testreszabás, csoportosítás részösszegekkel.
- Szűrők ÉS/VAGY csoportosítása a felületen (a motor tudja, a UI lapos listát ad).
- NAV Online Számla valódi hívások (`src/services/nav/` interfész-váz, mock adattal).

## Fejlesztői parancsok

```bash
npm install
cp .env.example .env          # töltsd ki a saját adatbázis-URL-eddel
npm run db:push
SEED_DEMO=1 npm run db:seed   # demó adatok (nélküle üres marad)
npm run dev
```

SQLite-tal (gyors helyi teszt): a `prisma/schema.prisma`-ban a provider legyen
`sqlite`, a `directUrl` sor törölve, `DATABASE_URL="file:./dev.db"`, és a
`.env`-be `DEMO_MODE="1"` a bejelentkezés kihagyásához.
**Fontos:** ezt a séma-átállítást soha ne commitold a `main`-re.

A **demó ág** helyi próbája a Vercel-viselkedéssel egyezően:

```bash
npm run vercel-build          # prisma generate → db push → SEED_DEMO seed → next build
VERCEL=1 npm start            # a VERCEL változó nélkül nincs DATABASE_URL → 500
```

(`src/lib/prisma.ts` csak `process.env.VERCEL` esetén másolja a seedelt SQLite-ot
a `/tmp`-be és állítja be a `DATABASE_URL`-t.)

## Teljesítmény — mért állapot

10 120 számlán (medián válaszidő): Számlák 82 ms, párosítatlan szűrő 103 ms,
Partnerek 51 ms, Áttekintés 111 ms, Riportok 341 ms.
A listák adatbázis-szinten lapoznak és összegeznek; a számított mezők SQL-re
képződnek (`FieldDef.toWhere`). Ahol egy operátor nem képezhető le, a lista
2000 sornál megáll, és ezt a felület jelzi.
