// app/api/alerts/[id]/route.js
import { NextResponse } from "next/server";
import { getSql, ensurePriceAlertsTable } from "../../../lib/db";

export async function DELETE(req, { params }) {
  const { id: idParam } = await params;
  const id = Number(idParam);

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id must be a positive integer" }, { status: 400 });
  }

  try {
    const sql = getSql();
    await ensurePriceAlertsTable(sql);

    const rows = await sql`DELETE FROM price_alerts WHERE id = ${id} RETURNING id`;
    if (rows.length === 0) {
      return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: id });
  } catch (err) {
    console.error("Alert delete failed:", err);
    return NextResponse.json({ error: "Failed to delete alert" }, { status: 500 });
  }
}
