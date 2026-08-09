# Állapot és folytatási útmutató

Ez a dokumentum a projekt aktuális állapotát rögzíti, hogy egy új munkamenet
azonnal folytatni tudja. Utolsó frissítés: 2026. 08. 09.

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

## Környezeti változók (Vercel → Settings → Environment Variables)

Élesben szükséges: `DATABASE_URL` (pooled Neon), `DIRECT_DATABASE_URL` (direct Neon),
`AUTH_SECRET`, `AUTH_TRUST_HOST=true`, `CRON_SECRET`.
E-mailhez: `RESEND_API_KEY`, `EMAIL_FROM` (hitelesített domainről, pl. `…@aidomain.hu`),
`APP_URL`.
A demóban egyik sem kell (`DEMO_MODE` és `SEED_DEMO` a kódba/branchbe van égetve).

> A titkok kizárólag a Vercel felületén élnek, a repóban nincsenek — a
> `.env.example` csak a változónevek listája.

## Nyitott ügyek

1. **A demó projekt legutóbbi deployja hibára futott.** A kód nem hibás: a
   `vercel-demo` ág teljes build-folyamata helyben végigfut. A legvalószínűbb ok,
   hogy a `szamla-kezelo` projekt a `main` ágból épült (az Postgres-t vár, a demónak
   nincs adatbázisa) — a tünet ilyenkor `P1012: Environment variable not found:
   DIRECT_DATABASE_URL`. Teendő: Vercel → `szamla-kezelo` → Settings → Git →
   Production Branch legyen `vercel-demo` (vagy Disconnect). Megerősítéshez a
   build-log kell.
2. **E-mail: az `EMAIL_FROM` értéke hibás** volt legutóbb (a webcím került bele),
   ezért a Resend 422-vel utasította el. Helyes érték: `szamlakezelo@aidomain.hu`
   (ez a domain hitelesített, próbaküldés `delivered` státusszal átment).
   Ellenőrzés redeploy után: `GET /api/cron/reminders?token=<CRON_SECRET>&digest=daily`
   → `emailsSent: 1` és üres `emailErrors`.
3. **A `/setup` varázslónál elvi versenyhelyzet** van (két egyidejű kérés
   átcsúszhat az „üres-e a rendszer" ellenőrzésen). Friss telepítésnél a varázsló
   addig nyitva áll, amíg ki nem töltik. Lezárható egy `SETUP_TOKEN` változóval.
4. **A sebességkorlát példányonkénti** (serverless), nem globális — elosztott
   védelemhez Redis vagy adatbázis-alapú számláló kell.
5. **Nincsenek biztonsági HTTP-fejlécek** (CSP, X-Frame-Options, HSTS).
6. **Az auditnapló nem tölti ki az `ipAddress` mezőt.**

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
