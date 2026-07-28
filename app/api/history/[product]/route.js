// app/api/history/[product]/route.js
import { NextResponse } from "next/server";
import { getSql, ensurePriceHistoryTable } from "../../../lib/db";

export async function GET(req, { params }) {
  const { product: productParam } = await params;
  const product = decodeURIComponent(productParam || "").trim();
  const { searchParams } = new URL(req.url);
  const store = (searchParams.get("store") || "").trim();

  if (!product) {
    return NextResponse.json({ error: "product is required" }, { status: 400 });
  }

  try {
    const sql = getSql();
    await ensurePriceHistoryTable(sql);
    const pattern = `%${product}%`;

    const rows = store
      ? await sql`
          SELECT product_name, store_name, price, source, recorded_at
          FROM price_history
          WHERE product_name ILIKE ${pattern} AND store_name = ${store}
          ORDER BY recorded_at ASC
          LIMIT 200
        `
      : await sql`
          SELECT product_name, store_name, price, source, recorded_at
          FROM price_history
          WHERE product_name ILIKE ${pattern}
          ORDER BY recorded_at ASC
          LIMIT 200
        `;

    return NextResponse.json({ history: rows });
  } catch (err) {
    console.error("Price history lookup failed:", err);
    return NextResponse.json({ error: "Failed to fetch price history" }, { status: 500 });
  }
}
