// A Prisma szöveges szűrői (contains / startsWith / endsWith / equals) a
// Postgresen KIS-NAGYBETŰ-ÉRZÉKENYEK, SQLite-on viszont nem. Emiatt a fejlesztés
// alatt (SQLite) működő keresés élesben (Postgres) némán kevesebb találatot ad:
// az "adobe" nem találná meg az "Adobe Systems…" partnert.
//
// A `mode: "insensitive"` kapcsolót viszont csak a Postgres provider ismeri,
// SQLite alatt futásidejű hibát okoz — ezért provider-függően adjuk hozzá.
// Futásidőben értékeljük ki, mert a demó a DATABASE_URL-t indulás után állítja be.

export function isPostgres(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

/** Szórd be a szöveges Prisma-szűrő mellé: `{ contains: q, ...insensitive() }` */
export function insensitive(): { mode?: "insensitive" } {
  return isPostgres() ? { mode: "insensitive" } : {};
}
