import NavBar from "../components/NavBar";

export const metadata = {
  title: "Privacy Policy — SmartTroli",
  description: "How SmartTroli collects, uses, and protects your data.",
};

const sectionStyle = {
  background: "rgba(255,255,255,0.035)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "16px",
  padding: "20px",
  marginBottom: "16px",
};

const headingStyle = {
  fontSize: "11px",
  fontWeight: 800,
  color: "#F97316",
  textTransform: "uppercase",
  letterSpacing: "2px",
  marginBottom: "10px",
};

const bodyStyle = {
  fontSize: "14.5px",
  color: "rgba(245,240,232,0.8)",
  lineHeight: 1.6,
};

const listStyle = {
  ...bodyStyle,
  paddingLeft: "20px",
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

export default function PrivacyPage() {
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

      <div style={{ maxWidth: "640px", margin: "0 auto", padding: "32px 18px 60px" }}>
        <h1 style={{ fontSize: "clamp(26px, 6vw, 34px)", fontWeight: 900, letterSpacing: "-1px", marginBottom: "6px" }}>
          Privacy Policy
        </h1>
        <p style={{ fontSize: "13px", color: "rgba(245,240,232,0.45)", marginBottom: "28px" }}>
          Last updated: July 2026
        </p>

        <div style={sectionStyle}>
          <div style={headingStyle}>Data We Collect</div>
          <ul style={listStyle}>
            <li>
              <strong style={{ color: "#F5F0E8" }}>Email address</strong> — only when you set a price alert or save a
              shopping list, so we know where to send notifications or which list to load back.
            </li>
            <li>
              <strong style={{ color: "#F5F0E8" }}>Shopping lists</strong> — the items you add are stored in your
              browser&rsquo;s local storage, and saved lists are also stored against your email if you use Save List.
            </li>
            <li>
              <strong style={{ color: "#F5F0E8" }}>Community price submissions</strong> — the store, product, price,
              and optional location/branch you submit when reporting a price.
            </li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <div style={headingStyle}>How We Use It</div>
          <ul style={listStyle}>
            <li>To send you a price alert when an item drops to or below your target price.</li>
            <li>To let you save and reload your shopping list across visits.</li>
            <li>To improve the accuracy of prices shown to everyone, using community-submitted data.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <div style={headingStyle}>We Don&rsquo;t Sell Your Data</div>
          <p style={bodyStyle}>
            We don&rsquo;t sell your data to third parties. Your email is used only for the features you explicitly
            opt into — price alerts and saved lists.
          </p>
        </div>

        <div style={sectionStyle}>
          <div style={headingStyle}>Community Submissions Are Public</div>
          <p style={bodyStyle}>
            Prices you report through the community feature (store, product, price, and any location note) are
            visible to all SmartTroli users, since the whole point is helping other shoppers find accurate prices.
            Your email is not attached to or shown with community submissions.
          </p>
        </div>

        <div style={sectionStyle}>
          <div style={headingStyle}>Local Storage</div>
          <p style={bodyStyle}>
            We use your browser&rsquo;s local storage to remember preferences (like your store filter and location)
            and to keep your current shopping list between visits. This stays on your device and isn&rsquo;t sent to
            us unless you use a feature — like Save List or Share List — that explicitly requires it.
          </p>
        </div>

        <div style={sectionStyle}>
          <div style={headingStyle}>Contact</div>
          <p style={bodyStyle}>
            Questions about this policy or your data? Email{" "}
            <a href="mailto:privacy@smarttroli.com" style={{ color: "#FFD700", fontWeight: 700, textDecoration: "underline" }}>
              privacy@smarttroli.com
            </a>
            .
          </p>
        </div>

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
