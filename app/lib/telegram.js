// app/lib/telegram.js
// Thin wrapper around the Telegram Bot API for price-alert notifications.

export async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("Telegram not configured — TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing");
    return { ok: false, error: "not_configured" };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.error("Telegram send failed:", data.description || res.status);
      return { ok: false, error: data.description || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("Telegram send error:", err.message);
    return { ok: false, error: err.message };
  }
}
