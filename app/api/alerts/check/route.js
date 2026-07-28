// app/api/alerts/check/route.js
// Called by the monitor.yml cron every 6 hours (and safe to hit manually/more
// often — already-triggered alerts are skipped, so repeat calls are idempotent).
import { NextResponse } from "next/server";
import { getSql, ensurePriceAlertsTable } from "../../../lib/db";
import { getBestPrice } from "../../../lib/prices";
import { sendTelegramMessage } from "../../../lib/telegram";

export async function GET() {
  try {
    const sql = getSql();
    await ensurePriceAlertsTable(sql);

    const alerts = await sql`
      SELECT id, user_id, product_name, store_name, target_price
      FROM price_alerts
      WHERE triggered = false
    `;

    const triggered = [];
    const errors = [];

    for (const alert of alerts) {
      try {
        const best = await getBestPrice(sql, alert.product_name, alert.store_name);

        if (best && best.price <= Number(alert.target_price)) {
          const message =
            `🛒 SmartTroli Alert: ${alert.product_name} is now K${best.price.toFixed(2)} ` +
            `at ${best.store} — below your target of K${Number(alert.target_price).toFixed(2)}`;
          const sent = await sendTelegramMessage(message);

          await sql`
            UPDATE price_alerts
            SET triggered = true, last_checked = NOW()
            WHERE id = ${alert.id}
          `;

          triggered.push({
            id: alert.id,
            product_name: alert.product_name,
            price: best.price,
            store: best.store,
            telegramSent: sent.ok,
            telegramError: sent.ok ? undefined : sent.error,
          });
        } else {
          await sql`UPDATE price_alerts SET last_checked = NOW() WHERE id = ${alert.id}`;
        }
      } catch (err) {
        console.error(`Alert ${alert.id} check failed:`, err);
        errors.push({ id: alert.id, error: err.message });
      }
    }

    return NextResponse.json({ checked: alerts.length, triggered, errors });
  } catch (err) {
    console.error("Alert check run failed:", err);
    return NextResponse.json({ error: "Failed to check alerts" }, { status: 500 });
  }
}
