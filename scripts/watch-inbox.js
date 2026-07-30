// scripts/watch-inbox.js
// Continuously watches catalogues/inbox/ and runs scripts/catalogue-inbox.js's
// processInbox() whenever a PDF is dropped in there. Leave this running in a
// terminal while you work:
//
//   node scripts/watch-inbox.js
//
// Workflow: download any store catalogue PDF, drop it into catalogues/inbox/
// (no need to rename it first) — it gets identified, renamed, moved into
// catalogues/zambia/, and pushed to GitHub automatically.

import { watch, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { processInbox } from "./catalogue-inbox.js";

const INBOX_DIR = join(process.cwd(), "catalogues", "inbox");
const DEBOUNCE_MS = 2500;

if (!existsSync(INBOX_DIR)) mkdirSync(INBOX_DIR, { recursive: true });

let debounceTimer = null;
let running = false;
let rerunPending = false;

// fs.watch fires multiple events while a file is still being copied, and
// dropping several files at once fires one event each — debounce them into
// a single processInbox() pass, and if a new event arrives mid-run, queue
// exactly one more pass rather than piling up concurrent runs.
async function runOnce() {
  if (running) {
    rerunPending = true;
    return;
  }
  running = true;
  try {
    await processInbox();
  } catch (err) {
    console.error("Inbox processing failed:", err.message);
  } finally {
    running = false;
    if (rerunPending) {
      rerunPending = false;
      runOnce();
    }
  }
}

function scheduleRun() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runOnce, DEBOUNCE_MS);
}

console.log("👀 SmartTroli catalogue inbox watcher");
console.log(`   Watching: ${INBOX_DIR}`);
console.log("   Drop any store catalogue PDF in there — it'll be identified, renamed,");
console.log("   moved to catalogues/zambia/, and pushed to GitHub automatically.");
console.log("   (Press Ctrl+C to stop.)\n");

scheduleRun(); // catch anything already sitting in the inbox on startup

const watcher = watch(INBOX_DIR, (_eventType, filename) => {
  if (filename && !filename.toLowerCase().endsWith(".pdf")) return;
  scheduleRun();
});

process.on("SIGINT", () => {
  console.log("\nStopping inbox watcher.");
  watcher.close();
  process.exit(0);
});
