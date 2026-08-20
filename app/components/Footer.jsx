export default function Footer() {
  return (
    <footer
      style={{
        background: "#1a1a1a",
        borderTop: "3px solid #F97316",
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "10px",
        fontFamily: "'Segoe UI', -apple-system, sans-serif",
      }}
    >
      <div style={{ fontSize: "12.5px", color: "rgba(245,240,232,0.55)", fontWeight: 500 }}>
        © 2026 SmartTroli · Built for Zambia 🇿🇲
      </div>
      <div style={{ display: "flex", gap: "18px" }}>
        <a href="/guides" className="footer-link" style={{ color: "rgba(245,240,232,0.6)", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
          Guides
        </a>
        <a href="/privacy" className="footer-link" style={{ color: "rgba(245,240,232,0.6)", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
          Privacy Policy
        </a>
      </div>

      <style>{`
        .footer-link { transition: color 0.15s ease; }
        .footer-link:hover { color: #F97316; }
      `}</style>
    </footer>
  );
}
