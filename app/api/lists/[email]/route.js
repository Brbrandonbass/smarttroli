// app/api/lists/[email]/route.js
import { NextResponse } from "next/server";
import { getSql, ensureShoppingListsTable, isValidEmail } from "../../../lib/db";
import { getBestPrice } from "../../../lib/prices";

export async function GET(req, { params }) {
  const { email: emailParam } = await params;
  const email = decodeURIComponent(emailParam || "").trim().toLowerCase();

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  try {
    const sql = getSql();
    await ensureShoppingListsTable(sql);

    const rows = await sql`
      SELECT sl.id, sl.name, sl.items, sl.updated_at
      FROM shopping_lists sl
      JOIN users u ON u.id = sl.user_id
      WHERE u.email = ${email}
      ORDER BY sl.updated_at DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ list: null });
    }

    const list = rows[0];
    const items = Array.isArray(list.items) ? list.items : [];

    const priced = await Promise.all(
      items.map(async (name) => {
        const best = await getBestPrice(sql, name, null);
        return { name, bestPrice: best?.price ?? null, bestStore: best?.store ?? null };
      })
    );

    const total = priced.reduce((sum, p) => sum + (p.bestPrice ?? 0), 0);

    return NextResponse.json({
      list: { id: list.id, name: list.name, items, updated_at: list.updated_at },
      itemPrices: priced,
      total,
    });
  } catch (err) {
    console.error("List fetch failed:", err);
    return NextResponse.json({ error: "Failed to fetch list" }, { status: 500 });
  }
}
