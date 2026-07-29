export default function Footer() {
  return (
    <footer
      style={{
        background: "#0A1510",
        borderTop: "1px solid rgba(249,115,22,0.15)",
        padding: "24px 20px",
        textAlign: "center",
        fontFamily: "'Segoe UI', -apple-system, sans-serif",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", gap: "18px", flexWrap: "wrap", marginBottom: "12px" }}>
        <a href="/privacy" style={{ color: "rgba(245,240,232,0.6)", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}>
          Privacy Policy
        </a>
        <a
          href="https://publicholiday.today"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "rgba(245,240,232,0.6)", fontSize: "13px", fontWeight: 600, textDecoration: "none" }}
        >
          publicholiday.today
        </a>
      </div>
      <div style={{ fontSize: "12.5px", color: "#F97316", fontWeight: 700, marginBottom: "4px" }}>
        Built for Zambia 🇿🇲
      </div>
      <div style={{ fontSize: "11.5px", color: "rgba(245,240,232,0.35)" }}>
        © 2026 SmartTroli
      </div>
    </footer>
  );
}
