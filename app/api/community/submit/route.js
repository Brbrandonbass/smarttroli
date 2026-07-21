// app/api/community/submit/route.js
import { NextResponse } from "next/server";
import { getSql, ensureCommunityPricesTable, ZAMBIA_STORES } from "../../../lib/db";

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

  const store_name = sanitizeText(body.store_name, 100);
  const product_name = sanitizeText(body.product_name, 200);
  const unit = body.unit ? sanitizeText(body.unit, 50) : null;
  const location = body.location ? sanitizeText(body.location, 200) : null;
  const price = Number(body.price);

  if (!store_name) {
    return NextResponse.json({ error: "Store is required" }, { status: 400 });
  }
  if (!ZAMBIA_STORES.includes(store_name)) {
    return NextResponse.json(
      { error: `Store must be one of: ${ZAMBIA_STORES.join(", ")}` },
      { status: 400 }
    );
  }
  if (!product_name) {
    return NextResponse.json({ error: "Product name is required" }, { status: 400 });
  }
  if (!Number.isFinite(price)) {
    return NextResponse.json({ error: "Price must be a number" }, { status: 400 });
  }
  if (price < MIN_PRICE || price > MAX_PRICE) {
    return NextResponse.json(
      { error: `Price must be between K${MIN_PRICE} and K${MAX_PRICE}` },
      { status: 400 }
    );
  }

  try {
    const sql = getSql();
    await ensureCommunityPricesTable(sql);

    const rows = await sql`
      INSERT INTO community_prices (store_name, product_name, price, unit, location)
      VALUES (${store_name}, ${product_name}, ${price}, ${unit}, ${location})
      RETURNING id, store_name, product_name, price, unit, location, submitted_by,
                verified, upvotes, downvotes, source, valid_from, valid_until, created_at
    `;

    return NextResponse.json({ price: rows[0] }, { status: 201 });
  } catch (err) {
    console.error("Community submit failed:", err);
    return NextResponse.json({ error: "Failed to save price" }, { status: 500 });
  }
}
