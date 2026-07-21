// app/api/community/prices/route.js
import { NextResponse } from "next/server";
import { getSql, ensureCommunityPricesTable } from "../../../lib/db";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const product = (searchParams.get("product") || "").trim();

  if (!product) {
    return NextResponse.json({ error: "product query parameter is required" }, { status: 400 });
  }

  try {
    const sql = getSql();
    await ensureCommunityPricesTable(sql);

    const rows = await sql`
      SELECT id, store_name, product_name, price, unit, location, submitted_by,
             verified, upvotes, downvotes, source, valid_from, valid_until, created_at
      FROM community_prices
      WHERE product_name ILIKE ${`%${product}%`} AND valid_until > NOW()
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ prices: rows });
  } catch (err) {
    console.error("Community prices lookup failed:", err);
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500 });
  }
}
