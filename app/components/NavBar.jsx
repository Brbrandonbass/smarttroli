export default function NavBar({ showKwacha = false }) {
  return (
    <nav
      style={{
        background: "rgba(13,27,15,0.85)",
        backdropFilter: "blur(14px) saturate(1.4)",
        WebkitBackdropFilter: "blur(14px) saturate(1.4)",
        borderBottom: "1px solid rgba(249,115,22,0.22)",
        padding: "0 20px",
        height: "64px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <a href="/" style={{ display: "flex", alignItems: "center", gap: "11px", textDecoration: "none" }}>
        <div
          style={{
            width: "38px",
            height: "38px",
            background: "linear-gradient(135deg, #FF6B00, #F97316 55%, #FFD700)",
            borderRadius: "11px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "19px",
            boxShadow: "0 3px 12px rgba(249,115,22,0.4)",
          }}
        >
          🛒
        </div>
        <div>
          <span style={{ fontSize: "19px", fontWeight: 800, color: "#FFD700", letterSpacing: "-0.6px" }}>Smart</span>
          <span style={{ fontSize: "19px", fontWeight: 800, color: "#FF6B00", letterSpacing: "-0.6px" }}>Troli</span>
          <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginLeft: "7px", fontWeight: 500 }}>🇿🇲 Zambia</span>
        </div>
      </a>

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <a
          href="/guides"
          style={{
            fontSize: "13.5px",
            fontWeight: 700,
            color: "#F97316",
            textDecoration: "none",
            letterSpacing: "0.2px",
          }}
        >
          Guides
        </a>
        {showKwacha && (
          <div
            style={{
              fontSize: "11.5px",
              fontWeight: 700,
              color: "#F97316",
              background: "rgba(249,115,22,0.12)",
              border: "1px solid rgba(249,115,22,0.3)",
              padding: "5px 11px",
              borderRadius: "20px",
              letterSpacing: "0.2px",
            }}
          >
            ZMW Kwacha
          </div>
        )}
      </div>
    </nav>
  );
}
