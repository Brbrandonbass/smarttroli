"use client";

import { useEffect, useState } from "react";

// There's no callable API for this — publicholiday.today
// (github.com/Brbrandonbass/publicholiday-today) is a static page whose own
// client-side JS uses the Nager.Date API for most countries but falls back
// to this exact hardcoded list + Easter calculation for Zambia, since
// Nager.Date doesn't cover Zambia at all. Ported directly from its index.html
// rather than calling a nonexistent endpoint.
function getEasterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day); // Easter Sunday
}

function easterOffset(year, days) {
  const e = getEasterDate(year);
  const d = new Date(e.getTime() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getZambiaHolidays(year) {
  return [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: `${year}-03-09`, name: "International Women's Day" },
    { date: `${year}-03-12`, name: "Youth Day" },
    { date: easterOffset(year, -2), name: "Good Friday" },
    { date: easterOffset(year, -1), name: "Holy Saturday" },
    { date: easterOffset(year, 1), name: "Easter Monday" },
    { date: `${year}-04-28`, name: "Kenneth Kaunda Day" },
    { date: `${year}-05-01`, name: "Labour Day" },
    { date: `${year}-05-25`, name: "Africa Freedom Day" },
    { date: `${year}-07-06`, name: "Heroes Day" },
    { date: `${year}-07-07`, name: "Unity Day" },
    { date: `${year}-08-03`, name: "Farmers Day" },
    { date: `${year}-10-19`, name: "National Prayer Day" },
    { date: `${year}-10-24`, name: "Independence Day" },
    { date: `${year}-12-25`, name: "Christmas Day" },
  ];
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CACHE_KEY = "smarttroli_holiday_check";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DISMISS_PREFIX = "smarttroli_holiday_dismissed_";

export default function HolidayBanner() {
  const [holiday, setHoliday] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const today = todayISO();
      if (localStorage.getItem(DISMISS_PREFIX + today) === "true") return;

      const cachedRaw = localStorage.getItem(CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw);
        if (cached.date === today && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
          if (cached.holiday) setHoliday(cached.holiday);
          return;
        }
      }

      const holidays = getZambiaHolidays(new Date().getFullYear());
      const match = holidays.find((h) => h.date === today) || null;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ checkedAt: Date.now(), date: today, holiday: match }));
      if (match) setHoliday(match);
    } catch {
      // Show nothing on any failure (malformed/blocked localStorage, etc).
    }
  }, []);

  if (!holiday || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_PREFIX + todayISO(), "true"); } catch { /* ignore */ }
  }

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #FF6B00, #F97316 55%, #FFD700)",
        color: "#0D1B0F",
        padding: "12px 44px 12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        flexWrap: "wrap",
        fontSize: "13.5px",
        fontWeight: 700,
        textAlign: "center",
        position: "relative",
        boxShadow: "0 2px 16px rgba(249,115,22,0.35)",
      }}
    >
      <span>
        🎉 Today is <strong>{holiday.name}</strong> — stores may have reduced hours
      </span>
      <a
        href="https://publicholiday.today"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "#0D1B0F",
          fontWeight: 800,
          whiteSpace: "nowrap",
          background: "rgba(13,27,15,0.14)",
          padding: "4px 12px",
          borderRadius: "20px",
          fontSize: "12.5px",
          textDecoration: "none",
        }}
      >
        publicholiday.today ↗
      </a>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: "rgba(13,27,15,0.18)", border: "none", borderRadius: "50%",
          width: "24px", height: "24px", color: "#0D1B0F", fontSize: "17px",
          cursor: "pointer", lineHeight: 1, position: "absolute", right: "12px", top: "50%",
          transform: "translateY(-50%)", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        ×
      </button>
    </div>
  );
}
