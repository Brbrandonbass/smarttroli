import NavBar from "./NavBar";

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
      <NavBar />

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
