"use client";

import { useEffect, useState } from "react";

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function LivePricesFeed({ refreshKey }) {
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/community/recent")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setRecent((data.recent || []).slice(0, 10));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (!loading && recent.length === 0) return null;

  return (
    <div
      style={{
        background: "rgba(37,99,235,0.06)",
        border: "1px solid rgba(59,130,246,0.2)",
        borderRadius: "14px",
        padding: "16px",
        marginBottom: "12px",
      }}
    >
      <div style={{ fontSize: "11px", fontWeight: 700, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "12px" }}>
        📡 Live Prices — reported by shoppers
      </div>
      {loading ? (
        <div style={{ fontSize: "13px", color: "rgba(245,240,232,0.4)" }}>Loading...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          {recent.map((r) => (
            <div key={r.id} style={{ fontSize: "13px", color: "rgba(245,240,232,0.8)", lineHeight: 1.4 }}>
              <strong style={{ color: "#F5F0E8" }}>{r.product_name}</strong> — K{Number(r.price).toFixed(2)} at {r.store_name}
              {r.location ? ` ${r.location}` : ""}
              <span style={{ color: "rgba(245,240,232,0.35)" }}> · {timeAgo(r.created_at)}</span>
              {r.verified && (
                <span style={{ marginLeft: "6px", color: "#3B82F6", fontWeight: 700 }} title="Verified by 3+ upvotes">
                  ✓
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
