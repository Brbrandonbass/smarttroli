// scripts/agent-pipeline.js
// Agentic catalogue pipeline — MCP tools (Neon + GitHub) + chunked PDF extraction

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PDFDocument } from "pdf-lib";
import fetch from "node-fetch";
import { neon } from "@neondatabase/serverless";

export const MODEL = "claude-sonnet-4-20250514";
export const MCP_BETA = "mcp-client-2025-04-04";
export const MIN_PRODUCTS_PROCESSED = 20;
export const MAX_CHUNK_RETRIES = 3;
export const RETRY_BACKOFF_MS = [2000, 4000, 8000];

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const SMARTTROLI_GITHUB_TOKEN = process.env.SMARTTROLI_GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || "Brbrandonbass/smarttroli";

export const STORE_MONITOR_URLS = [
  { name: "Shoprite", url: "https://www.shoprite.co.zm/specials.html" },
  { name: "Choppies", url: "https://choppies.co.zm/promotions/" },
  { name: "Pick n Pay", url: "https://www.picknpayzambia.com/specials" },
  { name: "Game", url: "https://supermarketsandgrocers.shop/zam/game/" },
  { name: "Spar", url: "https://www.sparzambia.com/specials" },
  { name: "Woolworths", url: "https://supermarketsandgrocers.shop/zam/woolworths/" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getSql() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
  return neon(DATABASE_URL);
}

function getAnthropic() {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");
  return new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
    defaultHeaders: { "anthropic-beta": MCP_BETA },
  });
}

// ── MCP client connections ────────────────────────────────────────────────────

export async function createMcpClients() {
  const clients = [];

  if (DATABASE_URL) {
    const neonTransport = new StdioClientTransport({
      command: "npx",
      args: ["-y", "@neondatabase/mcp-server-neon"],
      env: { ...process.env, DATABASE_URL },
    });
    const neonClient = new Client({ name: "smarttroli-neon", version: "1.0.0" });
    await neonClient.connect(neonTransport);
    clients.push({ client: neonClient, prefix: "neon", label: "Neon" });
  }

  if (SMARTTROLI_GITHUB_TOKEN) {
    const ghTransport = new StdioClientTransport({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: SMARTTROLI_GITHUB_TOKEN },
    });
    const ghClient = new Client({ name: "smarttroli-github", version: "1.0.0" });
    await ghClient.connect(ghTransport);
    clients.push({ client: ghClient, prefix: "github", label: "GitHub" });
  }

  return clients;
}

export async function closeMcpClients(clients) {
  for (const { client } of clients) {
    try {
      await client.close();
    } catch { /* ignore */ }
  }
}

async function collectMcpTools(mcpClients) {
  const tools = [];
  const routing = new Map();

  for (const { client, prefix } of mcpClients) {
    const { tools: serverTools } = await client.listTools();
    for (const tool of serverTools) {
      const name = `${prefix}__${tool.name}`;
      tools.push({
        name,
        description: `[${prefix}] ${tool.description || tool.name}`,
        input_schema: tool.inputSchema,
      });
      routing.set(name, { client, originalName: tool.name });
    }
  }

  return { tools, routing };
}

function toolResultContent(result) {
  if (!result?.content?.length) return JSON.stringify(result ?? {});
  return result.content
    .map((block) => (block.type === "text" ? block.text : JSON.stringify(block)))
    .join("\n");
}

// ── Agent loop — runs until end_turn ──────────────────────────────────────────

export async function agentLoop(userMessage, { system, mcpClients } = {}) {
  const anthropic = getAnthropic();
  const clients = mcpClients ?? (await createMcpClients());
  const ownsClients = !mcpClients;

  try {
    const { tools, routing } = await collectMcpTools(clients);
    const messages = [{ role: "user", content: userMessage }];

    while (true) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8000,
        system: system || "You are a SmartTroli Zambia catalogue automation agent. Use tools when needed. Be concise.",
        tools: tools.length ? tools : undefined,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const text = response.content
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        return { text, messages, response, stopReason: response.stop_reason };
      }

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const route = routing.get(block.name);
        if (!route) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          });
          continue;
        }

        try {
          const result = await route.client.callTool({
            name: route.originalName,
            arguments: block.input,
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: toolResultContent(result),
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: err.message,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  } finally {
    if (ownsClients) await closeMcpClients(clients);
  }
}

// ── PDF splitting + Claude extraction helpers ─────────────────────────────────

export async function splitPDF(buffer, pagesPerChunk = 10) {
  const srcDoc = await PDFDocument.load(buffer);
  const total = srcDoc.getPageCount();
  const chunks = [];
  for (let i = 0; i < total; i += pagesPerChunk) {
    const doc = await PDFDocument.create();
    const end = Math.min(i + pagesPerChunk, total);
    const pages = await doc.copyPages(srcDoc, [...Array(end - i).keys()].map((x) => x + i));
    pages.forEach((p) => doc.addPage(p));
    chunks.push({ buffer: Buffer.from(await doc.save()), startPage: i + 1, endPage: end });
  }
  return chunks;
}

function buildExtractionPrompt(storeName, pageHint = "") {
  return `Extract ALL individual products and their Zambian Kwacha (K) prices from this ${storeName} Zambia catalogue${pageHint}.

Rules:
- Extract EVERY product with a clear price
- Prices are in Zambian Kwacha (K) — typically K10 to K5000
- Skip bundle deals (products with multiple items separated by commas or &)
- Include product name, size/weight if shown
- Mark isSpecial as true for all items (they are catalogue specials)

Output ONLY this JSON:
{"store":"${storeName}","validFrom":null,"validUntil":null,"products":[{"name":"Roller Meal 5kg","price":162.99,"isSpecial":true}]}`;
}

export function parseClaudeProducts(text) {
  const fb = text.indexOf("{");
  if (fb === -1) throw new Error("No JSON in response");

  let parsed = null;
  try {
    const lb = text.lastIndexOf("}");
    parsed = JSON.parse(text.slice(fb, lb + 1));
  } catch {
    const partial = text.slice(fb);
    const lastComma = partial.lastIndexOf("},");
    if (lastComma > 0) parsed = JSON.parse(partial.slice(0, lastComma + 1) + "]}");
  }
  if (!parsed) throw new Error("Could not parse JSON response");

  const products = (parsed.products || []).filter(
    (p) => p.name && p.price > 0 && p.price < 100000 && !p.name.includes(",") && p.name.length < 150
  );
  return { products, validFrom: parsed.validFrom, validUntil: parsed.validUntil };
}

async function extractChunkWithClaude(pdfBuffer, storeName, pageHint = "") {
  const anthropic = getAnthropic();
  const base64 = pdfBuffer.toString("base64");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system:
      "You are extracting Zambian grocery prices from a store catalogue PDF. Extract EVERY individual product and its Kwacha price. Skip bundle deals. Output ONLY valid JSON. Plain ASCII only.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          { type: "text", text: buildExtractionPrompt(storeName, pageHint) },
        ],
      },
    ],
  });

  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseClaudeProducts(text);
}

function dedupeProducts(products) {
  const seen = new Map();
  for (const p of products) {
    const key = p.name.toLowerCase().trim();
    if (!seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()];
}

async function getChunkRow(sql, catalogueId, chunkIndex) {
  const rows = await sql`
    SELECT * FROM extraction_chunks
    WHERE catalogue_id = ${catalogueId} AND chunk_index = ${chunkIndex}
    LIMIT 1
  `;
  return rows[0] || null;
}

async function upsertChunkRow(sql, catalogueId, chunkIndex, startPage, endPage, fields) {
  const existing = await getChunkRow(sql, catalogueId, chunkIndex);
  if (existing) {
    await sql`
      UPDATE extraction_chunks SET
        status = ${fields.status},
        product_count = ${fields.product_count ?? existing.product_count},
        retries = ${fields.retries ?? existing.retries},
        updated_at = NOW()
      WHERE catalogue_id = ${catalogueId} AND chunk_index = ${chunkIndex}
    `;
    return;
  }
  await sql`
    INSERT INTO extraction_chunks (catalogue_id, chunk_index, start_page, end_page, status, product_count, retries)
    VALUES (${catalogueId}, ${chunkIndex}, ${startPage}, ${endPage}, ${fields.status}, ${fields.product_count ?? 0}, ${fields.retries ?? 0})
  `;
}

async function saveChunkProducts(sql, catalogueId, storeId, storeName, products, validFrom, validUntil) {
  let saved = 0;
  for (const p of products) {
    if (!p.name || p.price <= 0) continue;
    try {
      await sql`
        INSERT INTO catalogue_prices (catalogue_id, store_id, store_name, product_name, price, is_special, valid_from, valid_until)
        VALUES (${catalogueId}, ${storeId}, ${storeName}, ${p.name.slice(0, 500)}, ${p.price}, ${p.isSpecial ?? true}, ${validFrom}, ${validUntil})
      `;
      saved++;
    } catch { /* skip duplicates */ }
  }
  return saved;
}

async function countCatalogueProducts(sql, catalogueId) {
  const rows = await sql`
    SELECT COUNT(*)::int AS count FROM catalogue_prices WHERE catalogue_id = ${catalogueId}
  `;
  return rows[0]?.count ?? 0;
}

// ── Chunked extraction with DB tracking + retries ─────────────────────────────

export async function extractWithLoop(pdfBuffer, storeName, catalogueId, { storeId, validFrom, validUntil } = {}) {
  const sql = getSql();
  const sizeMB = (pdfBuffer.length / 1024 / 1024).toFixed(1);
  console.log(`  PDF size: ${sizeMB}MB — agentic chunk extraction`);

  const pdfChunks = await splitPDF(pdfBuffer, 10);
  console.log(`  Split into ${pdfChunks.length} chunk(s)`);

  let extractedValidFrom = validFrom;
  let extractedValidUntil = validUntil;

  for (let i = 0; i < pdfChunks.length; i++) {
    const { buffer, startPage, endPage } = pdfChunks[i];
    const chunkIndex = i;
    const existing = await getChunkRow(sql, catalogueId, chunkIndex);

    if (existing?.status === "done") {
      console.log(`  Chunk ${i + 1}/${pdfChunks.length}: pages ${startPage}-${endPage} — already done (${existing.product_count} products)`);
      continue;
    }

    let retries = existing?.retries ?? 0;
    let success = false;
    let chunkProducts = [];

    while (retries <= MAX_CHUNK_RETRIES && !success) {
      try {
        await upsertChunkRow(sql, catalogueId, chunkIndex, startPage, endPage, {
          status: "processing",
          retries,
        });

        const pageHint = ` (pages ${startPage}-${endPage})`;
        console.log(`  Chunk ${i + 1}/${pdfChunks.length}: pages ${startPage}-${endPage}${retries ? ` (retry ${retries})` : ""}`);

        const { products, validFrom: vf, validUntil: vu } = await extractChunkWithClaude(
          buffer,
          storeName,
          pageHint
        );
        chunkProducts = products;
        if (vf) extractedValidFrom = extractedValidFrom || vf;
        if (vu) extractedValidUntil = extractedValidUntil || vu;

        const saved = await saveChunkProducts(
          sql,
          catalogueId,
          storeId,
          storeName,
          chunkProducts,
          extractedValidFrom,
          extractedValidUntil
        );

        await upsertChunkRow(sql, catalogueId, chunkIndex, startPage, endPage, {
          status: "done",
          product_count: saved,
          retries,
        });

        console.log(`  ✓ Chunk ${i + 1}: ${saved} products saved`);
        success = true;
      } catch (err) {
        retries++;
        console.error(`  ✗ Chunk ${i + 1} failed: ${err.message}`);
        await upsertChunkRow(sql, catalogueId, chunkIndex, startPage, endPage, {
          status: retries > MAX_CHUNK_RETRIES ? "failed" : "pending",
          product_count: 0,
          retries,
        });
        if (retries <= MAX_CHUNK_RETRIES) {
          const backoff = RETRY_BACKOFF_MS[retries - 1] ?? 8000;
          console.log(`  Retrying in ${backoff / 1000}s...`);
          await sleep(backoff);
        }
      }
    }

    if (i < pdfChunks.length - 1) await sleep(1000);
  }

  const totalProducts = await countCatalogueProducts(sql, catalogueId);
  const doneRows = await sql`
    SELECT COUNT(*)::int AS count FROM extraction_chunks
    WHERE catalogue_id = ${catalogueId} AND status = 'done'
  `;
  const allChunksDone = doneRows[0].count >= pdfChunks.length;
  const ready = allChunksDone && totalProducts >= MIN_PRODUCTS_PROCESSED;

  if (ready) {
    await sql`
      UPDATE catalogues SET processed = true, raw_text = ${`${totalProducts} products`}
      WHERE id = ${catalogueId}
    `;
    console.log(`  ✓ Catalogue marked processed (${totalProducts} products)`);
  } else {
    await sql`
      UPDATE catalogues SET processed = false, raw_text = ${`${totalProducts} products (pending)`}
      WHERE id = ${catalogueId}
    `;
    console.log(`  Catalogue not yet processed — ${totalProducts} products (${doneRows[0].count}/${pdfChunks.length} chunks done, need ${MIN_PRODUCTS_PROCESSED}+ products)`);
  }

  const allRows = await sql`
    SELECT product_name, price, is_special FROM catalogue_prices WHERE catalogue_id = ${catalogueId}
  `;
  const products = dedupeProducts(
    allRows.map((r) => ({ name: r.product_name, price: Number(r.price), isSpecial: r.is_special }))
  );

  return {
    products,
    validFrom: extractedValidFrom,
    validUntil: extractedValidUntil,
    totalProducts,
    processed: ready,
  };
}

// ── Monitor store specials + agentic GitHub commit ────────────────────────────

async function fetchPageMeta(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/pdf,*/*",
    },
    redirect: "follow",
  });
  const contentType = res.headers.get("content-type") || "";
  const text = contentType.includes("pdf") ? "" : await res.text();
  return { ok: res.ok, status: res.status, contentType, url: res.url, text };
}

function extractValidUntilFromHtml(text) {
  const datePattern = /(\d{1,2})[\/\-\s](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\/\-\s]?(\d{4})?/gi;
  const matches = [...text.matchAll(datePattern)];
  if (!matches.length) return null;

  const months = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const last = matches[matches.length - 1];
  const d = last[1].padStart(2, "0");
  const mo = months[last[2].toLowerCase().slice(0, 3)];
  const y = last[3] || String(new Date().getFullYear());
  return `${y}-${mo}-${d}`;
}

async function getLatestCatalogueValidUntil(sql, storeName) {
  const rows = await sql`
    SELECT valid_until FROM catalogues
    WHERE store_name = ${storeName} AND valid_until IS NOT NULL
    ORDER BY valid_until DESC
    LIMIT 1
  `;
  return rows[0]?.valid_until ?? null;
}

async function triggerProcessPdfsWorkflow(targetFile = "") {
  if (!SMARTTROLI_GITHUB_TOKEN) {
    console.log("  SMARTTROLI_GITHUB_TOKEN not set — skipping workflow dispatch");
    return false;
  }
  const [owner, repo] = GITHUB_REPOSITORY.split("/");
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/process-pdfs.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SMARTTROLI_GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { target_file: targetFile } }),
    }
  );
  return res.ok || res.status === 204;
}

export async function monitorAndFetch() {
  const sql = getSql();
  const results = [];
  let mcpClients = null;

  try {
    if (SMARTTROLI_GITHUB_TOKEN) mcpClients = await createMcpClients();

    for (const store of STORE_MONITOR_URLS) {
      console.log(`\n🔍 Monitoring ${store.name}: ${store.url}`);
      let result = "checked";
      let detail = "";

      try {
        const meta = await fetchPageMeta(store.url);
        if (!meta.ok) throw new Error(`HTTP ${meta.status}`);

        const detectedUntil = meta.text ? extractValidUntilFromHtml(meta.text) : null;
        const knownUntil = await getLatestCatalogueValidUntil(sql, store.name);

        detail = `detected_until=${detectedUntil || "unknown"}, known_until=${knownUntil || "none"}`;

        const isPdf = meta.contentType.includes("pdf");
        const needsUpdate = isPdf || (detectedUntil && detectedUntil !== knownUntil);

        if (!needsUpdate) {
          result = "skipped";
          detail += " — up to date";
          console.log(`  ⏭️ No new catalogue detected`);
        } else {
          result = "new_catalogue";
          console.log(`  📥 New catalogue suspected — invoking agent`);

          const agentPrompt = `SmartTroli Zambia monitor detected a possible new catalogue for ${store.name}.

Store: ${store.name}
Specials URL: ${store.url}
Detected valid until: ${detectedUntil || "unknown"}
Currently in database until: ${knownUntil || "none"}
Repository: ${GITHUB_REPOSITORY}

Tasks:
1. Use GitHub tools to check if catalogues/zambia/ already has a recent PDF for ${store.name}
2. If a new PDF is needed, create or update a file at catalogues/zambia/${store.name.replace(/\s+/g, "")}_<StartDate>_<EndDate>.pdf
   - If you cannot download the PDF directly, document the URL in the commit message
3. Use Neon tools to verify the catalogues table for ${store.name}
4. Summarise what you did in plain text

Return a one-line status starting with DONE: or SKIP: or ERROR:`;

          const { text } = await agentLoop(agentPrompt, {
            system:
              "You automate Zambian grocery catalogue ingestion for SmartTroli. Use GitHub MCP for repo file operations and Neon MCP for database queries.",
            mcpClients,
          });

          detail += ` | agent: ${text.slice(0, 500)}`;

          const triggered = await triggerProcessPdfsWorkflow();
          if (triggered) detail += " | workflow dispatched";
        }
      } catch (err) {
        result = "error";
        detail = err.message;
        console.error(`  ✗ ${err.message}`);
      }

      await sql`
        INSERT INTO monitor_log (store_name, url_checked, result, detail)
        VALUES (${store.name}, ${store.url}, ${result}, ${detail})
      `;

      results.push({ store: store.name, url: store.url, result, detail });
      await sleep(1500);
    }
  } finally {
    if (mcpClients) await closeMcpClients(mcpClients);
  }

  return results;
}
