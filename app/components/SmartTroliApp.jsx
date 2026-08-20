"use client";

import { useEffect, useRef, useState } from "react";
import ReportPriceModal from "./ReportPriceModal";
import PriceAlertModal from "./PriceAlertModal";
import ShoppingListEmailModal from "./ShoppingListEmailModal";
import PriceHistoryModal from "./PriceHistoryModal";
import LivePricesFeed from "./LivePricesFeed";
import PwaInstallBanner from "./PwaInstallBanner";
import HolidayBanner from "./HolidayBanner";
import NavBar from "./NavBar";

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

const COMPARISON_STORES = ["Shoprite", "Choppies", "Pick n Pay"];

// For each store, sums that store's own cheapest offer per item — not the
// item's global cheapest — so this answers "what would my whole list cost
// at store X", not "what's the best price for each item individually".
// A store missing even one item is "unavailable" rather than a partial sum,
// since you can't complete the whole shop there in one stop.
function computeStoreComparison(items) {
  if (!items || items.length === 0) return [];

  const rows = COMPARISON_STORES.map((store) => {
    let total = 0;
    let unavailableCount = 0;
    for (const item of items) {
      const cheapestAtStore = (item.offers || [])
        .filter((o) => o.store?.includes(store))
        .map((o) => parsePrice(o.price))
        .filter((p) => p !== null)
        .sort((a, b) => a - b)[0];
      if (cheapestAtStore !== undefined) total += cheapestAtStore;
      else unavailableCount++;
    }
    return { store, total, unavailableCount, available: unavailableCount === 0 };
  });

  rows.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (a.available) return a.total - b.total;
    return 0;
  });

  const bestIdx = rows.findIndex((r) => r.available);
  return rows.map((r, i) => ({ ...r, isBest: i === bestIdx }));
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
const DIRECTIONS_PREF_KEY = "smarttroli_directions_pref";

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

export default function SmartTroliApp({ initialItems = [], autoRunSearch = false }) {
  const [items, setItems] = useState(initialItems);
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
  const [showAreaInput, setShowAreaInput] = useState(false);
  const [areaInputValue, setAreaInputValue] = useState("");
  const [showTellAFriendOptions, setShowTellAFriendOptions] = useState(false);

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

  // Auto-run a search once when arriving via a shared /list?items=... link.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRunSearch && initialItems.length > 0 && !autoRanRef.current) {
      autoRanRef.current = true;
      analyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setPhase("input"); setResults(null); setTotals(null);
    setOptimalPlan(null); setItems([]); setApiError(null); setExpandedItem(null);
  }

  const areaDisplay = manualArea || suburb || city || "Zambia";

  // Same items the store filter tabs currently show — shared by the store
  // comparison card so both stay in sync when the filter changes.
  const visibleResultsWithIndex = (results || [])
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => storeFilter === "All" || item.offers?.some((o) => o.store?.includes(storeFilter)));
  const storeComparison = computeStoreComparison(visibleResultsWithIndex.map(({ item }) => item));

  // WhatsApp share always represents the whole list regardless of the
  // active filter tab, so it's computed from the unfiltered results.
  function buildWhatsAppShareText() {
    const fullComparison = computeStoreComparison(results || []);
    const best = fullComparison.find((r) => r.isBest);
    const lines = ["🛒 My SmartTroli List"];

    if (best) {
      for (const item of results || []) {
        const offer = (item.offers || [])
          .filter((o) => o.store?.includes(best.store))
          .map((o) => parsePrice(o.price))
          .filter((p) => p !== null)
          .sort((a, b) => a - b)[0];
        if (offer !== undefined) lines.push(`- ${item.name} - K${offer.toFixed(2)} (${best.store})`);
      }
      lines.push(`Total: K${best.total.toFixed(2)} at ${best.store}`);
    } else {
      for (const item of results || []) {
        if (item.cheapest) lines.push(`- ${item.name} - K${item.cheapest.price.toFixed(2)} (${item.cheapest.store})`);
      }
      if (totals) lines.push(`Total: K${totals.total.toFixed(2)}`);
    }

    lines.push("Compare prices: smarttroli.com");
    return lines.join("\n");
  }

  function shareOnWhatsApp() {
    const text = buildWhatsAppShareText();
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  // Whichever store has the lowest total on the store comparison card (same
  // "best" store WhatsApp share uses), falling back to whichever store is
  // individually cheapest for the most items if no single store covers the
  // whole list.
  function getCheapestStoreName() {
    const fullComparison = computeStoreComparison(results || []);
    const best = fullComparison.find((r) => r.isBest);
    if (best) return best.store;

    const counts = {};
    for (const item of results || []) {
      if (item.cheapest?.store) counts[item.cheapest.store] = (counts[item.cheapest.store] || 0) + 1;
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top?.[0] || null;
  }

  function openMapsUrl(url) {
    // Note: the brief's regex was anchored (/^(iPhone|iPad|Android)/i), which
    // never matches — real mobile user agents start with "Mozilla/5.0 (...",
    // not the platform token. Unanchored so it actually detects mobile.
    const isMobile = /(iPhone|iPad|Android)/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function getDirections() {
    const cheapestStore = getCheapestStoreName();
    if (!cheapestStore) return;

    let pref = null;
    try { pref = JSON.parse(localStorage.getItem(DIRECTIONS_PREF_KEY) || "null"); } catch { /* ignore */ }

    if (pref?.mode === "manual" && pref.area) {
      setAreaInputValue(pref.area);
      setShowAreaInput(true);
      return;
    }

    if (!navigator.geolocation) {
      setShowAreaInput(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        try { localStorage.setItem(DIRECTIONS_PREF_KEY, JSON.stringify({ mode: "auto" })); } catch { /* ignore */ }
        const destination = encodeURIComponent(`${cheapestStore} Lusaka Zambia`).replace(/%20/g, "+");
        const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&origin=${pos.coords.latitude},${pos.coords.longitude}`;
        openMapsUrl(url);
      },
      () => setShowAreaInput(true)
    );
  }

  function submitManualArea() {
    const area = areaInputValue.trim();
    if (!area) return;
    const cheapestStore = getCheapestStoreName();
    if (!cheapestStore) return;

    try { localStorage.setItem(DIRECTIONS_PREF_KEY, JSON.stringify({ mode: "manual", area })); } catch { /* ignore */ }
    const query = encodeURIComponent(`${cheapestStore} ${area} Lusaka Zambia`).replace(/%20/g, "+");
    openMapsUrl(`https://www.google.com/maps/search/${query}`);
    setShowAreaInput(false);
  }

  async function shareListLink() {
    if (items.length === 0) { setApiError("Add at least one item before sharing!"); return; }
    const url = `${window.location.origin}/list?items=${items.map(i => encodeURIComponent(i)).join(",")}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast("🔗 Link copied!");
    } catch {
      setApiError(`Copy failed — here's your link: ${url}`);
    }
  }

  async function tellAFriend() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SmartTroli",
          text: "Compare grocery prices across Zambian stores and save money every week!",
          url: "https://smarttroli.com",
        });
      } catch {
        // user cancelled the share sheet — no-op
      }
    } else {
      setShowTellAFriendOptions((v) => !v);
    }
  }

  async function copyAppLink() {
    try {
      await navigator.clipboard.writeText("https://smarttroli.com");
      setToast("🔗 Link copied!");
    } catch {
      setApiError("Copy failed — here's the link: https://smarttroli.com");
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0D1B0F",
      fontFamily: "'Segoe UI', -apple-system, sans-serif",
      color: "#F5F0E8",
    }}>

      <HolidayBanner />

      {/* ── NAV ── */}
      <NavBar showKwacha />

      {phase === "input" && (
        <>
          {/* ── HERO ── */}
          <div style={{
            background: "linear-gradient(180deg, #1F3D22 0%, #0D1B0F 100%)",
            padding: "42px 20px 36px",
            textAlign: "center",
            borderBottom: "1px solid rgba(249,115,22,0.18)",
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{ position: "relative" }}>
              <div style={{ fontSize: "12px", color: "#FFD700", letterSpacing: "3.5px", textTransform: "uppercase", marginBottom: "12px", opacity: 0.85, fontWeight: 700 }}>
                🇿🇲 Zambia's Smart Shopping App
              </div>
              <h1 style={{
                margin: "0 0 10px",
                fontSize: "clamp(28px, 7vw, 46px)",
                fontWeight: "900",
                color: "#F5F0E8",
                letterSpacing: "-1.2px",
                lineHeight: 1.08,
              }}>
                Save More<br />
                <span style={{ background: "linear-gradient(135deg, #FFD700, #F97316)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Every Week</span>
              </h1>
              <p style={{ color: "rgba(245,240,232,0.6)", margin: "0 0 24px", fontSize: "14.5px", fontWeight: 500 }}>
                Find the best deals across Zambian stores
              </p>

              {/* Store pills — all stores are searchable; only Shoprite and
                  Choppies have real catalogue data, the rest fall back to
                  clearly-labeled AI-estimated prices. */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "center" }}>
                {STORES.map(s => (
                  <span key={s.name} style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "20px",
                    padding: "5px 13px",
                    fontSize: "11.5px",
                    color: "rgba(245,240,232,0.8)",
                    fontWeight: "600",
                  }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ maxWidth: "600px", margin: "0 auto", padding: "18px 18px 90px" }}>

            {/* ── TELL A FRIEND ── */}
            <button onClick={tellAFriend} className="btn-lift"
              style={{
                width: "100%", padding: "14px", marginBottom: "14px",
                background: "rgba(249,115,22,0.14)", border: "1.5px solid #F97316",
                borderRadius: "14px", color: "#F97316", fontSize: "15px", fontWeight: "800",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              }}>
              💬 Tell a Friend
            </button>
            {showTellAFriendOptions && (
              <div style={{ display: "flex", gap: "8px", marginBottom: "14px", marginTop: "-6px" }}>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent("Check out SmartTroli — compare grocery prices across Zambian stores! https://smarttroli.com")}`}
                  target="_blank" rel="noopener noreferrer" className="btn-lift"
                  style={{
                    flex: 1, textAlign: "center", padding: "11px", background: "rgba(37,211,102,0.14)",
                    border: "1px solid rgba(37,211,102,0.4)", borderRadius: "12px", color: "#25D366",
                    fontSize: "13px", fontWeight: "700", textDecoration: "none",
                  }}>
                  💬 WhatsApp
                </a>
                <button onClick={copyAppLink} className="btn-lift"
                  style={{
                    flex: 1, padding: "11px", background: "rgba(249,115,22,0.12)",
                    border: "1px solid rgba(249,115,22,0.35)", borderRadius: "12px", color: "#F97316",
                    fontSize: "13px", fontWeight: "700", cursor: "pointer",
                  }}>
                  🔗 Copy Link
                </button>
              </div>
            )}

            <LivePricesFeed refreshKey={feedRefreshKey} />

            {/* ── LOCATION ── */}
            <div style={{
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(249,115,22,0.2)",
              borderRadius: "16px",
              padding: "15px 17px",
              marginBottom: "14px",
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
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: "16px",
              padding: "18px",
              marginBottom: "14px",
            }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: "#F97316", textTransform: "uppercase", letterSpacing: "2.2px", marginBottom: "14px" }}>
                🛒 Your Shopping List
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addItem()}
                  placeholder="e.g. Mealie meal, chicken, bread..."
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "1.5px solid rgba(255,255,255,0.1)",
                    borderRadius: "11px",
                    padding: "13px 14px",
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "#F5F0E8",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = "#F97316"}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                />
                <button onClick={() => addItem()} className="btn-lift"
                  style={{
                    background: "linear-gradient(135deg, #FF6B00, #FFD700)",
                    border: "none", borderRadius: "11px",
                    width: "50px", height: "50px",
                    color: "#0D1B0F", fontSize: "24px",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, fontWeight: "700",
                    boxShadow: "0 3px 12px rgba(249,115,22,0.3)",
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

              {/* ── FIND BEST DEALS — the natural next step once the list has items ── */}
              {items.length > 0 && (
                <button onClick={analyze} disabled={loading}
                  className={!loading ? "btn-lift" : ""}
                  style={{
                    width: "100%", padding: "17px", marginTop: "14px",
                    background: !loading
                      ? "linear-gradient(135deg, #FF6B00 0%, #F97316 50%, #FFD700 100%)"
                      : "rgba(255,255,255,0.06)",
                    border: "none", borderRadius: "14px",
                    color: !loading ? "#0D1B0F" : "rgba(245,240,232,0.3)",
                    fontSize: "16px", fontWeight: "800",
                    cursor: !loading ? "pointer" : "not-allowed",
                    letterSpacing: "-0.2px",
                    boxShadow: !loading ? "0 6px 24px rgba(249,115,22,0.4)" : "none",
                    transition: "all 0.2s",
                  }}>
                  {loading ? (
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}>
                      <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                      {loadingStage}
                    </span>
                  ) : "🔍 Find Best Deals →"}
                </button>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                {items.length > 0 && (
                  <button
                    onClick={() => setListModalMode("save")}
                    className="btn-lift"
                    style={{
                      flex: 1, minWidth: "100px", background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.35)",
                      borderRadius: "11px", padding: "10px 10px", fontSize: "12.5px", color: "#F97316", cursor: "pointer", fontWeight: 700,
                    }}
                  >
                    💾 Save List
                  </button>
                )}
                <button
                  onClick={() => setListModalMode("load")}
                  className="btn-lift"
                  style={{
                    flex: 1, minWidth: "100px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: "11px", padding: "10px 10px", fontSize: "12.5px", color: "rgba(245,240,232,0.85)", cursor: "pointer", fontWeight: 700,
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

            {/* ── PUBLIC HOLIDAY FEATURED CARD ── */}
            <a
              href="https://publicholiday.today"
              target="_blank"
              rel="noopener noreferrer"
              className="card-lift"
              style={{
                display: "block", marginTop: "16px", textDecoration: "none",
                background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)",
                borderLeft: "4px solid #F97316", borderRadius: "14px", padding: "16px 18px",
              }}
            >
              <div style={{ fontSize: "15px", fontWeight: "800", color: "#F5F0E8", marginBottom: "4px" }}>
                📅 Planning your week?
              </div>
              <div style={{ fontSize: "13px", color: "rgba(245,240,232,0.6)", marginBottom: "8px" }}>
                Check Zambian public holidays before you shop
              </div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#F97316" }}>
                → Visit publicholiday.today
              </div>
            </a>
          </div>
        </>
      )}

      {/* ── RESULTS ── */}
      {phase === "results" && results && totals && (
        <div style={{ maxWidth: "600px", margin: "0 auto", padding: "18px 18px 90px" }}>

          {/* Savings hero */}
          <div style={{
            background: "linear-gradient(135deg, #1D3F21, #0D2412)",
            border: "1px solid rgba(249,115,22,0.25)",
            borderRadius: "20px",
            padding: "28px 22px",
            marginBottom: "16px",
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 8px 28px rgba(0,0,0,0.25)",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "3px", background: "linear-gradient(90deg, #FF6B00, #FFD700, #F97316)" }} />
            <div style={{ fontSize: "12px", color: "rgba(245,240,232,0.55)", letterSpacing: "2.5px", marginBottom: "6px", textTransform: "uppercase", fontWeight: 700 }}>{savingsPhrase}</div>
            <div style={{ fontSize: "clamp(50px, 15vw, 76px)", fontWeight: "900", color: "#FFD700", lineHeight: 1, letterSpacing: "-2.5px", textShadow: "0 4px 24px rgba(255,215,0,0.2)" }}>
              K{totals.savings.toFixed(2)}
            </div>
            <div style={{ fontSize: "14.5px", color: "rgba(245,240,232,0.55)", marginTop: "8px", fontWeight: 500 }}>
              Optimal basket: <strong style={{ color: "#F5F0E8", fontWeight: 800 }}>K{totals.total.toFixed(2)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
              <span style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: "20px", padding: "5px 13px", fontSize: "12px", color: "#FFB067", fontWeight: 600 }}>
                📍 {areaDisplay}
              </span>
              {totals.specialsFound > 0 && (
                <span style={{ background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: "20px", padding: "5px 13px", fontSize: "12px", color: "#FFD700", fontWeight: 600 }}>
                  🏷️ {totals.specialsFound} special{totals.specialsFound !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {totals.tip && (
              <div style={{ marginTop: "14px", background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "11px 15px", fontSize: "13px", color: "rgba(245,240,232,0.75)", fontStyle: "italic", lineHeight: 1.5 }}>
                💡 {totals.tip}
              </div>
            )}
          </div>

          {/* Shopping plan */}
          {optimalPlan && optimalPlan.length > 0 && (
            <div style={{ marginBottom: "18px" }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: "#F97316", textTransform: "uppercase", letterSpacing: "2.2px", marginBottom: "11px" }}>Shopping Plan</div>
              {optimalPlan.map((stop, i) => {
                const storeColor = STORES.find(s => stop.store?.includes(s.name))?.color || "#FF6B00";
                return (
                  <div key={i} className="card-lift" style={{
                    background: "rgba(255,255,255,0.035)",
                    border: `1px solid rgba(255,255,255,0.07)`,
                    borderLeft: `4px solid ${storeColor}`,
                    borderRadius: "16px", padding: "17px",
                    marginBottom: "10px",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "11px" }}>
                      <div>
                        <div style={{ fontSize: "16.5px", fontWeight: "800", color: "#F5F0E8", letterSpacing: "-0.2px" }}>{stop.branch || stop.store}</div>
                        <div style={{ fontSize: "12px", color: "rgba(245,240,232,0.45)", marginTop: "3px", fontWeight: 500 }}>Stop {i + 1} of {optimalPlan.length}</div>
                      </div>
                      <div style={{ background: `${storeColor}22`, border: `1.5px solid ${storeColor}`, borderRadius: "11px", padding: "8px 14px", fontSize: "18px", fontWeight: "800", color: storeColor }}>
                        K{stop.subtotal?.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {stop.items?.map((item, j) => (
                        <span key={j} style={{ background: `${storeColor}18`, border: `1px solid ${storeColor}35`, borderRadius: "20px", padding: "4px 11px", fontSize: "12px", color: "rgba(245,240,232,0.85)", fontWeight: 500 }}>{item}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(135deg, rgba(255,215,0,0.1), rgba(249,115,22,0.08))", border: "1px solid rgba(255,215,0,0.25)", borderRadius: "14px", padding: "15px 19px" }}>
                <div style={{ fontSize: "12px", color: "rgba(245,240,232,0.55)", textTransform: "uppercase", letterSpacing: "1.2px", fontWeight: 700 }}>Total</div>
                <div style={{ fontSize: "29px", fontWeight: "900", color: "#FFD700", letterSpacing: "-1px" }}>K{totals.total.toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Price breakdown */}
          <div style={{ marginBottom: "22px" }}>
            <div style={{ fontSize: "11px", fontWeight: "800", color: "#F97316", textTransform: "uppercase", letterSpacing: "2.2px", marginBottom: "11px" }}>Price Breakdown</div>

            {/* Store comparison — the headline element: which single store to shop at */}
            {storeComparison.length > 0 && (() => {
              const best = storeComparison.find((r) => r.isBest);
              const rest = storeComparison.filter((r) => r !== best);
              const dotColor = (storeName) => STORES.find((s) => storeName.includes(s.name))?.color || "#F97316";

              return (
                <div style={{
                  position: "relative", overflow: "hidden",
                  background: "linear-gradient(160deg, rgba(249,115,22,0.16), rgba(20,16,8,0.4) 55%, rgba(255,255,255,0.02))",
                  border: "1.5px solid rgba(249,115,22,0.45)",
                  borderRadius: "20px", padding: "20px",
                  marginBottom: "14px",
                  boxShadow: "0 10px 32px rgba(249,115,22,0.14), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}>
                  <div style={{ position: "absolute", top: "-70px", right: "-50px", width: "180px", height: "180px", background: "radial-gradient(circle, rgba(255,215,0,0.18), transparent 70%)", pointerEvents: "none" }} />

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", position: "relative" }}>
                    <span style={{ fontSize: "18px" }}>🏪</span>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#FFD700", textTransform: "uppercase", letterSpacing: "2.5px" }}>
                      Best Store For Your List
                    </span>
                  </div>

                  {best ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px", position: "relative" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                          <span style={{ width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0, background: dotColor(best.store), boxShadow: `0 0 10px ${dotColor(best.store)}` }} />
                          <span style={{ fontSize: "23px", fontWeight: 800, color: "#F5F0E8", letterSpacing: "-0.6px", lineHeight: 1.1 }}>
                            {best.store}
                          </span>
                        </div>
                        <span style={{
                          fontSize: "10.5px", fontWeight: 800, color: "#0D1B0F", background: "linear-gradient(135deg, #FFD700, #FF6B00)",
                          padding: "4px 11px", borderRadius: "20px", letterSpacing: "0.3px", whiteSpace: "nowrap",
                        }}>
                          🏆 CHEAPEST OVERALL
                        </span>
                      </div>
                      <div style={{ fontSize: "clamp(30px, 9vw, 40px)", fontWeight: 900, color: "#FFD700", letterSpacing: "-1.5px", lineHeight: 1, textShadow: "0 2px 20px rgba(255,215,0,0.25)", flexShrink: 0 }}>
                        K{best.total.toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: "13px", color: "rgba(245,240,232,0.55)", position: "relative" }}>
                      No single store has everything on your list — see the breakdown below.
                    </div>
                  )}

                  {rest.length > 0 && (
                    <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", marginTop: "16px", paddingTop: "13px", display: "flex", flexDirection: "column", gap: "9px", position: "relative" }}>
                      {rest.map((row) => (
                        <div key={row.store} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: dotColor(row.store), opacity: 0.65 }} />
                            <span style={{ color: "rgba(245,240,232,0.75)", fontWeight: 600 }}>{row.store}</span>
                          </div>
                          {row.available ? (
                            <span style={{ color: "rgba(245,240,232,0.6)", fontWeight: 700 }}>K{row.total.toFixed(2)}</span>
                          ) : (
                            <span style={{ color: "rgba(245,240,232,0.32)", fontStyle: "italic", fontSize: "12px" }}>
                              unavailable{row.unavailableCount > 0 ? ` (${row.unavailableCount} missing)` : ""}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Store filter */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "13px" }}>
              {FILTER_STORES.map(store => {
                const count = store === "All"
                  ? results.length
                  : results.filter(r => r.offers?.some(o => o.store?.includes(store))).length;
                const active = storeFilter === store;
                return (
                  <button key={store} onClick={() => selectStoreFilter(store)} className="btn-lift"
                    style={{
                      background: active ? "linear-gradient(135deg, #FF6B00, #FFD700)" : "rgba(255,255,255,0.05)",
                      border: `1px solid ${active ? "transparent" : "rgba(255,255,255,0.15)"}`,
                      borderRadius: "20px", padding: "7px 13px", fontSize: "12.5px", fontWeight: 700,
                      color: active ? "#0D1B0F" : "rgba(245,240,232,0.7)", cursor: "pointer", whiteSpace: "nowrap",
                      boxShadow: active ? "0 3px 12px rgba(249,115,22,0.35)" : "none",
                    }}>
                    {store} <span style={{ opacity: 0.7 }}>({count})</span>
                  </button>
                );
              })}
            </div>

            {visibleResultsWithIndex
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
                <div key={i} className="card-lift" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "16px", marginBottom: "9px", overflow: "hidden" }}>
                  <div onClick={() => setExpandedItem(isExpanded ? null : i)}
                    style={{ padding: "15px 16px", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "3px", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "14.5px", fontWeight: "700", color: "#F5F0E8", letterSpacing: "-0.1px" }}>{item.name}</span>
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
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        {displayOffer && (
                          <div style={{ background: "rgba(255,215,0,0.1)", border: "1.5px solid rgba(255,215,0,0.3)", borderRadius: "11px", padding: "6px 13px", fontSize: "16px", fontWeight: "800", color: "#FFD700", whiteSpace: "nowrap" }}>
                            K{displayOffer.price.toFixed(2)}
                          </div>
                        )}
                        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "12px" }}>{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "7px", marginTop: "11px" }}>
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
                        className="btn-lift"
                        style={{
                          background: "rgba(255,215,0,0.12)",
                          border: "1px solid rgba(255,215,0,0.35)",
                          borderRadius: "20px",
                          padding: "6px 11px",
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
                        className="btn-lift"
                        style={{
                          background: "rgba(168,85,247,0.12)",
                          border: "1px solid rgba(168,85,247,0.35)",
                          borderRadius: "20px",
                          padding: "6px 11px",
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
                        className="btn-lift"
                        style={{
                          background: "rgba(59,130,246,0.12)",
                          border: "1px solid rgba(59,130,246,0.35)",
                          borderRadius: "20px",
                          padding: "6px 11px",
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
          <button onClick={getDirections} className="btn-lift"
            style={{
              width: "100%", padding: "16px", marginBottom: "10px",
              background: "linear-gradient(135deg, #FF6B00, #F97316 50%, #FFD700)",
              border: "none", borderRadius: "14px", color: "#0D1B0F", fontSize: "16px", fontWeight: "800",
              cursor: "pointer", letterSpacing: "-0.2px", boxShadow: "0 6px 20px rgba(249,115,22,0.35)",
            }}>
            🗺️ Get Directions to Cheapest Store
          </button>

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={reset} className="btn-lift"
              style={{ flex: 1, padding: "13px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "12px", color: "rgba(245,240,232,0.75)", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
              ← New List
            </button>
            <button onClick={shareOnWhatsApp} className="btn-lift"
              style={{ flex: 1, padding: "13px 8px", background: "rgba(37,211,102,0.14)", border: "1px solid rgba(37,211,102,0.4)", borderRadius: "12px", color: "#25D366", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
              💬 WhatsApp
            </button>
            {items.length > 0 && (
              <button onClick={shareListLink} className="btn-lift"
                style={{ flex: 1, padding: "13px 8px", background: "rgba(249,115,22,0.14)", border: "1px solid rgba(249,115,22,0.4)", borderRadius: "12px", color: "#F97316", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                🔗 Share my list
              </button>
            )}
          </div>

          {showAreaInput && (
            <div style={{ marginTop: "10px" }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  value={areaInputValue}
                  onChange={e => setAreaInputValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submitManualArea()}
                  placeholder="Enter your area (e.g. Manda Hill, Woodlands)"
                  autoFocus
                  style={{
                    flex: 1, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)",
                    borderRadius: "10px", padding: "10px 12px", fontSize: "14px", color: "#F5F0E8", outline: "none",
                  }}
                />
                <button onClick={submitManualArea}
                  style={{
                    background: "linear-gradient(135deg, #FF6B00, #FFD700)", border: "none", borderRadius: "10px",
                    padding: "10px 18px", color: "#0D1B0F", fontSize: "14px", fontWeight: "700", cursor: "pointer",
                  }}>
                  Go
                </button>
              </div>
            </div>
          )}
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

      <PwaInstallBanner />

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
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fadeSlideDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-tap-highlight-color: transparent; }
        body {
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background: #0D1B0F;
          text-rendering: optimizeLegibility;
        }
        input::placeholder { color: rgba(245,240,232,0.28); }
        button { font-family: inherit; }
        button:focus-visible, input:focus-visible, a:focus-visible {
          outline: 2px solid #FFD700;
          outline-offset: 2px;
        }
        .btn-lift { transition: transform 0.16s ease, filter 0.16s ease, box-shadow 0.16s ease; }
        .btn-lift:hover { transform: translateY(-1.5px); filter: brightness(1.07); }
        .btn-lift:active { transform: translateY(0); filter: brightness(0.96); }
        .card-lift { transition: border-color 0.15s ease, transform 0.15s ease; }
        .card-lift:hover { border-color: rgba(249,115,22,0.35) !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0D1B0F; }
        ::-webkit-scrollbar-thumb { background: rgba(255,215,0,0.25); border-radius: 2px; }
      `}</style>
    </div>
  );
}
