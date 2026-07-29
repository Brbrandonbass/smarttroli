"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "smarttroli_pwa_dismissed";
const SHOW_DELAY_MS = 10000;

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "true"; } catch { /* ignore blocked localStorage */ }
    if (dismissed) return;

    // Already running as an installed PWA — nothing to prompt.
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return;

    let promptEvent = null;
    let delayElapsed = false;

    function maybeShow() {
      if (promptEvent && delayElapsed) {
        setDeferredPrompt(promptEvent);
        setVisible(true);
      }
    }

    function onBeforeInstallPrompt(e) {
      e.preventDefault();
      promptEvent = e;
      maybeShow();
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    const timer = setTimeout(() => { delayElapsed = true; maybeShow(); }, SHOW_DELAY_MS);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      clearTimeout(timer);
    };
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
        background: "rgba(19,38,21,0.97)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        borderTop: "1px solid rgba(249,115,22,0.45)",
        padding: "14px 16px", display: "flex", alignItems: "center", gap: "13px",
        boxShadow: "0 -8px 32px rgba(0,0,0,0.45)",
        animation: "slideUp 0.35s ease-out",
      }}
    >
      <div style={{
        fontSize: "22px", flexShrink: 0, width: "42px", height: "42px", borderRadius: "12px",
        background: "linear-gradient(135deg, #FF6B00, #F97316 55%, #FFD700)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 3px 12px rgba(249,115,22,0.4)",
      }}>🛒</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#F5F0E8", letterSpacing: "-0.1px" }}>
          Add SmartTroli to your home screen
        </div>
        <div style={{ fontSize: "11.5px", color: "rgba(245,240,232,0.55)", marginTop: "1px", fontWeight: 500 }}>
          Quicker access, works like an app
        </div>
      </div>
      <button
        onClick={install}
        className="btn-lift"
        style={{
          background: "linear-gradient(135deg, #FF6B00, #F97316 50%, #FFD700)", border: "none", borderRadius: "11px",
          padding: "10px 18px", fontSize: "13.5px", fontWeight: 800, color: "#0D1B0F", cursor: "pointer",
          whiteSpace: "nowrap", flexShrink: 0, boxShadow: "0 3px 12px rgba(249,115,22,0.35)",
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
