#!/usr/bin/env bash
# Vercel „Ignored Build Step" — a vercel.json ignoreCommand hívja.
#
# Kilépési kód: 0 = a buildet KIHAGYJUK, 1 = a build FUSSON.
#
# Ez a repó két Vercel-projektet szolgál ki, más adatbázis-provideren:
#   szamla-kezelo-2026 (éles) ← main,        Postgres
#   szamla-kezelo      (demó) ← vercel-demo, build közben generált SQLite
# Mivel mindkét projekt ugyanahhoz a repóhoz kapcsolódik, mindkettő minden ágra
# indít buildet — a keresztkombinációk viszont sosem működhetnek. Ezeket
# hagyjuk ki, hogy ne fogyasszanak buildet és ne szennyezzék a hibastatisztikát.
#
# Az alapértelmezés mindig az ÉPÍTS: csak nevesített, biztosan hibás
# kombinációra lépünk ki 0-val, így egy hiányzó változó nem tud éles buildet
# elnyomni.

set -u

ELES_PROJEKT="prj_eUaP5xYBqRzUEGSyOg3ZOtjFrAGA" # szamla-kezelo-2026
DEMO_PROJEKT="prj_F9YBihQIYxn35DUupq3SyPJ8aMF0" # szamla-kezelo
ag="${VERCEL_GIT_COMMIT_REF:-}"
projekt="${VERCEL_PROJECT_ID:-}"

if [ -z "$ag" ] || [ -z "$projekt" ]; then
  echo "Ismeretlen ág vagy projekt (ág='$ag', projekt='$projekt') — a build fut."
  exit 1
fi

# A demó ág sémája SQLite, az éles projekt DATABASE_URL-je Postgres: a build
# lefut, de futásidőben minden oldal hibára fut. Ezért itt nem építünk.
if [ "$ag" = "vercel-demo" ] && [ "$projekt" = "$ELES_PROJEKT" ]; then
  echo "A vercel-demo ág az éles projektben nem épül (SQLite séma vs. Postgres URL)."
  exit 0
fi

# A main ág sémája Postgres, a demó projektben viszont nincs adatbázis-változó:
# a build a séma-validációnál hasal el (P1012: DIRECT_DATABASE_URL). Ezt sem
# építjük, hogy ne termelődjön hibás deploy minden main pushnál.
if [ "$ag" = "main" ] && [ "$projekt" = "$DEMO_PROJEKT" ]; then
  echo "A main ág a demó projektben nem épül (Postgres séma, nincs adatbázis-változó)."
  exit 0
fi

echo "Build engedélyezve (ág='$ag')."
exit 1
