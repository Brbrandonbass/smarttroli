// scripts/monitor.js
// Checks Zambian store specials URLs and logs results to monitor_log

import { monitorAndFetch } from "./agent-pipeline.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

async function main() {
  console.log("SmartTroli — Catalogue Monitor");
  console.log("================================");
  console.log(`Started: ${new Date().toISOString()}\n`);

  const results = await monitorAndFetch();

  console.log("\n================================");
  console.log("MONITOR SUMMARY");
  console.log("================================");
  for (const r of results) {
    const icon = r.result === "new_catalogue" ? "📥" : r.result === "skipped" ? "⏭️" : r.result === "error" ? "❌" : "✅";
    console.log(`${icon} ${r.store}: ${r.result}`);
    if (r.detail) console.log(`   ${r.detail.slice(0, 200)}`);
  }

  console.log(`\nFinished: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
