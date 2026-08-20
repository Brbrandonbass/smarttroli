import NavBar from "../components/NavBar";
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
      <NavBar />

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
