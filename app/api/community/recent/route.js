// app/api/community/recent/route.js
import { NextResponse } from "next/server";
import { getSql, ensureCommunityPricesTable } from "../../../lib/db";

export async function GET() {
  try {
    const sql = getSql();
    await ensureCommunityPricesTable(sql);

    const rows = await sql`
      SELECT id, store_name, product_name, price, unit, location, verified,
             upvotes, downvotes, created_at
      FROM community_prices
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return NextResponse.json({ recent: rows });
  } catch (err) {
    console.error("Community recent lookup failed:", err);
    return NextResponse.json({ error: "Failed to fetch recent prices" }, { status: 500 });
  }
}
