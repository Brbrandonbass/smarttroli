import { sectionStyle, headingStyle, bodyStyle } from "../components/GuideLayout";

export const metadata = {
  title: "Grocery Shopping Guides — SmartTroli",
  description:
    "Practical guides for smarter grocery shopping in Zambia — saving money, comparing Choppies and Shoprite, and budgeting for a Lusaka household.",
};

const guides = [
  {
    href: "/guides/save-money-groceries-zambia",
    title: "10 Ways to Save Money on Groceries in Zambia",
    blurb: "Practical, Zambia-specific tips for cutting your grocery bill every month.",
  },
  {
    href: "/guides/choppies-vs-shoprite-zambia",
    title: "Choppies vs Shoprite Zambia: Which is Cheaper?",
    blurb: "A category-by-category look at how the two chains actually compare on price.",
  },
  {
    href: "/guides/grocery-budget-lusaka",
    title: "How to Feed a Family in Lusaka on a Budget",
    blurb: "A realistic monthly grocery plan built around real Zambian staples.",
  },
  {
    href: "/zambia-grocery-prices",
    title: "Current Grocery Prices in Zambia 2026",
    blurb: "Live prices for common grocery items, pulled straight from SmartTroli's database.",
  },
];

export default function GuidesIndex() {
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

      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "32px 18px 60px" }}>
        <h1 style={{ fontSize: "clamp(26px, 6vw, 34px)", fontWeight: 900, letterSpacing: "-1px", marginBottom: "6px" }}>
          Guides
        </h1>
        <p style={{ fontSize: "14px", color: "rgba(245,240,232,0.55)", marginBottom: "28px", lineHeight: 1.5 }}>
          Practical guides for smarter grocery shopping in Zambia.
        </p>

        {guides.map((g) => (
          <a key={g.href} href={g.href} style={{ textDecoration: "none" }}>
            <div style={{ ...sectionStyle, cursor: "pointer" }}>
              <div style={{ ...headingStyle, color: "#FFD700" }}>{g.title}</div>
              <p style={bodyStyle}>{g.blurb}</p>
            </div>
          </a>
        ))}

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
