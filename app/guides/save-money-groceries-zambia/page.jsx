import GuideLayout, { sectionStyle, headingStyle, bodyStyle, listStyle } from "../../components/GuideLayout";

export const metadata = {
  title: "10 Ways to Save Money on Groceries in Zambia — SmartTroli",
  description:
    "Practical, Zambia-specific tips for cutting your grocery bill — from comparing Shoprite, Choppies and Pick n Pay prices to buying mealie meal in bulk and timing your shopping around specials.",
};

export default function SaveMoneyGuide() {
  return (
    <GuideLayout
      title="10 Ways to Save Money on Groceries in Zambia"
      subtitle="Zambian household budgets are tight right now, with mealie meal, cooking oil and transport costs all pulling in the same direction. None of these tips require a side hustle — just a bit of planning before you get to the till."
    >
      <div style={sectionStyle}>
        <div style={headingStyle}>1. Compare Prices Before You Travel</div>
        <p style={bodyStyle}>
          Fuel and minibus fare add up fast, and it's common in Lusaka, Ndola and Kitwe to find the same 5kg bag of
          mealie meal priced K15–K25 apart between Shoprite, Choppies and Pick n Pay. Check prices on SmartTroli
          before you leave the house rather than after you've already paid for a taxi to the wrong store.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>2. Build Your List Around What's on Special</div>
        <p style={bodyStyle}>
          Shoprite, Pick n Pay and Spar all run weekly catalogues, and Choppies runs frequent in-store specials on
          staples like cooking oil, rice and washing powder. Instead of shopping for a fixed list, glance at what's
          discounted this week and build meals around it — it's the single biggest lever most households aren't
          using.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>3. Buy Mealie Meal and Rice in Bulk</div>
        <p style={bodyStyle}>
          A 25kg bag of breakfast or roller meal is almost always cheaper per kilogram than four separate 5kg or
          10kg bags, and it doesn't spoil if stored dry. The same applies to rice and sugar at Choppies and Game —
          bulk bags cost more upfront but save 15–20% over the month.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>4. Don't Ignore the Kantemba and Tuntemba</div>
        <p style={bodyStyle}>
          Fresh vegetables, tomatoes, onions and rape are frequently cheaper at local markets or your neighbourhood
          kantemba than in a supermarket produce aisle. Reserve supermarket trips for packaged goods, toiletries and
          items that need refrigeration, and get fresh produce closer to home.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>5. Watch Unit Prices, Not Just the Sticker</div>
        <p style={bodyStyle}>
          A 2-litre cooking oil bottle on "special" isn't always cheaper per litre than a 5-litre bottle at full
          price. Zambian shelf labels don't always show price-per-unit, so do the quick math — or let SmartTroli do
          it — before assuming the discounted item is the better deal.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>6. Use Loyalty and Xtra Savings Programs</div>
        <p style={bodyStyle}>
          Shoprite's Xtra Savings card gives real, stacking discounts on hundreds of items every week at no cost to
          sign up. If you shop at the same chain regularly, the few minutes it takes to register more than pays for
          itself over a year.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>7. Shop Once a Week, Not Daily</div>
        <p style={bodyStyle}>
          Daily top-up shopping trips lead to impulse buys and repeated transport costs. Plan meals for the week,
          shop once, and keep a short "top-up only" list for bread, milk or airtime in between.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>8. Split Your Basket Across Two Stores</div>
        <p style={bodyStyle}>
          It's rarely one chain that's cheapest on everything. Choppies often beats Shoprite on basic dry goods,
          while Shoprite or Pick n Pay may have better specials on toiletries and frozen items that week. If both
          stores are on your normal route, splitting a large monthly shop can be worth the extra stop.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>9. Track Prices Over Time, Not Just Today</div>
        <p style={bodyStyle}>
          Prices on staples like cooking oil and sugar move with the exchange rate and fuel costs. If you can see
          that a product's price has been trending down, it's worth waiting a week rather than buying at a
          temporary high. SmartTroli's price history helps spot that pattern instead of guessing.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>10. Report Prices to Help Your Community</div>
        <p style={bodyStyle}>
          Catalogue prices go stale between print runs, but shoppers who report what they actually paid keep the
          picture current for everyone else. A five-second price report from your last receipt helps the next
          person in your area avoid overpaying.
        </p>
      </div>

      <div style={{ ...sectionStyle, ...listStyle, background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)" }}>
        <div style={headingStyle}>Put This Into Practice</div>
        <p style={bodyStyle}>
          The fastest way to apply all ten tips at once is to build your shopping list in SmartTroli — it compares
          Shoprite, Choppies, Pick n Pay, Spar and Game automatically and shows you which store wins on your actual
          basket, not just one item.
        </p>
      </div>
    </GuideLayout>
  );
}
