"use client";

import { useEffect, useState } from "react";

const VISIT_KEY = "smarttroli_visit_count";
const DISMISS_KEY = "smarttroli_pwa_dismissed";

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let visitCount = 1;
    try {
      visitCount = Number(localStorage.getItem(VISIT_KEY) || "0") + 1;
      localStorage.setItem(VISIT_KEY, String(visitCount));
    } catch { /* ignore blocked localStorage */ }

    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "true"; } catch { /* ignore */ }

    if (dismissed || visitCount < 2) return;

    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  function dismissForever() {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, "true"); } catch { /* ignore */ }
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    setDeferredPrompt(null);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1200,
        background: "#132615", borderTop: "1px solid rgba(249,115,22,0.4)",
        padding: "12px 16px", display: "flex", alignItems: "center", gap: "12px",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.4)",
      }}
    >
      <div style={{ fontSize: "24px", flexShrink: 0 }}>🛒</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#F5F0E8" }}>
          Add SmartTroli to your home screen
        </div>
        <div style={{ fontSize: "11px", color: "rgba(245,240,232,0.5)" }}>
          Quicker access, works like an app
        </div>
      </div>
      <button
        onClick={install}
        style={{
          background: "linear-gradient(135deg, #FF6B00, #FFD700)", border: "none", borderRadius: "10px",
          padding: "9px 16px", fontSize: "13px", fontWeight: 700, color: "#0D1B0F", cursor: "pointer",
          whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        Add
      </button>
      <button
        onClick={dismissForever}
        aria-label="Dismiss"
        style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "20px",
          cursor: "pointer", lineHeight: 1, padding: "8px", flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
