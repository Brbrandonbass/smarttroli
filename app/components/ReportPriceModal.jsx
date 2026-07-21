"use client";

import { useState } from "react";

export const ZAMBIA_STORES = ["Shoprite", "Choppies", "Pick n Pay", "Game", "Spar", "Woolworths"];

export default function ReportPriceModal({ productName, defaultStore, onClose, onSubmitted }) {
  const [store, setStore] = useState(defaultStore && ZAMBIA_STORES.includes(defaultStore) ? defaultStore : ZAMBIA_STORES[0]);
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setError(null);
    const numPrice = Number(price);
    if (!price || !Number.isFinite(numPrice)) {
      setError("Enter a valid price");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/community/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_name: store,
          product_name: productName,
          price: numPrice,
          location: location.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong — try again");
        setSubmitting(false);
        return;
      }
      onSubmitted(data.price);
    } catch {
      setError("Network error — try again");
      setSubmitting(false);
    }
  }

  const fieldStyle = {
    width: "100%",
    padding: "12px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.06)",
    border: "1.5px solid rgba(255,255,255,0.1)",
    color: "#F5F0E8",
    fontSize: "15px",
    marginBottom: "14px",
    outline: "none",
  };
  const labelStyle = { display: "block", fontSize: "12px", color: "rgba(245,240,232,0.5)", marginBottom: "6px" };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#132615",
          border: "1px solid rgba(59,130,246,0.3)",
          borderRadius: "20px 20px 0 0",
          padding: "20px",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#3B82F6", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700 }}>
              📍 Report a price
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#F5F0E8", marginTop: "2px" }}>{productName}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              color: "rgba(255,255,255,0.4)",
              fontSize: "22px",
              cursor: "pointer",
              lineHeight: 1,
              padding: "10px",
              margin: "-10px -10px 0 0",
              minWidth: "44px",
              minHeight: "44px",
            }}
          >
            ×
          </button>
        </div>

        <label style={labelStyle}>Store</label>
        <select value={store} onChange={(e) => setStore(e.target.value)} style={fieldStyle}>
          {ZAMBIA_STORES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label style={labelStyle}>Price (Kwacha)</label>
        <input
          type="number"
          inputMode="decimal"
          min="1"
          max="5000"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="e.g. 165"
          style={fieldStyle}
        />

        <label style={labelStyle}>Branch / Location (optional)</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Manda Hill"
          maxLength={200}
          style={fieldStyle}
        />

        {error && (
          <div
            style={{
              background: "rgba(255,50,50,0.1)",
              border: "1px solid rgba(255,50,50,0.3)",
              borderRadius: "10px",
              padding: "10px 12px",
              marginBottom: "14px",
              color: "#FF6B6B",
              fontSize: "13px",
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "12px",
            border: "none",
            background: submitting ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #2563EB, #3B82F6)",
            color: "#fff",
            fontSize: "15px",
            fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting..." : "Submit price"}
        </button>
      </div>
    </div>
  );
}
