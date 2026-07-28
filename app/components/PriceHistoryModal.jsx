"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function PriceHistoryModal({ productName, defaultStore, onClose }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const url = `/api/history/${encodeURIComponent(productName)}${defaultStore ? `?store=${encodeURIComponent(defaultStore)}` : ""}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) { setError(data.error); return; }
        setHistory(data.history || []);
      })
      .catch(() => { if (!cancelled) setError("Network error — try again"); });
    return () => { cancelled = true; };
  }, [productName, defaultStore]);

  const chartData = (history || []).map((h) => ({
    date: formatDate(h.recorded_at),
    price: Number(h.price),
    store: h.store_name,
  }));

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#132615", border: "1px solid rgba(255,215,0,0.3)", borderRadius: "20px 20px 0 0",
          padding: "20px", width: "100%", maxWidth: "480px", maxHeight: "85vh", overflowY: "auto",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#FFD700", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
              📊 Price history
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#F5F0E8", marginTop: "2px" }}>{productName}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "22px",
              cursor: "pointer", lineHeight: 1, padding: "10px", margin: "-10px -10px 0 0", minWidth: "44px", minHeight: "44px",
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{ background: "rgba(255,50,50,0.1)", border: "1px solid rgba(255,50,50,0.3)", borderRadius: "10px", padding: "10px 12px", color: "#FF6B6B", fontSize: "13px" }}>
            {error}
          </div>
        )}

        {!error && history === null && (
          <div style={{ fontSize: "13px", color: "rgba(245,240,232,0.4)", padding: "20px 0", textAlign: "center" }}>Loading...</div>
        )}

        {!error && history !== null && history.length < 2 && (
          <div style={{ fontSize: "13px", color: "rgba(245,240,232,0.5)", padding: "24px 0", textAlign: "center" }}>
            📉 Not enough history yet — check back after the next catalogue update.
          </div>
        )}

        {!error && history !== null && history.length >= 2 && (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="date" stroke="rgba(245,240,232,0.4)" fontSize={11} />
                <YAxis stroke="rgba(245,240,232,0.4)" fontSize={11} tickFormatter={(v) => `K${v}`} />
                <Tooltip
                  contentStyle={{ background: "#0D1B0F", border: "1px solid rgba(255,215,0,0.3)", borderRadius: "8px", fontSize: "12px" }}
                  labelStyle={{ color: "#F5F0E8" }}
                  formatter={(value, _name, props) => [`K${Number(value).toFixed(2)}`, props.payload.store]}
                />
                <Line type="monotone" dataKey="price" stroke="#FFD700" strokeWidth={2} dot={{ r: 3, fill: "#FF6B00" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
