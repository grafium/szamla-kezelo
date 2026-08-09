# Állapot és folytatási útmutató

Ez a dokumentum a projekt aktuális állapotát rögzíti, hogy egy új munkamenet
azonnal folytatni tudja. Utolsó frissítés: 2026. 08. 09. (2. munkamenet)

## Környezetek

| | Éles | Nyilvános demó |
|---|---|---|
| URL | https://szamla-kezelo-2026.vercel.app | https://szamla-kezelo.vercel.app |
| Vercel projekt | `szamla-kezelo-2026` | `szamla-kezelo` |
| Git ág | `main` | `vercel-demo` |
| Adatbázis | Neon Postgres (`neon-amber-envelope`) | build közben generált SQLite, a lambda `/tmp`-jébe másolva |
| Bejelentkezés | kötelező | kikapcsolva (`DEMO_MODE=1`) |
| Adatok | valós, tartós | demó adatok, példány újraindulásakor visszaáll |

A két ág **ugyanaz a kód**, a demó öt fájlban tér el (adatbázis-provider,
`next.config.ts`, `src/lib/prisma.ts`, `package.json` build-parancs, `src/auth.ts`).
Fejlesztés mindig a `main`-en; utána `git checkout vercel-demo && git merge origin/main`.

> A demóba átvezetésnél a `next.config.ts` ütközni fog: a demó-ág `env: { DEMO_MODE }`
> és `outputFileTracingIncludes` blokkjait **és** a `main` biztonsági fejléc-blokkját
> is meg kell tartani.

## Környezeti változók (Vercel → Settings → Environment Variables)

Élesben szükséges: `DATABASE_URL` (pooled Neon), `DIRECT_DATABASE_URL` (direct Neon),
`AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `CRON_SECRET`.
E-mailhez: `RESEND_API_KEY`, `EMAIL_FROM` (hitelesített domainről, pl. `…@aidomain.hu`),
`APP_URL`.
Ajánlott: `SETUP_TOKEN` — ha be van állítva, a `/setup` varázsló csak ezzel a
kulccsal telepít, és a felület „Telepítési kulcs" mezőt kér.
A demóban egyik sem kell (`DEMO_MODE` és `SEED_DEMO` a kódba/branchbe van égetve).

> A titkok kizárólag a Vercel felületén élnek, a repóban nincsenek — a
> `.env.example` csak a változónevek listája.

## Nyitott ügyek

1. **A demó projekt production buildje hibára fut — megerősítve a build-logból.**
   A `szamla-kezelo` projekt Production Branch-e a `main`, ezért a production
   build Postgres-t vár, a demónak viszont nincs adatbázisa:
   `P1012: Environment variable not found: DIRECT_DATABASE_URL`. A `vercel-demo`
   ág buildjei rendben lefutnak, de csak *preview*-ként, így nem veszik át a
   production aliast — a `szamla-kezelo.vercel.app` ezért egy régebbi, működő
   deployon áll. **Teendő (Vercel felület, kódból nem állítható):**
   `szamla-kezelo` → Settings → Git → Production Branch = `vercel-demo`, majd
   Redeploy. Azonnali kerülőút: a legutóbbi `READY` `vercel-demo` preview
   deploy „Promote to Production". Amit ne: a Postgres-változók felvétele a
   demóba — annak nincs adatbázisa.
2. **E-mail: az `EMAIL_FROM` értéke hibás** volt legutóbb (a webcím került bele),
   ezért a Resend 422-vel utasította el. Helyes érték: `szamlakezelo@aidomain.hu`
   (ez a domain hitelesített, próbaküldés `delivered` státusszal átment).
   Ellenőrzés redeploy után: `GET /api/cron/reminders?token=<CRON_SECRET>&digest=daily`
   → `emailsSent: 1` és üres `emailErrors`.
3. **A `szamla-kezelo-2026` projektben a Preview környezetnek nincs
   adatbázis-változója.** A `DATABASE_URL` és a `DIRECT_DATABASE_URL` csak a
   Production környezetre van beállítva, ezért *minden* nem-`main` ág preview
   buildje elhasal a séma-validációnál (`P1012: … DIRECT_DATABASE_URL`), a
   kódtól függetlenül — a `vercel-demo` ág buildjei csak azért futnak le, mert
   ott a séma SQLite-ra van állítva. Teendő, ha kell működő preview: a két
   változó felvétele a Preview környezetbe is (ideálisan külön Neon-ágra, hogy
   a preview `prisma db push` ne az éles adatbázist érje).
4. **Preview-linkek Vercel-belépés mögött.** Mindkét projekten
   `ssoProtection: all_except_custom_domains`, ezért a `…git-vercel-demo…`
   típusú preview URL-ek kívülről nem oszthatók meg; publikusan csak a
   production alias érhető el.

## Lezárt ügyek (2. munkamenet)

- **Biztonsági HTTP-fejlécek** — `next.config.ts`: CSP, `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy`, `Permissions-Policy`, és élesben HSTS. A CSP-ben
  egyelőre kell a script/style `'unsafe-inline'` (a Next.js RSC-adatfolyam inline
  script-je és az inline `style` attribútumok miatt); nonce-alapú CSP-vel
  szigorítható. Böngészőben ellenőrizve: a `/login` és `/setup` CSP-sértés nélkül
  működik.
- **Auditnapló `ipAddress`** — `src/lib/audit.ts` (`clientIp`), mind a 16
  `auditLog.create` hívás kitölti. A fejléc a proxyn kívülről hamisítható, ezért
  nyomkövetésre jó, döntést ne alapozzunk rá.
- **`/setup` versenyhelyzet** — a telepítés egyetlen tranzakcióban fut, és fix
  azonosítóval létrehoz egy `SetupGuard` sort, így két egyidejű kérés közül a
  második egyedi-kulcs hibára fut (ellenőrizve: 2 párhuzamos kérésből 1 db 201,
  1 db 403, és pontosan egy szervezet jött létre). A varázsló ablaka a
  `SETUP_TOKEN` változóval teljesen bezárható.
- **Elosztott sebességkorlát** — a számláló a `LoginAttempt` táblában él a
  memóriabeli Map helyett, atomi `increment`-tel; 8 sikertelen próbálkozás után
  15 percre zárol (böngészős teszt: a zárolás alatt a helyes jelszó is elutasul).
  Adatbázis-hiba esetén „nyitva hagy", hogy egy DB-kiesés ne zárjon ki mindenkit.
  A lejárt sorokat a napi cron takarítja (`attemptsPurged` a válaszban).

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

## Teljesítmény — mért állapot

10 120 számlán (medián válaszidő): Számlák 82 ms, párosítatlan szűrő 103 ms,
Partnerek 51 ms, Áttekintés 111 ms, Riportok 341 ms.
A listák adatbázis-szinten lapoznak és összegeznek; a számított mezők SQL-re
képződnek (`FieldDef.toWhere`). Ahol egy operátor nem képezhető le, a lista
2000 sornál megáll, és ezt a felület jelzi.
