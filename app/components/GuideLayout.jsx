export const sectionStyle = {
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  padding: "20px",
  marginBottom: "16px",
};

export const headingStyle = {
  fontSize: "11px",
  fontWeight: 800,
  color: "#F97316",
  textTransform: "uppercase",
  letterSpacing: "2px",
  marginBottom: "10px",
};

export const bodyStyle = {
  fontSize: "14.5px",
  color: "rgba(245,240,232,0.8)",
  lineHeight: 1.7,
};

export const listStyle = {
  ...bodyStyle,
  paddingLeft: "20px",
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

export default function GuideLayout({ title, subtitle, maxWidth = "680px", children }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0D1B0F",
        color: "#F5F0E8",
        fontFamily: "'Segoe UI', -apple-system, sans-serif",
      }}
    >
      <nav
        style={{
          background: "rgba(13,27,15,0.85)",
          backdropFilter: "blur(14px) saturate(1.4)",
          borderBottom: "1px solid rgba(249,115,22,0.22)",
          padding: "0 20px",
          height: "64px",
          display: "flex",
          alignItems: "center",
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
          </div>
        </a>
      </nav>

      <div style={{ maxWidth, margin: "0 auto", padding: "32px 18px 60px" }}>
        <a
          href="/guides"
          style={{
            display: "inline-block",
            marginBottom: "18px",
            fontSize: "12.5px",
            fontWeight: 700,
            color: "rgba(245,240,232,0.5)",
            textDecoration: "none",
          }}
        >
          ← All Guides
        </a>

        <h1 style={{ fontSize: "clamp(26px, 6vw, 34px)", fontWeight: 900, letterSpacing: "-1px", marginBottom: "6px" }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: "14px", color: "rgba(245,240,232,0.55)", marginBottom: "28px", lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}
        {!subtitle && <div style={{ marginBottom: "20px" }} />}

        {children}

        <a
          href="/"
          style={{
            display: "inline-block",
            marginTop: "8px",
            fontSize: "13px",
            fontWeight: 700,
            color: "#F97316",
            textDecoration: "none",
          }}
        >
          ← Back to SmartTroli
        </a>
      </div>
    </div>
  );
}
