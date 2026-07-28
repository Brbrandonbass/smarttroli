// app/api/alerts/create/route.js
import { NextResponse } from "next/server";
import { getSql, ensurePriceAlertsTable, upsertUserByEmail, isValidEmail } from "../../../lib/db";

const MIN_PRICE = 1;
const MAX_PRICE = 5000;

function sanitizeText(value, maxLen) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = sanitizeText(body.email, 200).toLowerCase();
  const product_name = sanitizeText(body.product_name, 200);
  const store_name = body.store_name ? sanitizeText(body.store_name, 100) : null;
  const target_price = Number(body.target_price);

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!product_name) {
    return NextResponse.json({ error: "Product name is required" }, { status: 400 });
  }
  if (!Number.isFinite(target_price) || target_price < MIN_PRICE || target_price > MAX_PRICE) {
    return NextResponse.json(
      { error: `Target price must be between K${MIN_PRICE} and K${MAX_PRICE}` },
      { status: 400 }
    );
  }

  try {
    const sql = getSql();
    await ensurePriceAlertsTable(sql);

    const userId = await upsertUserByEmail(sql, email);

    const rows = await sql`
      INSERT INTO price_alerts (user_id, product_name, store_name, target_price)
      VALUES (${userId}, ${product_name}, ${store_name}, ${target_price})
      RETURNING id, user_id, product_name, store_name, target_price, triggered, created_at
    `;

    return NextResponse.json({ alert: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("Alert create failed:", err);
    return NextResponse.json({ error: "Failed to create alert" }, { status: 500 });
  }
}
