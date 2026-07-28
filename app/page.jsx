// app/page.js
"use client";

import { useEffect, useState } from "react";
import ReportPriceModal from "./components/ReportPriceModal";
import PriceAlertModal from "./components/PriceAlertModal";
import ShoppingListEmailModal from "./components/ShoppingListEmailModal";
import PriceHistoryModal from "./components/PriceHistoryModal";
import LivePricesFeed from "./components/LivePricesFeed";

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function parsePrice(price) {
  if (price === null || price === undefined) return null;
  const cleaned = String(price).replace(/K/gi, "").replace(/,/g, "").replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function findCheapest(results) {
  return results.map((item) => {
    let cheapest = null;
    (item.offers || []).forEach((o) => {
      const p = parsePrice(o.price);
      if (p === null) return;
      if (!cheapest || p < cheapest.price) cheapest = { ...o, price: p };
    });
    return { ...item, cheapest };
  });
}

function computeTotals(results) {
  let total = 0, maxTotal = 0;
  results.forEach((item) => {
    if (!item.cheapest) return;
    const prices = (item.offers || []).map((o) => parsePrice(o.price)).filter((p) => p !== null);
    total += item.cheapest.price;
    maxTotal += prices.length > 0 ? Math.max(...prices) : item.cheapest.price;
  });
  return { total, savings: maxTotal - total };
}

const STORES = [
  { name: "Shoprite",     color: "#E31837" },
  { name: "Pick n Pay",   color: "#0066CC" },
  { name: "Spar",         color: "#007A3D" },
  { name: "Choppies",     color: "#FF6B00" },
  { name: "Game",         color: "#003087" },
  { name: "Jumbo",        color: "#FFD700" },
];

const FILTER_STORES = ["All", "Shoprite", "Choppies", "Pick n Pay"];
const STORE_FILTER_KEY = "smarttroli_store_filter";

const QUICK_ITEMS = [
  "Mealie meal 5kg", "Bread", "Eggs 30s", "Chicken pieces",
  "Cooking oil 2L", "Sugar 2kg", "Rice 2kg", "Kapenta",
  "Tomatoes", "Onions", "Soap", "Washing powder",
];

// Zambian phrases
const SAVINGS_PHRASES = [
  "Chapwa! You save",
  "Eksay! You save",
  "Bwino sana! You save",
  "Chalo! You save",
];

export default function SmartTroli() {
  const [items, setItems] = useState([]);
  const [input, setInput] = useState("");
  const [results, setResults] = useState(null);
  const [totals, setTotals] = useState(null);
  const [optimalPlan, setOptimalPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState("");
  const [location, setLocation] = useState(null);
  const [suburb, setSuburb] = useState("");
  const [city, setCity] = useState("");
  const [manualArea, setManualArea] = useState("");
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationInput, setLocationInput] = useState("");
  const [apiError, setApiError] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);
  const [phase, setPhase] = useState("input");
  const [savingsPhrase] = useState(SAVINGS_PHRASES[Math.floor(Math.random() * SAVINGS_PHRASES.length)]);
  const [reportItem, setReportItem] = useState(null); // { productName, defaultStore } | null
  const [alertItem, setAlertItem] = useState(null); // { productName, defaultStore, defaultTargetPrice } | null
  const [listModalMode, setListModalMode] = useState(null); // "save" | "load" | null
  const [loadedListInfo, setLoadedListInfo] = useState(null); // { itemPrices, total } | null
  const [storeFilter, setStoreFilter] = useState("All");
  const [historyItem, setHistoryItem] = useState(null); // { productName, defaultStore } | null
  const [votedIds, setVotedIds] = useState(new Set());
  const [voteOverrides, setVoteOverrides] = useState({}); // { [communityId]: { upvotes, downvotes, verified } }
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("smarttroli_voted_prices") || "[]");
      setVotedIds(new Set(stored));
    } catch { /* ignore malformed/blocked localStorage */ }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORE_FILTER_KEY);
      if (stored && FILTER_STORES.includes(stored)) setStoreFilter(stored);
    } catch { /* ignore malformed/blocked localStorage */ }
  }, []);

  function selectStoreFilter(store) {
    setStoreFilter(store);
    try { localStorage.setItem(STORE_FILTER_KEY, store); } catch { /* ignore blocked localStorage */ }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  async function voteOnCommunityPrice(communityId, vote) {
    if (votedIds.has(communityId)) return;
    try {
      const res = await fetch("/api/community/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: communityId, vote }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setVoteOverrides(prev => ({ ...prev, [communityId]: data.price }));
      const next = new Set(votedIds);
      next.add(communityId);
      setVotedIds(next);
      try {
        localStorage.setItem("smarttroli_voted_prices", JSON.stringify([...next]));
      } catch { /* ignore */ }
    } catch { /* network error — silently no-op, button stays available to retry */ }
  }

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        setLocation({ lat, lon });
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
          const data = await res.json();
          const s = data.address?.suburb || data.address?.neighbourhood || data.address?.town || "";
          const c = data.address?.city || data.address?.state || "Zambia";
          setSuburb(s);
          setCity(c);
          setLocationInput(s || c);
        } catch { }
      },
      () => { }
    );
  }, []);

  function addItem(val) {
    const trimmed = (val || input).trim();
    if (!trimmed) return;
    const sanitized = trimmed.replace(/[^a-zA-Z0-9\s\-\.\,]/g, "").slice(0, 100);
    if (!sanitized || items.find(i => i.toLowerCase() === sanitized.toLowerCase())) return;
    setItems(prev => [...prev, sanitized]);
    setInput("");
    setApiError(null);
    setLoadedListInfo(null);
  }

  function removeItem(idx) { setItems(items.filter((_, i) => i !== idx)); setLoadedListInfo(null); }

  async function analyze() {
    if (items.length === 0) { setApiError("Add at least one item first!"); return; }
    setLoading(true);
    setApiError(null);
    setResults(null);

    const stages = [
      "Checking Shoprite Zambia...",
      "Checking Choppies & Spar...",
      "Scanning all stores...",
      "Finding best deals...",
    ];
    let si = 0;
    setLoadingStage(stages[0]);
    const t = setInterval(() => { si = (si + 1) % stages.length; setLoadingStage(stages[si]); }, 2500);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, location, manualArea: manualArea || suburb || city, suburb, city }),
      });
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      if (!data.results) throw new Error("No results returned");
      const enriched = findCheapest(data.results);
      const computed = computeTotals(enriched);
      setResults(enriched);
      setTotals({ ...computed, tip: data.tip, specialsFound: data.specialsFound || 0 });
      setOptimalPlan(data.optimalPlan || null);
      setPhase("results");
    } catch (err) {
      setApiError(err.message || "Something went wrong. Try again!");
    } finally {
      clearInterval(t);
      setLoading(false);
    }
  }

  function reset() {
    setPhase("input"); setResults(null); setTotals(null);
    setOptimalPlan(null); setItems([]); setApiError(null); setExpandedItem(null);
  }

  const areaDisplay = manualArea || suburb || city || "Zambia";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0D1B0F",
      fontFamily: "'Segoe UI', -apple-system, sans-serif",
      color: "#F5F0E8",
    }}>

      {/* ── NAV ── */}
      <nav style={{
        background: "rgba(13,27,15,0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,165,0,0.2)",
        padding: "0 20px",
        height: "60px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px", height: "36px",
            background: "linear-gradient(135deg, #FF6B00, #FFD700)",
            borderRadius: "10px",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "18px",
          }}>🛒</div>
          <div>
            <span style={{ fontSize: "18px", fontWeight: "800", color: "#FFD700", letterSpacing: "-0.5px" }}>Smart</span>
            <span style={{ fontSize: "18px", fontWeight: "800", color: "#FF6B00", letterSpacing: "-0.5px" }}>Troli</span>
            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginLeft: "6px" }}>🇿🇲 Zambia</span>
          </div>
        </div>
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", background: "rgba(255,165,0,0.1)", border: "1px solid rgba(255,165,0,0.2)", padding: "4px 10px", borderRadius: "20px" }}>
          ZMW Kwacha
        </div>
      </nav>

      {phase === "input" && (
        <>
          {/* ── HERO ── */}
          <div style={{
            background: "linear-gradient(180deg, #1A3A1F 0%, #0D1B0F 100%)",
            padding: "36px 20px 32px",
            textAlign: "center",
            borderBottom: "1px solid rgba(255,165,0,0.15)",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Decorative circles */}
            <div style={{ position: "absolute", top: "-40px", right: "-40px", width: "160px", height: "160px", background: "rgba(255,107,0,0.08)", borderRadius: "50%" }} />
            <div style={{ position: "absolute", bottom: "-30px", left: "-30px", width: "120px", height: "120px", background: "rgba(255,215,0,0.06)", borderRadius: "50%" }} />

            <div style={{ position: "relative" }}>
              <div style={{ fontSize: "12px", color: "#FFD700", letterSpacing: "3px", textTransform: "uppercase", marginBottom: "10px", opacity: 0.8 }}>
                🇿🇲 Zambia's Smart Shopping App
              </div>
              <h1 style={{
                margin: "0 0 8px",
                fontSize: "clamp(26px, 6vw, 42px)",
                fontWeight: "900",
                color: "#F5F0E8",
                letterSpacing: "-1px",
                lineHeight: 1.1,
              }}>
                Save More<br />
                <span style={{ color: "#FFD700" }}>Every Week</span>
              </h1>
              <p style={{ color: "rgba(245,240,232,0.55)", margin: "0 0 22px", fontSize: "14px" }}>
                Find the best deals across Zambian stores
              </p>

              {/* Store pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" }}>
                {STORES.map(s => (
                  <span key={s.name} style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "20px",
                    padding: "4px 12px",
                    fontSize: "11px",
                    color: "rgba(245,240,232,0.75)",
                    fontWeight: "500",
                  }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ maxWidth: "600px", margin: "0 auto", padding: "16px 16px 80px" }}>

            <LivePricesFeed refreshKey={feedRefreshKey} />

            {/* ── LOCATION ── */}
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,215,0,0.15)",
              borderRadius: "14px",
              padding: "14px 16px",
              marginBottom: "12px",
            }}>
              {editingLocation ? (
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    value={locationInput}
                    onChange={e => setLocationInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { setManualArea(locationInput); setEditingLocation(false); }
                      if (e.key === "Escape") setEditingLocation(false);
                    }}
                    placeholder="Enter your area (e.g. Lusaka, Ndola...)"
                    autoFocus
                    style={{
                      flex: 1, background: "rgba(255,255,255,0.08)",
                      border: "1.5px solid #FFD700", borderRadius: "8px",
                      padding: "8px 12px", fontSize: "14px", color: "#F5F0E8", outline: "none",
                    }}
                  />
                  <button onClick={() => { setManualArea(locationInput); setEditingLocation(false); }}
                    style={{ background: "#FFD700", border: "none", borderRadius: "8px", padding: "8px 14px", color: "#0D1B0F", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                    Save
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "20px" }}>📍</span>
                    <div>
                      <div style={{ fontSize: "11px", color: "rgba(245,240,232,0.4)", marginBottom: "1px" }}>Your location</div>
                      <div style={{ fontSize: "15px", fontWeight: "600", color: areaDisplay !== "Zambia" ? "#F5F0E8" : "rgba(245,240,232,0.3)" }}>
                        {areaDisplay !== "Zambia" ? areaDisplay : "Detecting..."}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => { setEditingLocation(true); setLocationInput(areaDisplay); }}
                    style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: "8px", padding: "6px 12px", fontSize: "12px", color: "#FFD700", cursor: "pointer" }}>
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* ── SHOPPING LIST ── */}
            <div style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "14px",
              padding: "16px",
              marginBottom: "12px",
            }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#FF6B00", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "12px" }}>
                🛒 Your Shopping List
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addItem()}
                  placeholder="e.g. Mealie meal, chicken, bread..."
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "1.5px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px",
                    padding: "12px 14px",
                    fontSize: "15px",
                    color: "#F5F0E8",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = "#FFD700"}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                />
                <button onClick={() => addItem()}
                  style={{
                    background: "linear-gradient(135deg, #FF6B00, #FFD700)",
                    border: "none", borderRadius: "10px",
                    width: "48px", height: "48px",
                    color: "#0D1B0F", fontSize: "24px",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, fontWeight: "700",
                  }}>+</button>
              </div>

              {/* Quick add */}
              <div style={{ marginBottom: items.length > 0 ? "14px" : "0" }}>
                <div style={{ fontSize: "10px", color: "rgba(245,240,232,0.3)", marginBottom: "8px", letterSpacing: "1px" }}>QUICK ADD:</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {QUICK_ITEMS.filter(q => !items.find(i => i.toLowerCase().includes(q.split(" ")[0].toLowerCase()))).slice(0, 8).map((q, i) => (
                    <button key={i} onClick={() => addItem(q)}
                      style={{
                        background: "rgba(255,107,0,0.1)",
                        border: "1px solid rgba(255,107,0,0.25)",
                        borderRadius: "20px",
                        padding: "5px 12px",
                        fontSize: "12px",
                        color: "rgba(245,240,232,0.7)",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { e.target.style.background = "#FF6B00"; e.target.style.color = "#fff"; }}
                      onMouseLeave={e => { e.target.style.background = "rgba(255,107,0,0.1)"; e.target.style.color = "rgba(245,240,232,0.7)"; }}>
                      + {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items list */}
              {items.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {items.map((item, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "10px", padding: "10px 12px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                          width: "22px", height: "22px",
                          background: "linear-gradient(135deg, #FF6B00, #FFD700)",
                          borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "10px", color: "#0D1B0F", fontWeight: "800", flexShrink: 0,
                        }}>{i + 1}</div>
                        <span style={{ fontSize: "14px", fontWeight: "500", color: "#F5F0E8" }}>{item}</span>
                      </div>
                      <button onClick={() => removeItem(i)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.2)", fontSize: "20px", lineHeight: 1 }}
                        onMouseEnter={e => e.target.style.color = "#FF6B00"}
                        onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.2)"}>×</button>
                    </div>
                  ))}
                </div>
              )}

              {loadedListInfo && items.length > 0 && (
                <div style={{
                  marginTop: "12px", background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)",
                  borderRadius: "10px", padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontSize: "12px", color: "rgba(245,240,232,0.6)" }}>Estimated total (best prices)</span>
                  <span style={{ fontSize: "16px", fontWeight: 800, color: "#FFD700" }}>K{loadedListInfo.total.toFixed(2)}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button
                  onClick={() => {
                    if (items.length === 0) { setApiError("Add at least one item before saving!"); return; }
                    setListModalMode("save");
                  }}
                  style={{
                    flex: 1, background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.3)",
                    borderRadius: "10px", padding: "8px 10px", fontSize: "12px", color: "#FFD700", cursor: "pointer", fontWeight: 600,
                  }}
                >
                  💾 Save List
                </button>
                <button
                  onClick={() => setListModalMode("load")}
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "10px", padding: "8px 10px", fontSize: "12px", color: "rgba(245,240,232,0.8)", cursor: "pointer", fontWeight: 600,
                  }}
                >
                  📥 Load my list
                </button>
              </div>
            </div>

            {apiError && (
              <div style={{ background: "rgba(255,50,50,0.1)", border: "1px solid rgba(255,50,50,0.3)", borderRadius: "10px", padding: "12px 14px", marginBottom: "12px", color: "#FF6B6B", fontSize: "13px" }}>
                {apiError}
              </div>
            )}

            {/* ── SEARCH BUTTON ── */}
            <button onClick={analyze} disabled={items.length === 0 || loading}
              style={{
                width: "100%", padding: "18px",
                background: items.length > 0 && !loading
                  ? "linear-gradient(135deg, #FF6B00 0%, #FFD700 100%)"
                  : "rgba(255,255,255,0.06)",
                border: "none", borderRadius: "14px",
                color: items.length > 0 && !loading ? "#0D1B0F" : "rgba(245,240,232,0.2)",
                fontSize: "16px", fontWeight: "800",
                cursor: items.length > 0 && !loading ? "pointer" : "not-allowed",
                letterSpacing: "-0.3px",
                boxShadow: items.length > 0 && !loading ? "0 4px 24px rgba(255,107,0,0.4)" : "none",
                transition: "all 0.2s",
              }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                  {loadingStage}
                </span>
              ) : items.length === 0 ? "Add items to get started" : `🔍 Find Best Deals in ${areaDisplay}`}
            </button>
          </div>
        </>
      )}

      {/* ── RESULTS ── */}
      {phase === "results" && results && totals && (
        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "16px 16px 80px" }}>

          {/* Savings hero */}
          <div style={{
            background: "linear-gradient(135deg, #1A3A1F, #0D2B12)",
            border: "1px solid rgba(255,215,0,0.2)",
            borderRadius: "18px",
            padding: "24px 20px",
            marginBottom: "16px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, #FF6B00, #FFD700, #FF6B00)" }} />
            <div style={{ fontSize: "12px", color: "rgba(245,240,232,0.5)", letterSpacing: "2px", marginBottom: "4px", textTransform: "uppercase" }}>{savingsPhrase}</div>
            <div style={{ fontSize: "clamp(48px, 14vw, 72px)", fontWeight: "900", color: "#FFD700", lineHeight: 1, letterSpacing: "-2px" }}>
              K{totals.savings.toFixed(2)}
            </div>
            <div style={{ fontSize: "14px", color: "rgba(245,240,232,0.5)", marginTop: "6px" }}>
              Optimal basket: <strong style={{ color: "#F5F0E8" }}>K{totals.total.toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
              <span style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.25)", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", color: "#FFD700" }}>
                📍 {areaDisplay}
              </span>
              {totals.specialsFound > 0 && (
                <span style={{ background: "rgba(255,107,0,0.15)", border: "1px solid rgba(255,107,0,0.3)", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", color: "#FF6B00" }}>
                  🏷️ {totals.specialsFound} special{totals.specialsFound !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {totals.tip && (
              <div style={{ marginTop: "12px", background: "rgba(255,255,255,0.05)", borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: "rgba(245,240,232,0.7)", fontStyle: "italic" }}>
                💡 {totals.tip}
              </div>
            )}
          </div>

          {/* Shopping plan */}
          {optimalPlan && optimalPlan.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#FF6B00", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "10px" }}>Shopping Plan</div>
              {optimalPlan.map((stop, i) => {
                const storeColor = STORES.find(s => stop.store?.includes(s.name))?.color || "#FF6B00";
                return (
                  <div key={i} style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid rgba(255,255,255,0.06)`,
                    borderLeft: `4px solid ${storeColor}`,
                    borderRadius: "14px", padding: "16px",
                    marginBottom: "10px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
                      <div>
                        <div style={{ fontSize: "16px", fontWeight: "700", color: "#F5F0E8" }}>{stop.branch || stop.store}</div>
                        <div style={{ fontSize: "12px", color: "rgba(245,240,232,0.4)", marginTop: "2px" }}>Stop {i + 1} of {optimalPlan.length}</div>
                      </div>
                      <div style={{ background: `${storeColor}20`, border: `1.5px solid ${storeColor}`, borderRadius: "10px", padding: "8px 14px", fontSize: "18px", fontWeight: "800", color: storeColor }}>
                        K{stop.subtotal?.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {stop.items?.map((item, j) => (
                        <span key={j} style={{ background: `${storeColor}15`, border: `1px solid ${storeColor}30`, borderRadius: "20px", padding: "4px 10px", fontSize: "12px", color: "rgba(245,240,232,0.8)" }}>{item}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)", borderRadius: "12px", padding: "14px 18px" }}>
                <div style={{ fontSize: "12px", color: "rgba(245,240,232,0.5)", textTransform: "uppercase", letterSpacing: "1px" }}>Total</div>
                <div style={{ fontSize: "28px", fontWeight: "900", color: "#FFD700", letterSpacing: "-1px" }}>K{totals.total.toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Price breakdown */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#FF6B00", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "10px" }}>Price Breakdown</div>

            {/* Store filter */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
              {FILTER_STORES.map(store => {
                const count = store === "All"
                  ? results.length
                  : results.filter(r => r.offers?.some(o => o.store?.includes(store))).length;
                const active = storeFilter === store;
                return (
                  <button key={store} onClick={() => selectStoreFilter(store)}
                    style={{
                      background: active ? "linear-gradient(135deg, #FF6B00, #FFD700)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${active ? "transparent" : "rgba(255,255,255,0.15)"}`,
                      borderRadius: "20px", padding: "6px 12px", fontSize: "12px", fontWeight: 700,
                      color: active ? "#0D1B0F" : "rgba(245,240,232,0.7)", cursor: "pointer", whiteSpace: "nowrap",
                    }}>
                    {store} <span style={{ opacity: 0.7 }}>({count})</span>
                  </button>
                );
              })}
            </div>

            {results
              .map((item, i) => ({ item, i }))
              .filter(({ item }) => storeFilter === "All" || item.offers?.some(o => o.store?.includes(storeFilter)))
              .map(({ item, i }) => {
              const isExpanded = expandedItem === i;
              const filteredOffer = storeFilter === "All" ? null : (() => {
                const o = item.offers?.find(x => x.store?.includes(storeFilter));
                if (!o) return null;
                const p = parsePrice(o.price);
                return p !== null ? { ...o, price: p } : null;
              })();
              const displayOffer = filteredOffer || item.cheapest;
              const hasSpecial = storeFilter === "All"
                ? item.offers?.some(o => o.onSpecial)
                : !!filteredOffer?.onSpecial;
              return (
                <div key={i} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", marginBottom: "8px", overflow: "hidden" }}>
                  <div onClick={() => setExpandedItem(isExpanded ? null : i)}
                    style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "3px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "600", color: "#F5F0E8" }}>{item.name}</span>
                        {hasSpecial && <span style={{ fontSize: "10px", background: "rgba(255,215,0,0.15)", border: "1px solid rgba(255,215,0,0.3)", color: "#FFD700", borderRadius: "10px", padding: "1px 7px", fontWeight: "700" }}>🏷️ SPECIAL</span>}
                      </div>
                      {item.searchTerm && item.searchTerm.toLowerCase() !== item.name.toLowerCase() && (
                        <div style={{ fontSize: "10px", color: "rgba(245,240,232,0.35)", marginBottom: "3px" }}>
                          for &ldquo;{item.searchTerm}&rdquo;
                        </div>
                      )}
                      {displayOffer && (
                        <div style={{ fontSize: "12px", color: "#FF6B00", fontWeight: "500" }}>
                          {displayOffer.note && displayOffer.note.toLowerCase() !== item.name.toLowerCase() && (
                            <div style={{ fontSize: "11px", color: "rgba(245,240,232,0.5)", fontWeight: "400", marginBottom: "1px" }}>{displayOffer.note}</div>
                          )}
                          {filteredOffer ? "" : "Best: "}K{displayOffer.price.toFixed(2)} at {displayOffer.store}
                          <span style={{ color: "rgba(245,240,232,0.3)", fontWeight: "400" }}> · {displayOffer.source || "Est. price"}</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAlertItem({
                            // Use the actual catalogue/community product name
                            // (e.g. "Akshaya Parboiled Rice 5kg") rather than
                            // the user's search term (e.g. "Mealie meal 5kg")
                            // so /api/alerts/check can match it back to a
                            // real catalogue_prices/community_prices row.
                            productName: displayOffer?.note || item.name,
                            defaultStore: displayOffer?.store,
                            defaultTargetPrice: displayOffer?.price,
                          });
                        }}
                        aria-label="Set price alert"
                        style={{
                          background: "rgba(255,215,0,0.12)",
                          border: "1px solid rgba(255,215,0,0.35)",
                          borderRadius: "20px",
                          padding: "5px 10px",
                          fontSize: "11px",
                          color: "#FFD700",
                          cursor: "pointer",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        🔔
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryItem({ productName: item.name, defaultStore: displayOffer?.store });
                        }}
                        aria-label="Price history"
                        style={{
                          background: "rgba(168,85,247,0.12)",
                          border: "1px solid rgba(168,85,247,0.35)",
                          borderRadius: "20px",
                          padding: "5px 10px",
                          fontSize: "11px",
                          color: "#A855F7",
                          cursor: "pointer",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        📊
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setReportItem({ productName: item.name, defaultStore: displayOffer?.store });
                        }}
                        style={{
                          background: "rgba(59,130,246,0.12)",
                          border: "1px solid rgba(59,130,246,0.35)",
                          borderRadius: "20px",
                          padding: "5px 10px",
                          fontSize: "11px",
                          color: "#3B82F6",
                          cursor: "pointer",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        📍 Report
                      </button>
                      {displayOffer && (
                        <div style={{ background: "rgba(255,215,0,0.1)", border: "1.5px solid rgba(255,215,0,0.3)", borderRadius: "10px", padding: "6px 12px", fontSize: "16px", fontWeight: "800", color: "#FFD700" }}>
                          K{displayOffer.price.toFixed(2)}
                        </div>
                      )}
                      <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "12px" }}>{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px 14px", background: "rgba(0,0,0,0.2)" }}>
                      {(item.offers || []).slice().sort((a, b) => (parsePrice(a.price) || 9999) - (parsePrice(b.price) || 9999)).map((o, j) => {
                        const p = parsePrice(o.price);
                        const isBest = o.store === item.cheapest?.store;
                        const isCommunity = !!o.community;
                        const storeCol = isCommunity ? "#3B82F6" : (STORES.find(s => o.store?.includes(s.name))?.color || "#FF6B00");
                        const allPrices = item.offers.map(x => parsePrice(x.price)).filter(Boolean);
                        const minP = Math.min(...allPrices);
                        const maxP = Math.max(...allPrices);
                        const barPct = maxP === minP ? 80 : Math.round(((maxP - p) / (maxP - minP)) * 60 + 20);
                        const communityLive = isCommunity ? { ...o.community, ...voteOverrides[o.community.id] } : null;
                        const hasVoted = isCommunity && votedIds.has(o.community.id);
                        return (
                          <div key={j} style={{ padding: "6px 0", borderBottom: j < item.offers.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                              <span style={{ width: "100px", fontSize: "12px", color: isBest ? "#FFD700" : "rgba(245,240,232,0.5)", fontWeight: isBest ? "700" : "400", flexShrink: 0 }}>
                                {isBest ? "✓ " : ""}{o.store}
                              </span>
                              <div style={{ flex: 1, height: "5px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
                                <div style={{ width: barPct + "%", height: "100%", background: isBest ? "#FFD700" : storeCol + "80", borderRadius: "3px" }} />
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                                {o.onSpecial && <span style={{ fontSize: "10px", background: "rgba(255,215,0,0.15)", color: "#FFD700", borderRadius: "8px", padding: "1px 5px" }}>🏷️</span>}
                                <span style={{ width: "58px", fontSize: "13px", textAlign: "right", color: isBest ? "#FFD700" : "rgba(245,240,232,0.5)", fontWeight: isBest ? "700" : "400" }}>
                                  {p !== null ? `K${p.toFixed(2)}` : o.price}
                                </span>
                              </div>
                            </div>
                            {o.note && o.note !== item.name && (
                              <div style={{ fontSize: "10px", color: "rgba(245,240,232,0.3)", paddingLeft: "108px" }}>{o.note}</div>
                            )}
                            <div style={{ paddingLeft: "108px", display: "flex", alignItems: "center", gap: "7px", marginTop: "3px", flexWrap: "wrap" }}>
                              <span style={{
                                fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px",
                                background: isCommunity ? "rgba(59,130,246,0.15)" : "rgba(255,107,0,0.12)",
                                border: `1px solid ${isCommunity ? "rgba(59,130,246,0.4)" : "rgba(255,107,0,0.3)"}`,
                                color: isCommunity ? "#3B82F6" : "#FF6B00",
                              }}>
                                {o.source || "Weekly catalogue"}
                              </span>
                              {isCommunity && (
                                <>
                                  <span style={{ fontSize: "10px", color: "rgba(245,240,232,0.35)" }}>
                                    Reported {timeAgo(communityLive.createdAt)}
                                  </span>
                                  {communityLive.verified && (
                                    <span style={{ fontSize: "10px", color: "#3B82F6", fontWeight: 700 }}>✓ verified</span>
                                  )}
                                  <button
                                    onClick={() => voteOnCommunityPrice(o.community.id, "up")}
                                    disabled={hasVoted}
                                    style={{ background: "none", border: "none", cursor: hasVoted ? "default" : "pointer", fontSize: "12px", opacity: hasVoted ? 0.4 : 1, padding: "0 2px" }}
                                  >
                                    👍 {communityLive.upvotes}
                                  </button>
                                  <button
                                    onClick={() => voteOnCommunityPrice(o.community.id, "down")}
                                    disabled={hasVoted}
                                    style={{ background: "none", border: "none", cursor: hasVoted ? "default" : "pointer", fontSize: "12px", opacity: hasVoted ? 0.4 : 1, padding: "0 2px" }}
                                  >
                                    👎 {communityLive.downvotes}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <p style={{ fontSize: "11px", color: "rgba(245,240,232,0.2)", textAlign: "center", marginTop: "8px" }}>Tap item to compare all stores · 🏷️ = weekly special</p>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={reset}
              style={{ flex: 1, padding: "14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "rgba(245,240,232,0.7)", fontSize: "15px", fontWeight: "600", cursor: "pointer" }}
              onMouseEnter={e => e.target.style.borderColor = "#FFD700"}
              onMouseLeave={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}>
              ← New List
            </button>
            <button style={{ flex: 1, padding: "14px", background: "linear-gradient(135deg, #FF6B00, #FFD700)", border: "none", borderRadius: "12px", color: "#0D1B0F", fontSize: "15px", fontWeight: "700", cursor: "pointer" }}>
              🗺️ Get Directions
            </button>
          </div>
        </div>
      )}

      {reportItem && (
        <ReportPriceModal
          productName={reportItem.productName}
          defaultStore={reportItem.defaultStore}
          onClose={() => setReportItem(null)}
          onSubmitted={() => {
            setReportItem(null);
            setToast("✓ Price reported — thanks for helping the community!");
            setFeedRefreshKey(k => k + 1);
          }}
        />
      )}

      {alertItem && (
        <PriceAlertModal
          productName={alertItem.productName}
          defaultStore={alertItem.defaultStore}
          defaultTargetPrice={alertItem.defaultTargetPrice}
          onClose={() => setAlertItem(null)}
          onCreated={() => {
            setAlertItem(null);
            setToast("🔔 Alert set! We'll notify you on Telegram when the price drops.");
          }}
        />
      )}

      {historyItem && (
        <PriceHistoryModal
          productName={historyItem.productName}
          defaultStore={historyItem.defaultStore}
          onClose={() => setHistoryItem(null)}
        />
      )}

      {listModalMode && (
        <ShoppingListEmailModal
          mode={listModalMode}
          items={items}
          onClose={() => setListModalMode(null)}
          onSaved={() => {
            setListModalMode(null);
            setToast("✓ List saved!");
          }}
          onLoaded={(data) => {
            setListModalMode(null);
            setItems(data.list.items);
            setLoadedListInfo({ itemPrices: data.itemPrices, total: data.total });
            setToast("✓ List loaded!");
          }}
        />
      )}

      {toast && (
        <div style={{
          position: "fixed", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          background: "#132615", border: "1px solid rgba(59,130,246,0.4)", borderRadius: "12px",
          padding: "12px 18px", color: "#F5F0E8", fontSize: "13px", fontWeight: 600,
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)", zIndex: 1100, maxWidth: "90vw", textAlign: "center",
        }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: rgba(245,240,232,0.25); }
        body { -webkit-font-smoothing: antialiased; background: #0D1B0F; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0D1B0F; }
        ::-webkit-scrollbar-thumb { background: rgba(255,215,0,0.2); border-radius: 2px; }
      `}</style>
    </div>
  );
}