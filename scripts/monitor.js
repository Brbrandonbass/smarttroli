// scripts/monitor.js
// Auto-fetches current catalogue PDFs for Pick n Pay, Shoprite, Choppies,
// Game, and Spar (Zambia), saves any new one to catalogues/zambia/, and
// commits + pushes it so the process-pdfs.yml workflow picks it up. Logs
// every check to monitor_log.

import { neon } from "@neondatabase/serverless";
import fetch from "node-fetch";
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

// Matches Shoprite's unseparated slug format, e.g. "20jul09aug2026" (from
// URLs like .../zmselect20jul09aug2026/index.html) — two DDmon dates back to
// back with no separator, which extractDateRange's separator requirement misses.
function extractSlugDateRange(text) {
  const pattern =
    /(\d{2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{4})/i;
  const m = text.match(pattern);
  if (!m) return null;

  const [, d1, mon1Raw, d2, mon2Raw, year] = m;
  const mon1 = mon1Raw.toLowerCase();
  const mon2 = mon2Raw.toLowerCase();
  if (!MONTH_NUM[mon1] || !MONTH_NUM[mon2]) return null;

  return {
    validFrom: `${year}-${MONTH_NUM[mon1]}-${d1.padStart(2, "0")}`,
    validUntil: `${year}-${MONTH_NUM[mon2]}-${d2.padStart(2, "0")}`,
  };
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
    const range = extractSlugDateRange(text);
    if (range) return { ...range, usedFallback: false };
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

async function fetchBuffer(url, { referer } = {}) {
  const headers = { "User-Agent": UA, Accept: "application/pdf,*/*" };
  if (referer) headers.Referer = referer;
  const res = await fetch(url, { headers, redirect: "follow" });
  return { ok: res.ok, status: res.status, buffer: res.ok ? Buffer.from(await res.arrayBuffer()) : null };
}

// Non-greedy up to the first ".pdf" rather than requiring the attribute to end
// there — some sites (e.g. Shoprite's AEM DAM) embed the PDF path inside a
// longer src, like ".../leaflet.pdf/_jcr_content/renditions/thumb.jpeg".
function findPdfLinks(html, baseUrl, mustInclude) {
  const linkRegex = /(?:href|src)\s*=\s*["']([^"']*?\.pdf)/gi;
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

// Finds every .pdf reference in a blob of text — absolute URLs anywhere
// (inline <script> JSON, JSON-LD, plain markup) plus href/src attributes
// (anchors, <link>, autoindex directory listings) resolved against baseUrl.
function findPdfUrlsInText(text, baseUrl) {
  const urls = new Set();

  const absoluteRegex = /https?:\/\/[^\s"'<>\\]+\.pdf/gi;
  let m;
  while ((m = absoluteRegex.exec(text))) urls.add(m[0]);

  const attrRegex = /(?:href|src)\s*=\s*["']([^"']+\.pdf)["']/gi;
  while ((m = attrRegex.exec(text))) {
    try {
      urls.add(new URL(m[1], baseUrl).href);
    } catch {
      // malformed URL — skip
    }
  }

  return [...urls];
}

// Known real Pick n Pay path shape: /wp-content/uploads/YYYY/MM/[title].pdf.
// Candidates matching it are tried before any other stray .pdf found on the page.
function pdfCandidateScore(url) {
  return /\/wp-content\/uploads\/\d{4}\/\d{2}\/[^/]+\.pdf$/i.test(url) ? 0 : 1;
}

// current month + previous month, in case directory listing is enabled on
// the uploads folder (a common misconfiguration that exposes real filenames).
function uploadDirCandidates(origin) {
  const now = new Date();
  const y1 = now.getFullYear();
  const m1 = now.getMonth() + 1;
  let y2 = y1;
  let m2 = m1 - 1;
  if (m2 === 0) {
    m2 = 12;
    y2 = y1 - 1;
  }
  const pad = (n) => String(n).padStart(2, "0");
  return [
    `${origin}/wp-content/uploads/${y1}/${pad(m1)}/`,
    `${origin}/wp-content/uploads/${y2}/${pad(m2)}/`,
  ];
}

function isPdfBuffer(buffer) {
  return !!buffer && buffer.length >= 4 && buffer.slice(0, 4).toString("latin1") === "%PDF";
}

// Probes the uploads directory listing for current/previous month, then
// scans the promotions page itself (anchors, <link>, inline script/JSON-LD),
// returning candidate PDF URLs ranked by how well they match the known path shape.
async function discoverPnpPdfUrls(pageUrl, html) {
  const candidates = [];
  const seen = new Set();
  const addCandidate = (url) => {
    if (!seen.has(url)) {
      seen.add(url);
      candidates.push(url);
    }
  };

  const origin = new URL(pageUrl).origin;
  for (const dirUrl of uploadDirCandidates(origin)) {
    try {
      const dirHtml = await fetchText(dirUrl);
      for (const url of findPdfUrlsInText(dirHtml, dirUrl)) addCandidate(url);
    } catch {
      // directory listing disabled or missing — expected in most cases
    }
  }

  for (const url of findPdfUrlsInText(html, pageUrl)) addCandidate(url);

  return candidates.sort((a, b) => pdfCandidateScore(a) - pdfCandidateScore(b));
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

// `git diff --cached --quiet` exits 0 when the index matches HEAD (nothing
// staged) and 1 when there's a real diff — any other exit code is a genuine
// git error and should still surface.
function hasStagedChanges() {
  try {
    execSync("git diff --cached --quiet", { stdio: ["ignore", "ignore", "pipe"] });
    return false;
  } catch (err) {
    if (err.status === 1) return true;
    throw new Error(redact(err.stderr?.toString() || err.message));
  }
}

function commitAndPushCatalogue(storeName, label) {
  if (!SMARTTROLI_GITHUB_TOKEN) {
    console.log("  SMARTTROLI_GITHUB_TOKEN not set — skipping git commit/push");
    return false;
  }
  try {
    const remote = `https://${SMARTTROLI_GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git`;
    run(`git remote set-url origin "${remote}"`);
    run(`git config user.email "monitor@smarttroli.app"`);
    run(`git config user.name "SmartTroli Monitor"`);

    run("git add catalogues/zambia/");
    if (!hasStagedChanges()) {
      console.log("  no changes to commit");
      return false;
    }
    run(`git commit -m "Auto: ${storeName} catalogue ${label}"`);
    // actions/checkout persists an `http.https://github.com/.extraheader` auth
    // header for the default GITHUB_TOKEN (github-actions[bot]). That header
    // applies to any github.com request regardless of the origin URL set
    // above, so it overrides our embedded token and the push 403s as the
    // bot. Clear it for this push only so the origin URL's token is used.
    run(`git -c http.https://github.com/.extraheader= push origin HEAD:main`);
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

// Single-URL attempt shared by checkPdfFromPage and checkPdfFromPages — does
// not check hasKnownCatalogue itself (callers do that once, up front).
async function tryPdfFromPage(pageUrl, { storeName, filenamePrefix, mustInclude }) {
  console.log(`  → ${pageUrl}`);
  try {
    const html = await fetchText(pageUrl);
    const links = findPdfLinks(html, pageUrl, mustInclude);
    if (links.length === 0) {
      console.log("  ⏭️  No catalogue PDF link found");
      await logMonitor(storeName, pageUrl, "skipped", "no catalogue PDF link found");
      return { store: storeName, result: "skipped", detail: "no PDF link found" };
    }

    const pdfUrl = links[0];
    // Prefer date text near this specific link over the whole page, in case
    // multiple catalogues with different validity windows are listed.
    const pdfPath = new URL(pdfUrl).pathname;
    const pathIndex = html.indexOf(pdfPath);
    const nearbyText = pathIndex >= 0 ? html.slice(Math.max(0, pathIndex - 200), pathIndex + 800) : html;
    const { validFrom, validUntil, usedFallback: usedFallbackDates } = resolveDateRange(pdfUrl, nearbyText, html);

    // Some sites (e.g. Shoprite's CloudFront/WAF) reject direct asset fetches
    // without a Referer pointing back at the page that linked to them.
    const { ok, status, buffer } = await fetchBuffer(pdfUrl, { referer: pageUrl });
    if (!ok) {
      console.log(`  ✗ HTTP ${status} fetching ${pdfUrl}`);
      await logMonitor(storeName, pdfUrl, "error", `HTTP ${status}`);
      return { store: storeName, result: "error", detail: `HTTP ${status}` };
    }
    if (!isPdfBuffer(buffer)) {
      console.log(`  ✗ Not a valid PDF (magic bytes check failed): ${pdfUrl}`);
      await logMonitor(storeName, pdfUrl, "error", "downloaded content is not a valid PDF");
      return { store: storeName, result: "error", detail: "invalid PDF content" };
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

async function checkPdfFromPage({ storeName, pageUrl, filenamePrefix, mustInclude }) {
  console.log(`\n🔍 Checking ${storeName}: ${pageUrl}`);

  if (await hasKnownCatalogue(storeName)) {
    console.log("  ⏭️  Already have a known catalogue — skipping");
    await logMonitor(storeName, pageUrl, "skipped", "valid_until already on file");
    return { store: storeName, result: "skipped" };
  }

  return tryPdfFromPage(pageUrl, { storeName, filenamePrefix, mustInclude });
}

// Tries each candidate page in turn (e.g. a specials aggregator, then the
// store's own site), stopping at the first one with a usable PDF.
async function checkPdfFromPages({ storeName, pageUrls, filenamePrefix, mustInclude }) {
  console.log(`\n🔍 Checking ${storeName} (${pageUrls.length} source(s))`);

  if (await hasKnownCatalogue(storeName)) {
    console.log("  ⏭️  Already have a known catalogue — skipping");
    await logMonitor(storeName, pageUrls[0], "skipped", "valid_until already on file");
    return { store: storeName, result: "skipped" };
  }

  let lastResult = null;
  for (const pageUrl of pageUrls) {
    lastResult = await tryPdfFromPage(pageUrl, { storeName, filenamePrefix, mustInclude });
    if (lastResult.result === "new_catalogue") return lastResult;
  }
  return lastResult;
}

// Pick n Pay's promotions page renders the actual catalogue via JavaScript —
// the server-side HTML only carries stale placeholder images. Probe for the
// real PDF instead: try the current/previous month's uploads directory
// listing, then scan the page's anchors/<link>/inline script/JSON-LD for any
// .pdf reference, and validate each candidate by its "%PDF" magic bytes
// before trusting it.
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
    // Raw HTML snapshot for debugging what the scraper actually sees.
    await logMonitor(storeName, pageUrl, "html_snapshot", html.slice(0, 3000));

    const candidates = await discoverPnpPdfUrls(pageUrl, html);
    console.log(`  Found ${candidates.length} candidate PDF URL(s)`);

    let pdfUrl = null;
    let buffer = null;
    for (const url of candidates) {
      const res = await fetchBuffer(url);
      if (res.ok && isPdfBuffer(res.buffer)) {
        pdfUrl = url;
        buffer = res.buffer;
        break;
      }
      console.log(`  ✗ Not a usable PDF: ${url} (${res.ok ? "not a PDF" : `HTTP ${res.status}`})`);
    }

    if (!pdfUrl) {
      console.log("  ⏭️  No valid catalogue PDF found — page likely renders it via JavaScript");
      await logMonitor(
        storeName,
        pageUrl,
        "skipped",
        `no valid PDF found among ${candidates.length} candidate(s) — see html_snapshot log`
      );
      return { store: storeName, result: "skipped", detail: "no valid PDF found" };
    }

    const { validFrom, validUntil, usedFallback: usedFallbackDates } = resolveDateRange(pdfUrl, html);
    const startTok = dateToFilenameToken(validFrom, false);
    const endTok = dateToFilenameToken(validUntil, true);
    const filename = `PicknPay_${startTok}_${endTok}.pdf`;
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

function checkShoprite() {
  return checkPdfFromPage({
    storeName: "Shoprite",
    pageUrl: "https://www.shoprite.co.zm/specials.html",
    filenamePrefix: "Shoprite",
    // Restricts matches to the AEM DAM leaflet path so unrelated .pdf links on
    // the page (e.g. the footer's cookie-policy/data-privacy docs) are ignored.
    mustInclude: "specials-leaflets",
  });
}

// Neither source currently exposes a real downloadable PDF — guzzle.co.za's
// Game Zambia listing renders each catalogue as a page-flip image viewer
// (zero .pdf references anywhere in the page or its per-catalogue detail
// pages), and game.co.zm/promotions/promotions just embeds that same guzzle
// widget via JS. Both are tried anyway so this starts working automatically
// the moment either site adds a real PDF; until then this correctly and
// harmlessly logs "skipped" each run, same as Pick n Pay does when its page
// is JS-only.
function checkGame() {
  return checkPdfFromPages({
    storeName: "Game",
    pageUrls: [
      "https://www.guzzle.co.za/game-zambia/lusaka/",
      "https://www.game.co.zm/promotions/promotions",
    ],
    filenamePrefix: "Game",
  });
}

// guzzle.co.za has no Spar Zambia page at all (this exact URL 404s, and no
// other slug on the site covers Zambia for Spar — its /spar/ page is
// South-Africa-only). Kept as-is so it starts working the moment guzzle (or
// Spar Zambia directly) publishes one at this address.
function checkSpar() {
  return checkPdfFromPage({
    storeName: "Spar",
    pageUrl: "https://www.guzzle.co.za/spar-zambia/",
    filenamePrefix: "Spar",
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
    await checkGame(),
    await checkSpar(),
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
