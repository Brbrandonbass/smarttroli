// scripts/catalogue-inbox.js
// Drag-and-drop catalogue manager: processes any PDF sitting in
// catalogues/inbox/ (see scripts/watch-inbox.js for the continuous watcher)
// by, for each file:
//   1. Identifying the store from the filename, falling back to asking
//      Claude to read the store name + validity dates off the PDF's first
//      page (rasterized to a JPEG via poppler's pdftoppm) when the filename
//      alone isn't enough — e.g. an unrenamed download.
//   2. Renaming it to StoreName_StartDate_EndDate.pdf and moving it into
//      catalogues/zambia/.
//   3. Deleting any existing catalogue for that same store whose parsed end
//      date is earlier than the new one's. If an existing file's date can't
//      be confidently parsed, it's left alone rather than guessed-deleted —
//      e.g. a same-store "Birthday"/"Select" themed catalogue that's still
//      concurrently valid shouldn't be blown away just because it shares a
//      filename prefix.
//   4. git add/commit/push, which triggers process-pdfs.yml automatically
//      since it watches catalogues/zambia/**.pdf.
//
// The Claude-vision fallback requires poppler-utils (`pdftoppm`) on PATH —
// only needed when a file's store/dates can't be read from its filename.
// Install: `brew install poppler` (Mac), `choco install poppler` (Windows),
// `apt-get install poppler-utils` (Linux).
//
// Run once over whatever's currently in the inbox: node scripts/catalogue-inbox.js
// Run continuously:                                  node scripts/watch-inbox.js

import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { execSync } from "child_process";
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync,
  unlinkSync, renameSync, statSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { pathToFileURL } from "url";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ROOT = process.cwd();
const INBOX_DIR = join(ROOT, "catalogues", "inbox");
const ZAMBIA_DIR = join(ROOT, "catalogues", "zambia");

const MONTH_NAME = {
  jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun",
  jul: "Jul", aug: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec",
};
const MONTH_NUM = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// Canonical store name -> filename token, matching the existing
// catalogues/zambia/ naming convention (see catalogues/zambia/README.md).
const STORE_TOKENS = {
  "Shoprite": "Shoprite",
  "Choppies": "Choppies",
  "Game": "Game",
  "Spar": "Spar",
  "Pick n Pay": "PicknPay",
  "Jumbo": "Jumbo",
};
const KNOWN_STORES = Object.keys(STORE_TOKENS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Store + date detection from filename ────────────────────────────────────

export function detectStoreFromFilename(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes("shoprite")) return "Shoprite";
  if (lower.includes("choppies")) return "Choppies";
  if (lower.includes("picknpay") || lower.includes("pick-n-pay") || lower.includes("pick n pay") || lower.includes("pnp")) return "Pick n Pay";
  if (lower.includes("game")) return "Game";
  if (lower.includes("spar")) return "Spar";
  if (lower.includes("jumbo")) return "Jumbo";
  return null;
}

// Matches "1 May - 14 May 2026", "01-14 May 2026", etc. (underscores/hyphens
// in the filename are turned into spaces before this runs).
export function extractDateRangeFromText(text) {
  const pattern =
    /(\d{1,2})\s*(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)?\s*(?:-|to|–|—)\s*(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})?/i;
  const m = text.match(pattern);
  if (!m) return null;

  const [, d1, mon1Raw, d2, mon2Raw, yearRaw] = m;
  const mon2 = mon2Raw.toLowerCase().slice(0, 3);
  const mon1 = (mon1Raw || mon2Raw).toLowerCase().slice(0, 3);
  if (!MONTH_NUM[mon1] || !MONTH_NUM[mon2]) return null;

  const year = yearRaw || String(new Date().getFullYear());
  return {
    validFrom: `${year}-${MONTH_NUM[mon1]}-${d1.padStart(2, "0")}`,
    validUntil: `${year}-${MONTH_NUM[mon2]}-${d2.padStart(2, "0")}`,
  };
}

// Matches two DDMon(YYYY?) tokens with no explicit range separator, only
// whitespace — e.g. "25May 07Jun2026" — which is what
// catalogues/zambia/'s own StoreName_DDMon_DDMonYYYY.pdf convention becomes
// once underscores are turned into spaces (there's no "-"/"to" between the
// two dates themselves, just the underscore that separated the tokens).
export function extractSpacedDayMonthRange(text) {
  const pattern =
    /(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})?/i;
  const m = text.match(pattern);
  if (!m) return null;

  const [, d1, mon1Raw, d2, mon2Raw, yearRaw] = m;
  const mon1 = mon1Raw.toLowerCase().slice(0, 3);
  const mon2 = mon2Raw.toLowerCase().slice(0, 3);
  if (!MONTH_NUM[mon1] || !MONTH_NUM[mon2]) return null;

  const year = yearRaw || String(new Date().getFullYear());
  return {
    validFrom: `${year}-${MONTH_NUM[mon1]}-${d1.padStart(2, "0")}`,
    validUntil: `${year}-${MONTH_NUM[mon2]}-${d2.padStart(2, "0")}`,
  };
}

export function detectDatesFromFilename(filename) {
  const base = filename.replace(/\.pdf$/i, "");
  // Try explicit "-"/"to" separators on the original text first (hyphens
  // intact), then adjacent DDMon tokens once underscores/hyphens become
  // plain spaces.
  return (
    extractDateRangeFromText(base) ||
    extractSpacedDayMonthRange(base.replace(/[_-]/g, " "))
  );
}

// ── First-page rasterization + Claude fallback ──────────────────────────────

const IDENTIFY_PROMPT = (labelSubject) => `This is ${labelSubject} of a Zambian grocery store catalogue PDF. Identify:
1. Which store this is from — must be exactly one of: ${KNOWN_STORES.join(", ")} (use null if you can't tell)
2. What are the valid from and until dates for this catalogue?

Output ONLY this JSON: {"store": "Shoprite", "validFrom": "2026-07-20", "validUntil": "2026-08-09"}
Use null for any field you can't determine confidently. Dates must be in YYYY-MM-DD format.`;

async function askClaudeToIdentify(documentBlock, labelSubject) {
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 300,
    system: "You identify Zambian grocery store catalogues from their cover page. Output ONLY valid JSON. Plain ASCII only.",
    messages: [{
      role: "user",
      content: [documentBlock, { type: "text", text: IDENTIFY_PROMPT(labelSubject) }],
    }],
  });

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const fb = text.indexOf("{");
  if (fb === -1) return null;
  const lb = text.lastIndexOf("}");

  try {
    const parsed = JSON.parse(text.slice(fb, lb + 1));
    return {
      store: KNOWN_STORES.includes(parsed.store) ? parsed.store : null,
      validFrom: parsed.validFrom || null,
      validUntil: parsed.validUntil || null,
    };
  } catch {
    return null;
  }
}

// Rasterizes just the first page to a JPEG via poppler's pdftoppm. Passes
// `env: process.env` explicitly — execSync's child process doesn't always
// inherit a PATH that includes poppler otherwise (e.g. poppler installed via
// a package manager that only updated an interactive shell's profile rather
// than the system-wide PATH a plain `node script.js` invocation sees).
function rasterizeFirstPage(pdfBuffer, dpi = 150) {
  const id = randomUUID();
  const pdfPath = join(tmpdir(), `inbox_${id}.pdf`);
  const outPrefix = join(tmpdir(), `inbox_${id}_page`);
  const outNamePrefix = `inbox_${id}_page`;
  writeFileSync(pdfPath, pdfBuffer);

  try {
    execSync(`pdftoppm -jpeg -r ${dpi} -f 1 -l 1 "${pdfPath}" "${outPrefix}"`, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    const outFiles = readdirSync(tmpdir()).filter((f) => f.startsWith(outNamePrefix)).sort();
    if (outFiles.length === 0) throw new Error("pdftoppm produced no output");
    const jpeg = readFileSync(join(tmpdir(), outFiles[0]));
    for (const f of outFiles) unlinkSync(join(tmpdir(), f));
    return jpeg;
  } finally {
    try { unlinkSync(pdfPath); } catch { /* already removed */ }
  }
}

// Extracts just page 1 into its own tiny PDF via pdf-lib (pure JS, no system
// binary) — used to keep the request small when falling back to sending
// Claude the page as a PDF document block directly, since these catalogue
// PDFs run 3-25MB and sending the whole thing risks the API's request size
// limit for no benefit (only the cover page is needed).
async function extractFirstPagePdf(pdfBuffer) {
  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const firstPageDoc = await PDFDocument.create();
  const [copiedPage] = await firstPageDoc.copyPages(srcDoc, [0]);
  firstPageDoc.addPage(copiedPage);
  return Buffer.from(await firstPageDoc.save());
}

export async function identifyViaClaude(pdfBuffer) {
  if (!ANTHROPIC_API_KEY) {
    console.log("  ⚠ ANTHROPIC_API_KEY not set — can't ask Claude to read the cover page");
    return null;
  }

  try {
    const jpeg = rasterizeFirstPage(pdfBuffer);
    return await askClaudeToIdentify(
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
      "the first page"
    );
  } catch (err) {
    console.log(`  ⚠ Couldn't rasterize the first page (${err.message}) — is poppler-utils/pdftoppm installed? Falling back to sending the page as a PDF directly...`);
  }

  // poppler unavailable or failed — send the first page as a PDF document
  // block instead, so this still works with zero system dependencies.
  try {
    const firstPagePdf = await extractFirstPagePdf(pdfBuffer);
    return await askClaudeToIdentify(
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: firstPagePdf.toString("base64") } },
      "the first page (a one-page PDF)"
    );
  } catch (err) {
    console.log(`  ⚠ PDF-document fallback also failed: ${err.message}`);
    return null;
  }
}

// ── Filename generation ──────────────────────────────────────────────────────

export function dateToFilenameToken(iso, includeYear) {
  const [y, mo, d] = iso.split("-");
  const monKey = Object.keys(MONTH_NUM).find((k) => MONTH_NUM[k] === mo);
  const mon = MONTH_NAME[monKey] || "Jan";
  return includeYear ? `${d}${mon}${y}` : `${d}${mon}`;
}

// ── Finding + comparing the existing catalogue for a store ──────────────────

function monthAbbr(s) {
  return s.toLowerCase().slice(0, 3);
}

// Best-effort end date parsed from an existing catalogues/zambia/ filename,
// tolerant of the different shapes already in use there: the standard
// StoreName_DDMon_DDMonYYYY.pdf, Choppies' StoreName_MonYYYY.pdf (no day),
// and even the accidental StoreName_Theme_DDMon_DDMonYYYY.pdf.pdf variants.
export function parseTrailingValidUntil(filename) {
  const base = filename.replace(/(\.pdf)+$/i, "");

  const dayTokenRegex = /(\d{1,2})([A-Za-z]{3,})(\d{4})?/g;
  const dayMatches = [...base.matchAll(dayTokenRegex)].filter((m) => MONTH_NUM[monthAbbr(m[2])]);
  if (dayMatches.length > 0) {
    const last = dayMatches[dayMatches.length - 1];
    const year = last[3] || String(new Date().getFullYear());
    return `${year}-${MONTH_NUM[monthAbbr(last[2])]}-${last[1].padStart(2, "0")}`;
  }

  const monthYearMatch = base.match(/([A-Za-z]{3,})(\d{4})/);
  if (monthYearMatch && MONTH_NUM[monthAbbr(monthYearMatch[1])]) {
    return `${monthYearMatch[2]}-${MONTH_NUM[monthAbbr(monthYearMatch[1])]}-01`;
  }

  return null;
}

function findOldCatalogueFiles(storeToken) {
  if (!existsSync(ZAMBIA_DIR)) return [];
  return readdirSync(ZAMBIA_DIR).filter((f) =>
    f.toLowerCase().endsWith(".pdf") && f.toLowerCase().startsWith(`${storeToken.toLowerCase()}_`)
  );
}

// ── Git ───────────────────────────────────────────────────────────────────

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// `git diff --cached --quiet` exits 0 when the index matches HEAD (nothing
// staged) and 1 when there's a real diff — any other exit code is a genuine
// git error and should still surface.
function hasStagedChanges() {
  try {
    execSync("git diff --cached --quiet", { stdio: ["ignore", "ignore", "pipe"] });
    return false;
  } catch (err) {
    if (err.status === 1) return true;
    throw err;
  }
}

function commitAndPush(message) {
  run("git add catalogues/zambia/");
  if (!hasStagedChanges()) {
    console.log("  no changes to commit");
    return false;
  }
  run(`git commit -m "${message}"`);
  run("git push origin HEAD");
  return true;
}

// ── Per-file processing ───────────────────────────────────────────────────

async function isFileStable(filePath, waitMs = 600) {
  try {
    const s1 = statSync(filePath).size;
    await sleep(waitMs);
    const s2 = statSync(filePath).size;
    return s1 === s2 && s1 > 0;
  } catch {
    return false;
  }
}

async function processOneFile(filename) {
  const filePath = join(INBOX_DIR, filename);
  console.log(`\n📄 ${filename}`);

  if (!(await isFileStable(filePath))) {
    console.log("  ⏳ Still being written — will retry next pass");
    return;
  }

  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (err) {
    console.log(`  ✗ Couldn't read file: ${err.message}`);
    return;
  }

  if (buffer.length < 4 || buffer.slice(0, 4).toString("latin1") !== "%PDF") {
    console.log("  ✗ Not a valid PDF (bad magic bytes) — skipping");
    return;
  }

  let store = detectStoreFromFilename(filename);
  let dates = detectDatesFromFilename(filename);

  if (!store || !dates?.validFrom || !dates?.validUntil) {
    console.log("  🔍 Filename didn't have enough info — asking Claude to read the cover page...");
    const viaClaude = await identifyViaClaude(buffer).catch((err) => {
      console.log(`  ⚠ Claude lookup failed: ${err.message}`);
      return null;
    });
    if (viaClaude) {
      store = store || viaClaude.store;
      dates = {
        validFrom: dates?.validFrom || viaClaude.validFrom,
        validUntil: dates?.validUntil || viaClaude.validUntil,
      };
    }
  }

  if (!store) {
    console.log("  ✗ Could not identify the store — leaving file in inbox for manual naming");
    return;
  }
  if (!dates?.validFrom || !dates?.validUntil) {
    console.log(`  ✗ Could not determine validity dates for ${store} — leaving file in inbox`);
    return;
  }

  const storeToken = STORE_TOKENS[store];
  const startTok = dateToFilenameToken(dates.validFrom, false);
  const endTok = dateToFilenameToken(dates.validUntil, true);
  const newFilename = `${storeToken}_${startTok}_${endTok}.pdf`;
  const destPath = join(ZAMBIA_DIR, newFilename);

  if (!existsSync(ZAMBIA_DIR)) mkdirSync(ZAMBIA_DIR, { recursive: true });

  // Delete any old catalogue for this store whose end date is confidently
  // earlier than the new one's — never guess-delete an unparseable one.
  const oldFiles = findOldCatalogueFiles(storeToken).filter((f) => f !== newFilename);
  let deletedAny = false;
  for (const oldFile of oldFiles) {
    const oldValidUntil = parseTrailingValidUntil(oldFile);
    if (oldValidUntil && oldValidUntil < dates.validUntil) {
      try {
        unlinkSync(join(ZAMBIA_DIR, oldFile));
        console.log(`  🗑️  Deleted old catalogue: ${oldFile} (valid until ${oldValidUntil})`);
        deletedAny = true;
      } catch (err) {
        console.log(`  ⚠ Couldn't delete old file ${oldFile}: ${err.message}`);
      }
    } else if (!oldValidUntil) {
      console.log(`  ⚠ Found existing ${oldFile} for ${store} but couldn't parse its dates — leaving it, please review manually`);
    }
  }

  renameSync(filePath, destPath);
  console.log(`  📦 Renamed and moved to catalogues/zambia/${newFilename}`);

  try {
    const pushed = commitAndPush(`Auto: ${store} catalogue ${startTok}_${endTok} (from inbox)`);
    const oldPart = deletedAny ? ", old one deleted" : "";
    if (pushed) {
      console.log(`✓ ${store} catalogue renamed and moved${oldPart}, pushed to GitHub`);
    } else {
      console.log(`✓ ${store} catalogue renamed and moved${oldPart} (nothing to push)`);
    }
  } catch (err) {
    console.log(`  ✗ Git commit/push failed: ${err.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

export async function processInbox() {
  if (!existsSync(INBOX_DIR)) mkdirSync(INBOX_DIR, { recursive: true });
  if (!existsSync(ZAMBIA_DIR)) mkdirSync(ZAMBIA_DIR, { recursive: true });

  const files = readdirSync(INBOX_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (files.length === 0) return;

  console.log(`\n📥 Inbox: ${files.length} file(s) to process`);
  for (const filename of files) {
    await processOneFile(filename);
  }
}

// Only auto-run when executed directly (`node scripts/catalogue-inbox.js`),
// not when imported by scripts/watch-inbox.js.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  processInbox().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
