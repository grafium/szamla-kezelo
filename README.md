# Számlakezelő — számla- és előfizetés-kezelő webalkalmazás

Teljes körű pénzügyi nyilvántartó kisvállalkozásoknak: beérkező számlák, banki
kivonatok, egyszeri vásárlások és ismétlődő előfizetések kezelése három
devizában (HUF / EUR / USD), Notion-stílusú felülettel, teljes egészében magyarul.

## Élesítés

Az éles telepítés üres adatbázissal indul (demó adat nem kerül bele), és az
első megnyitáskor a `/setup` varázsló hozza létre a szervezetet és az admin
fiókot. A napi cronok a `vercel.json`-ból jönnek.

1. **Adatbázis:** hozz létre egy ingyenes Postgres-t a [neon.tech](https://neon.tech)-en
   (vagy a Vercel Storage → Neon integrációval). Két kapcsolati stringre lesz
   szükség: a *pooled* és a *direct* URL-re.
2. **Vercel:** [vercel.com/new](https://vercel.com/new) → importáld a
   `grafium/szamla-kezelo` repó **main** ágát.
3. **Környezeti változók** a projekt beállításainál:
   - `DATABASE_URL` — a pooled Neon URL
   - `DIRECT_DATABASE_URL` — a direct (nem poolozott) Neon URL
     (a Vercel–Neon integráció `DATABASE_URL_UNPOOLED` néven adja)
   - `AUTH_SECRET` — pl. `openssl rand -base64 32`
   - `AUTH_TRUST_HOST` — `true`
   - `CRON_SECRET` — tetszőleges titok; a Vercel Cron ezzel hívja a
     `/api/cron/*` végpontokat (`Authorization: Bearer …`)
   - opcionális: `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` — e-mail értesítésekhez
4. **Első deploy** — a build lefuttatja: `prisma db push` → `next build`
   (a seed demó adat nélkül, üresen hagyja az adatbázist).
5. **Első megnyitás** — az app a `/setup` varázslóra irányít: add meg a
   cégnevet, az alapdevizát és az admin fiókot, majd jelentkezz be.

A `DEMO_MODE` és a `SEED_DEMO` kapcsolók kizárólag a demóhoz/fejlesztéshez
valók — élesben ne állítsd be őket.

## Gyors indítás lokálisan

```bash
npm install
cp .env.example .env         # írd be a saját Neon (vagy helyi Postgres) URL-jeidet
npm run db:push              # séma létrehozása
SEED_DEMO=1 npm run db:seed  # demó adatok betöltése (nélküle üres marad)
npm run dev                  # http://localhost:3000
```

Demó belépés (seedelt adatbázisnál): `demo@grafium.hu` / `demo1234`.
Bejelentkezés nélküli fejlesztéshez tedd a `.env`-be: `DEMO_MODE="1"` —
ilyenkor session hiányában az első (demó) felhasználóval fut az app.

Ha nincs kéznél Postgres, SQLite-tal is futtatható: a `prisma/schema.prisma`-ban
állítsd a providert `"sqlite"`-ra, töröld a `directUrl` sort, és a `.env`-ben
legyen `DATABASE_URL="file:./dev.db"`.

Cron endpointok kézzel (token: `CRON_SECRET` a `.env`-ből):

```bash
curl "http://localhost:3000/api/cron/reminders?token=cron-titok"  # előfordulás-generálás + emlékeztetők
curl "http://localhost:3000/api/cron/rates?token=cron-titok"      # árfolyam-frissítés
```

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 (design
tokenek) · Prisma + SQLite (fejlesztés) / Postgres (éles) · NextAuth (Auth.js v5,
e-mail + jelszó) · Recharts · date-fns · Zod

## Ami elkészült

- **Design rendszer** — a specifikáció szerinti Notion-paletta CSS-tokenekkel,
  világos + sötét mód (rendszer-preferencia + kézi kapcsoló), Inter tipográfia,
  tabular-nums összegek, 240px összecsukható oldalsáv, mobil alsó navigáció,
  skeleton betöltés, reszponzív táblázat→kártya átalakulás.
- **Adatmodell** — a teljes specifikált séma (Organization, User, Partner +
  aliasok, Invoice + tételsorok, Subscription + előfordulások, Purchase,
  BankAccount/Statement/Transaction, Payment, Category-fa, ExchangeRate,
  Attachment, Reminder, SavedFilter, MatchingRule, AuditLog), UUID kulcsok,
  soft delete, organizationId minden táblán.
- **Szűrőmotor** (az app gerince) — általános, entitás-független: mező ·
  operátor · érték feltételek, szöveg/szám/összeg/dátum (relatív dátumokkal:
  ma, ezen a héten, következő N napban, pénzügyi év…), választék/címke/logikai
  operátorok; számított mezők (havi ekvivalens, hátralévő napok, árváltozás,
  nyitott tartozás) JS-oldali kiértékeléssel; állapot az URL-ben (megosztható,
  vissza gomb működik); gyorsszűrő chipek + mentett, oldalsávra tűzhető nézetek.
- **Képernyők** — Áttekintés (KPI-k, 30 napos idővonal, 12 havi halmozott
  oszlopdiagram, előfizetés-donut + top 5, deviza-kitettség, teendők),
  Számlák (szűrés, rendezés, lapozás, devizánkénti futó összesítés,
  részletpanel státuszváltással), Előfizetések (tábla + havi naptárnézet +
  következő 90 nap futó összeggel, havi-ekvivalens kapcsoló, áremelés-jelzés),
  Egyszeri vásárlások (garanciafigyeléssel), Banki kivonatok (párosítási
  aránnyal) + kivonat-részletek pontozott párosítási javaslatokkal és egy
  kattintásos megerősítéssel, Partnerek (számított oszlopok: nyitott tartozás,
  idei költés, aktív előfizetések) + partneroldal fülekkel, Kifizetések,
  Riportok (kategória, Pareto, ÁFA-összesítő, cash-flow előrejelzés,
  devizanyereség/-veszteség), Beérkező (OCR-mezők megbízhatósági kiemeléssel),
  Emlékeztetők (Ma / Ezen a héten / Később, halasztás + kifizetettnek jelölés),
  Beállítások.
- **Üzleti logika** — előfordulás-generátor 12 hónapra előre; emlékeztető-motor
  a 9. fejezet szabályaival (14/3/1, évesnél 30/14/3, lemondási határidő,
  próbaidőszak, számla-határidők, garancia); súlyozott banki párosítás
  (összeg 0,4 + dátum 0,2 + számlaszám a közleményben 0,3 + partner/alias 0,2;
  ≥0,85 automatikus, 0,5–0,85 javaslat); árfolyamrögzítés a tranzakció napjára,
  ROUND_HALF_UP kerekítés, minden összeg integer minor unitban; vegyes devizás
  listákban devizánkénti részösszeg + átszámított összesítés.
- **Magyar sajátosságok** — adószám-validáció (12345678-1-42), EU adószám,
  teljes ÁFA-kulcs készlet (27/18/5/0/AAM/TAM/FAD/EU/EUE/HO), kelt +
  teljesítés külön, NAV Online Számla interfész-vázlat (`src/services/nav/`),
  bank CSV-sablonok (OTP, K&H, Erste, Raiffeisen, UniCredit, Wise, Revolut).
- **⌘K parancspaletta** — globális kereső (partner, számlaszám, közlemény,
  OCR-szöveg) + navigáció és gyorsműveletek.
- **Demó adatok** — 25 partner, 19 előfizetés, 120 számla, 30 vásárlás,
  3 kivonat ~180 tétellel (~70% auto-párosítva), árfolyamsor, emlékeztetők.

## Ami vázként/stubként készült (következő körök)

- OCR / dokumentum-kinyerés: a Beérkező a seedelt OCR-mezőket mutatja; valós
  kinyeréshez OCR-szolgáltatás bekötése szükséges.
- Fájlfeltöltés: a drag & drop zóna és az S3-tárolás bekötése.
- Banki import varázsló (CSV oszlop-hozzárendelés UI, MT940/CAMT.053 parser) —
  a sablonok és az adatmodell készen állnak.
- E-mail küldés (napi összefoglaló, heti előretekintés) — az emlékeztető-motor
  legenerálja a tételeket, SMTP/Resend bekötése szükséges.
- Számla/előfizetés létrehozó űrlapok (Zod-sémák készen a `src/lib/validation.ts`-ben).
- CSV/XLSX export, inline cellaszerkesztés, csoportosítás, sűrűség-kapcsoló.
- Éles adatbázis: a sémában az enum-jellegű mezők SQLite-kompatibilitás miatt
  String-ként vannak — Postgres-re váltásnál natív enumokra és tömbökre cserélhetők.

## Szerkezet

```
prisma/schema.prisma      adatmodell + seed
src/lib/filters/          szűrőmotor (típusok, definíciók, Prisma-fordító, URL)
src/lib/                  pénz/deviza, árfolyam, párosítás, előfordulások, emlékeztetők
src/services/nav/         NAV Online Számla interfész-vázlat (mock)
src/services/bank-import/ bank CSV-sablonok
src/app/(app)/            képernyők (magyar útvonalakkal)
src/app/api/              REST + cron endpointok
src/components/           oldalsáv, fejléc, szűrősáv, diagramok, UI-elemek
```
