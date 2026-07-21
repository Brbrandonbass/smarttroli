// app/api/community/vote/route.js
import { NextResponse } from "next/server";
import { getSql, ensureCommunityPricesTable } from "../../../lib/db";

const VERIFIED_THRESHOLD = 3;

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const id = Number(body.id);
  const vote = body.vote;

  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id must be a positive integer" }, { status: 400 });
  }
  if (vote !== "up" && vote !== "down") {
    return NextResponse.json({ error: "vote must be 'up' or 'down'" }, { status: 400 });
  }

  try {
    const sql = getSql();
    await ensureCommunityPricesTable(sql);

    // verified is derived in the same atomic UPDATE so concurrent votes can't race past the threshold unnoticed.
    const rows =
      vote === "up"
        ? await sql`
            UPDATE community_prices
            SET upvotes = upvotes + 1,
                verified = (upvotes + 1) >= ${VERIFIED_THRESHOLD}
            WHERE id = ${id}
            RETURNING id, store_name, product_name, price, upvotes, downvotes, verified
          `
        : await sql`
            UPDATE community_prices
            SET downvotes = downvotes + 1
            WHERE id = ${id}
            RETURNING id, store_name, product_name, price, upvotes, downvotes, verified
          `;

    if (rows.length === 0) {
      return NextResponse.json({ error: "Price report not found" }, { status: 404 });
    }

    return NextResponse.json({ price: rows[0] });
  } catch (err) {
    console.error("Community vote failed:", err);
    return NextResponse.json({ error: "Failed to record vote" }, { status: 500 });
  }
}
