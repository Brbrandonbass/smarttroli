// TEMPORARY one-off cleanup route — deletes the "Mealie meal 5kg" price
// alerts that got stuck under the old exact-match logic (fixed in
// app/lib/prices.js) and can never match a real catalogue/community row
// since there's no mealie meal in the Choppies catalogue at all. Delete this
// file once run against production.
import { NextResponse } from "next/server";
import { getSql, ensurePriceAlertsTable } from "../../../lib/db";

export async function GET() {
  try {
    const sql = getSql();
    await ensurePriceAlertsTable(sql);
    const rows = await sql`
      DELETE FROM price_alerts WHERE product_name = 'Mealie meal 5kg' RETURNING id
    `;
    return NextResponse.json({ deleted: rows.map((r) => r.id) });
  } catch (err) {
    console.error("Cleanup failed:", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
