import GuideLayout, { sectionStyle, headingStyle, bodyStyle, listStyle } from "../../components/GuideLayout";

export const metadata = {
  title: "How to Feed a Family in Lusaka on a Budget — SmartTroli",
  description:
    "A practical monthly grocery budget for a Lusaka household, built around real staples — mealie meal, kapenta, vegetables and cooking oil — and how to keep it from creeping up.",
};

export default function LusakaBudgetGuide() {
  return (
    <GuideLayout
      title="How to Feed a Family in Lusaka on a Budget"
      subtitle="Groceries are usually the second-biggest line item in a Lusaka household budget after rent or transport. Here's how to structure a realistic monthly plan for a family of four to six."
    >
      <div style={sectionStyle}>
        <div style={headingStyle}>Start With Staples, Not a Recipe List</div>
        <p style={bodyStyle}>
          A Lusaka household budget holds together best when it's built around a core of mealie meal (or roller
          meal), rice, cooking oil, sugar, salt and beans first — the items that make up nshima and the sides
          around it most days of the week. Once those are budgeted, the remaining amount stretches across protein,
          vegetables and extras.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Protein: Mix Kapenta, Eggs and Chicken</div>
        <p style={bodyStyle}>
          Chicken and beef prices climb fastest with fuel and feed costs, so a budget that leans on chicken every
          day gets expensive quickly. Rotating in kapenta, eggs and dried beans a few times a week keeps protein
          costs down without cutting it from the plate.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Buy Vegetables Near Home, Not at the Supermarket</div>
        <p style={bodyStyle}>
          Rape, tomatoes, onions and cabbage are almost always cheaper from a local market or a tuntemba near your
          compound than from a supermarket produce section. Save supermarket trips for packaged and refrigerated
          goods, and get greens closer to where you live — ideally the same day you'll cook them.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Buy Staples in Bulk Once a Month</div>
        <p style={bodyStyle}>
          A 25kg bag of mealie meal, a bulk bag of rice, and a 5-litre bottle of cooking oil bought once a month
          almost always work out cheaper per unit than buying smaller packs every week, and they don't spoil if
          kept dry. Budget for this bulk purchase as one lump sum at the start of the month rather than spreading it
          thin.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Compare Before Every Big Shop</div>
        <p style={bodyStyle}>
          The same monthly basket can cost noticeably different amounts at Shoprite, Choppies, Pick n Pay or Spar
          depending on that week's specials. For a family shop this size, even a 10% difference is real money —
          worth the two minutes it takes to check prices before you go.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Leave Room for Price Shocks</div>
        <p style={bodyStyle}>
          Fuel price changes and exchange rate movements can push staple prices up with little warning. Building a
          small buffer — even 5-10% — into your monthly grocery budget means a bad month doesn't force you to cut
          into other essentials.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>A Rough Monthly Split for a Family of Five</div>
        <p style={bodyStyle}>
          As a starting point, many Lusaka households split a monthly grocery budget roughly as follows: about a
          third on staples (mealie meal, rice, cooking oil, sugar, salt), a third on protein (kapenta, eggs, beans
          and some chicken), and the remaining third on vegetables, bread, milk and household basics like soap and
          washing powder. Your actual split will shift with family size and how often you eat out, but it's a
          useful starting point before you adjust to what your household actually eats.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Don't Forget Transport in the Total Cost</div>
        <p style={bodyStyle}>
          A trip to a supermarket further from home can add K20-K50 in taxi or minibus fare on top of the shopping
          bill — enough to cancel out a small price saving on the goods themselves. When comparing where to shop,
          factor in the return trip cost, not just the shelf price, especially for a once-a-month bulk run where
          you'll be carrying heavier bags.
        </p>
      </div>

      <div style={{ ...sectionStyle, ...listStyle, background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)" }}>
        <div style={headingStyle}>Plan Your Month in SmartTroli</div>
        <p style={bodyStyle}>
          Add your family's usual monthly list to SmartTroli and it'll split it across the cheapest combination of
          Shoprite, Choppies, Pick n Pay, Spar and Game for you — so the budget above is grounded in this week's
          actual prices, not last month's.
        </p>
      </div>
    </GuideLayout>
  );
}
