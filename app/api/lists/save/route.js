// app/api/lists/save/route.js
import { NextResponse } from "next/server";
import { getSql, ensureShoppingListsTable, upsertUserByEmail, isValidEmail } from "../../../lib/db";

function sanitizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((i) => (typeof i === "string" ? i.trim() : ""))
    .filter((i) => i.length > 0 && i.length <= 100)
    .slice(0, 50);
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const items = sanitizeItems(body.items);

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
  }

  try {
    const sql = getSql();
    await ensureShoppingListsTable(sql);

    const userId = await upsertUserByEmail(sql, email);
    const itemsJson = JSON.stringify(items);

    const existing = await sql`SELECT id FROM shopping_lists WHERE user_id = ${userId} LIMIT 1`;

    const rows = existing.length > 0
      ? await sql`
          UPDATE shopping_lists
          SET items = ${itemsJson}::jsonb, updated_at = NOW()
          WHERE id = ${existing[0].id}
          RETURNING id, name, items, updated_at
        `
      : await sql`
          INSERT INTO shopping_lists (user_id, items)
          VALUES (${userId}, ${itemsJson}::jsonb)
          RETURNING id, name, items, updated_at
        `;

    return NextResponse.json({ list: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("List save failed:", err);
    return NextResponse.json({ error: "Failed to save list" }, { status: 500 });
  }
}
