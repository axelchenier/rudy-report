// sql.js - an optional SQL "power mode" using DuckDB-WASM (a full database that runs inside the browser).
// It is only downloaded (from the jsDelivr CDN, ~10 MB) the first time someone opens the SQL panel.
import { load, SEASONS } from "../data.js";

let dbPromise = null;

async function startDuckDB() {
  const duckdb = await import("https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm");
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  // Browsers only allow "workers" from the same website, so we wrap the CDN worker in a tiny local one.
  const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), new Worker(workerUrl));
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  const conn = await db.connect();
  // Load every season of players, teams and BBRef stats into three tables.
  for (const [table, kind] of [["players", "players"], ["teams", "teams"], ["bbref", "bbref_advanced"], ["player_totals", "players_totals"]]) {
    const rows = (await Promise.all(SEASONS().map((s) => load(kind, s).catch(() => [])))).flat();
    await db.registerFileText(`${table}.json`, JSON.stringify(rows));
    await conn.insertJSONFromPath(`${table}.json`, { name: table });
  }
  return conn;
}

export async function runSQL(sql) {
  dbPromise ||= startDuckDB();
  const conn = await dbPromise;
  const result = await conn.query(sql);
  return result.toArray().map((row) => {
    const o = row.toJSON();
    for (const k in o) if (typeof o[k] === "bigint") o[k] = Number(o[k]);   // DuckDB returns big whole numbers as BigInt
    return o;
  });
}
