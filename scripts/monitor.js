// scripts/monitor.js
// Auto-fetches current catalogue PDFs for Pick n Pay, Shoprite, and Choppies
// (Zambia), saves any new one to catalogues/zambia/, and commits + pushes it
// so the process-pdfs.yml workflow picks it up. Logs every check to monitor_log.

import { neon } from "@neondatabase/serverless";
import fetch from "node-fetch";
import { PDFDocument } from "pdf-lib";
import { execSync } from "child_process";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const DATABASE_URL = process.env.DATABASE_URL;
const SMARTTROLI_GITHUB_TOKEN = process.env.SMARTTROLI_GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || "Brbrandonbass/smarttroli";

if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const sql = neon(DATABASE_URL);
const PDF_DIR = join(process.cwd(), "catalogues", "zambia");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MONTH_NAME = {
  jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun",
  jul: "Jul", aug: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec",
};
const MONTH_NUM = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

// ── Neon helpers ────────────────────────────────────────────────────────────

async function hasKnownCatalogue(storeName) {
  const rows = await sql`
    SELECT id FROM catalogues WHERE store_name = ${storeName} AND valid_until IS NOT NULL LIMIT 1
  `;
  return rows.length > 0;
}

async function logMonitor(storeName, url, result, detail) {
  await sql`
    INSERT INTO monitor_log (store_name, url_checked, result, detail)
    VALUES (${storeName}, ${url}, ${result}, ${detail ?? ""})
  `;
}

// ── Date parsing ────────────────────────────────────────────────────────────

// Matches things like "1 May - 14 May 2026" or "01 - 14 May 2026" in a filename or page text.
function extractDateRange(text) {
  const pattern =
    /(\d{1,2})\s*(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)?\s*(?:-|to|–|—)\s*(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{4})?/i;
  const m = text.match(pattern);
  if (!m) return { validFrom: null, validUntil: null };

  const [, d1, mon1Raw, d2, mon2Raw, yearRaw] = m;
  const mon2 = mon2Raw.toLowerCase().slice(0, 3);
  const mon1 = (mon1Raw || mon2Raw).toLowerCase().slice(0, 3);
  if (!MONTH_NUM[mon1] || !MONTH_NUM[mon2]) return { validFrom: null, validUntil: null };

  const year = yearRaw || String(new Date().getFullYear());
  return {
    validFrom: `${year}-${MONTH_NUM[mon1]}-${d1.padStart(2, "0")}`,
    validUntil: `${year}-${MONTH_NUM[mon2]}-${d2.padStart(2, "0")}`,
  };
}

// Matches a single date like "01-March-2023" — used when a filename/page only
// carries a start date rather than a full range (e.g. Pick n Pay's image names).
function extractSingleDate(text) {
  const pattern =
    /(\d{1,2})[\s-]*(?:st|nd|rd|th)?[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s-]*(\d{4})?/i;
  const m = text.match(pattern);
  if (!m) return null;

  const [, day, monRaw, yearRaw] = m;
  const mon = monRaw.toLowerCase().slice(0, 3);
  if (!MONTH_NUM[mon]) return null;

  const year = yearRaw || String(new Date().getFullYear());
  return `${year}-${MONTH_NUM[mon]}-${day.padStart(2, "0")}`;
}

// Used when no date range can be found in the filename or page text — assumes
// a typical 2-week catalogue starting today.
function fallbackDateRange() {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 13);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { validFrom: iso(now), validUntil: iso(end) };
}

// Tries a full date range first, then a single start date (+13 days), then
// falls back to a 14-day window from today. Tries each text candidate in order.
function resolveDateRange(...texts) {
  for (const text of texts) {
    const range = extractDateRange(text);
    if (range.validFrom) return { ...range, usedFallback: false };
  }
  for (const text of texts) {
    const start = extractSingleDate(text);
    if (start) {
      const end = new Date(start);
      end.setDate(end.getDate() + 13);
      return { validFrom: start, validUntil: end.toISOString().slice(0, 10), usedFallback: false };
    }
  }
  return { ...fallbackDateRange(), usedFallback: true };
}

function dateToFilenameToken(iso, includeYear) {
  const [y, mo, d] = iso.split("-");
  const monKey = Object.keys(MONTH_NUM).find((k) => MONTH_NUM[k] === mo);
  const mon = MONTH_NAME[monKey] || "Jan";
  return includeYear ? `${d}${mon}${y}` : `${d}${mon}`;
}

// ── Fetch helpers ───────────────────────────────────────────────────────────

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/pdf,*/*" },
    redirect: "follow",
  });
  return { ok: res.ok, status: res.status, buffer: res.ok ? Buffer.from(await res.arrayBuffer()) : null };
}

function findPdfLinks(html, baseUrl, mustInclude) {
  const linkRegex = /(?:href|src)\s*=\s*["']([^"']+\.pdf)["']/gi;
  const links = [];
  let m;
  while ((m = linkRegex.exec(html))) {
    if (mustInclude && !m[1].includes(mustInclude)) continue;
    try {
      links.push(new URL(m[1], baseUrl).href);
    } catch {
      // malformed URL — skip
    }
  }
  return [...new Set(links)];
}

function ensurePdfDir() {
  if (!existsSync(PDF_DIR)) mkdirSync(PDF_DIR, { recursive: true });
}

// Catalogue images served as JPGs (e.g. Pick n Pay) instead of a single PDF.
function findCatalogueImageLinks(html, baseUrl) {
  const imgRegex = /(?:href|src)\s*=\s*["']([^"']+\.jpe?g)["']/gi;
  const seen = new Set();
  const links = [];
  let m;
  while ((m = imgRegex.exec(html))) {
    let url;
    try {
      url = new URL(m[1], baseUrl).href;
    } catch {
      continue; // malformed URL — skip
    }
    if (!url.includes("wp-content/uploads")) continue;
    if (/-\d+x\d+\.jpe?g$/i.test(url)) continue; // skip WordPress-generated thumbnail sizes
    if (seen.has(url)) continue;
    seen.add(url);
    links.push(url);
  }
  return links;
}

// Sorts catalogue page images by a trailing page number (e.g. "...-01.jpg"),
// falling back to 0 (keeps original order) when no number is present.
function pageNumberOf(url) {
  const m = url.match(/(\d+)\.jpe?g(?:[?#].*)?$/i);
  return m ? parseInt(m[1], 10) : 0;
}

// Combines JPEG page images into a single PDF, one image per page. Images
// that fail to embed (corrupt download, unexpected format) are skipped rather
// than failing the whole catalogue; returns null if none could be embedded.
async function combineJpegsToPdf(jpegBuffers) {
  const pdfDoc = await PDFDocument.create();
  for (const bytes of jpegBuffers) {
    try {
      const image = await pdfDoc.embedJpg(bytes);
      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    } catch (err) {
      console.log(`  ✗ Skipping unembeddable image: ${err.message}`);
    }
  }
  if (pdfDoc.getPageCount() === 0) return null;
  return Buffer.from(await pdfDoc.save());
}

// ── Git commit + push ───────────────────────────────────────────────────────

function redact(message) {
  if (!SMARTTROLI_GITHUB_TOKEN) return message;
  return String(message).split(SMARTTROLI_GITHUB_TOKEN).join("***");
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    throw new Error(redact(err.stderr?.toString() || err.message));
  }
}

function commitAndPushCatalogue(storeName, label) {
  if (!SMARTTROLI_GITHUB_TOKEN) {
    console.log("  SMARTTROLI_GITHUB_TOKEN not set — skipping git commit/push");
    return false;
  }
  try {
    run("git add catalogues/zambia/");
    run(
      `git -c user.email="bot@smarttroli.app" -c user.name="SmartTroli Bot" commit -m "Auto: ${storeName} catalogue ${label}"`
    );
    const remote = `https://${SMARTTROLI_GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git`;
    run(`git push "${remote}" HEAD:main`);
    console.log(`  ✓ Committed and pushed ${storeName} catalogue`);
    return true;
  } catch (err) {
    console.error(`  ✗ Git commit/push failed: ${err.message}`);
    return false;
  }
}

// ── Per-store handlers ───────────────────────────────────────────────────────

async function checkChoppies() {
  const storeName = "Choppies";
  const url = "https://choppies.co.zm/Cpromotions/promotions.pdf";
  console.log(`\n🔍 Checking ${storeName}: ${url}`);

  if (await hasKnownCatalogue(storeName)) {
    console.log("  ⏭️  Already have a known catalogue — skipping");
    await logMonitor(storeName, url, "skipped", "valid_until already on file");
    return { store: storeName, result: "skipped" };
  }

  try {
    const { ok, status, buffer } = await fetchBuffer(url);
    if (!ok) {
      console.log(`  ✗ HTTP ${status}`);
      await logMonitor(storeName, url, "error", `HTTP ${status}`);
      return { store: storeName, result: "error", detail: `HTTP ${status}` };
    }

    const now = new Date();
    const mon = Object.values(MONTH_NAME)[now.getMonth()];
    const filename = `Choppies_${mon}${now.getFullYear()}.pdf`;
    ensurePdfDir();
    writeFileSync(join(PDF_DIR, filename), buffer);
    console.log(`  📥 Saved ${filename}`);

    commitAndPushCatalogue(storeName, `${mon}${now.getFullYear()}`);
    await logMonitor(storeName, url, "new_catalogue", `saved ${filename}`);
    return { store: storeName, result: "new_catalogue", detail: filename };
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    await logMonitor(storeName, url, "error", err.message);
    return { store: storeName, result: "error", detail: err.message };
  }
}

async function checkPdfFromPage({ storeName, pageUrl, filenamePrefix, mustInclude }) {
  console.log(`\n🔍 Checking ${storeName}: ${pageUrl}`);

  if (await hasKnownCatalogue(storeName)) {
    console.log("  ⏭️  Already have a known catalogue — skipping");
    await logMonitor(storeName, pageUrl, "skipped", "valid_until already on file");
    return { store: storeName, result: "skipped" };
  }

  try {
    const html = await fetchText(pageUrl);
    const links = findPdfLinks(html, pageUrl, mustInclude);
    if (links.length === 0) {
      console.log("  ⏭️  No catalogue PDF link found");
      await logMonitor(storeName, pageUrl, "skipped", "no catalogue PDF link found");
      return { store: storeName, result: "skipped", detail: "no PDF link found" };
    }

    const pdfUrl = links[0];
    const { validFrom, validUntil, usedFallback: usedFallbackDates } = resolveDateRange(pdfUrl, html);

    const { ok, status, buffer } = await fetchBuffer(pdfUrl);
    if (!ok) {
      console.log(`  ✗ HTTP ${status} fetching ${pdfUrl}`);
      await logMonitor(storeName, pdfUrl, "error", `HTTP ${status}`);
      return { store: storeName, result: "error", detail: `HTTP ${status}` };
    }

    const startTok = dateToFilenameToken(validFrom, false);
    const endTok = dateToFilenameToken(validUntil, true);
    const filename = `${filenamePrefix}_${startTok}_${endTok}.pdf`;
    ensurePdfDir();
    writeFileSync(join(PDF_DIR, filename), buffer);
    console.log(`  📥 Saved ${filename}${usedFallbackDates ? " (dates not found — used fallback range)" : ""}`);

    commitAndPushCatalogue(storeName, `${startTok}_${endTok}`);
    await logMonitor(
      storeName,
      pdfUrl,
      "new_catalogue",
      `saved ${filename}${usedFallbackDates ? " (fallback dates)" : ""}`
    );
    return { store: storeName, result: "new_catalogue", detail: filename };
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    await logMonitor(storeName, pageUrl, "error", err.message);
    return { store: storeName, result: "error", detail: err.message };
  }
}

// Pick n Pay publishes each catalogue page as a separate JPG rather than a
// single PDF — download every page image and combine them into one PDF so
// process-pdfs.js can handle it exactly like the other stores.
async function checkPickNPay() {
  const storeName = "Pick n Pay";
  const pageUrl = "https://www.picknpayzambia.com/promotions/";
  console.log(`\n🔍 Checking ${storeName}: ${pageUrl}`);

  if (await hasKnownCatalogue(storeName)) {
    console.log("  ⏭️  Already have a known catalogue — skipping");
    await logMonitor(storeName, pageUrl, "skipped", "valid_until already on file");
    return { store: storeName, result: "skipped" };
  }

  try {
    const html = await fetchText(pageUrl);
    const imageUrls = findCatalogueImageLinks(html, pageUrl).sort(
      (a, b) => pageNumberOf(a) - pageNumberOf(b)
    );
    if (imageUrls.length === 0) {
      console.log("  ⏭️  No catalogue images found");
      await logMonitor(storeName, pageUrl, "skipped", "no catalogue images found");
      return { store: storeName, result: "skipped", detail: "no catalogue images found" };
    }
    console.log(`  Found ${imageUrls.length} catalogue image(s)`);

    const { validFrom, validUntil, usedFallback: usedFallbackDates } = resolveDateRange(imageUrls[0], html);

    const jpegBuffers = [];
    for (const url of imageUrls) {
      const { ok, status, buffer } = await fetchBuffer(url);
      if (!ok) {
        console.log(`  ✗ HTTP ${status} fetching ${url} — skipping this page`);
        continue;
      }
      jpegBuffers.push(buffer);
    }

    const pdfBuffer = jpegBuffers.length ? await combineJpegsToPdf(jpegBuffers) : null;
    if (!pdfBuffer) {
      console.log("  ✗ Could not build a PDF from any catalogue image");
      await logMonitor(storeName, pageUrl, "error", "no catalogue images could be downloaded/embedded");
      return { store: storeName, result: "error", detail: "no catalogue images could be downloaded/embedded" };
    }

    const startTok = dateToFilenameToken(validFrom, false);
    const endTok = dateToFilenameToken(validUntil, true);
    const filename = `PicknPay_${startTok}_${endTok}.pdf`;
    ensurePdfDir();
    writeFileSync(join(PDF_DIR, filename), pdfBuffer);
    console.log(
      `  📥 Saved ${filename} (${jpegBuffers.length} page(s))${usedFallbackDates ? " (dates not found — used fallback range)" : ""}`
    );

    commitAndPushCatalogue(storeName, `${startTok}_${endTok}`);
    await logMonitor(
      storeName,
      pageUrl,
      "new_catalogue",
      `saved ${filename} (${jpegBuffers.length} page(s) combined)${usedFallbackDates ? " (fallback dates)" : ""}`
    );
    return { store: storeName, result: "new_catalogue", detail: filename };
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
    await logMonitor(storeName, pageUrl, "error", err.message);
    return { store: storeName, result: "error", detail: err.message };
  }
}

function checkShoprite() {
  return checkPdfFromPage({
    storeName: "Shoprite",
    pageUrl: "https://www.shoprite.co.zm/specials.html",
    filenamePrefix: "Shoprite",
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("SmartTroli — Catalogue Monitor");
  console.log("================================");
  console.log(`Started: ${new Date().toISOString()}`);

  const results = [
    await checkChoppies(),
    await checkPickNPay(),
    await checkShoprite(),
  ];

  console.log("\n================================");
  console.log("MONITOR SUMMARY");
  console.log("================================");
  for (const r of results) {
    const icon =
      r.result === "new_catalogue" ? "📥" : r.result === "skipped" ? "⏭️" : r.result === "error" ? "❌" : "✅";
    console.log(`${icon} ${r.store}: ${r.result}`);
    if (r.detail) console.log(`   ${r.detail.slice(0, 200)}`);
  }

  console.log(`\nFinished: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
