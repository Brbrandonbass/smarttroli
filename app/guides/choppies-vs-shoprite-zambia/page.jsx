import GuideLayout, { sectionStyle, headingStyle, bodyStyle, listStyle } from "../../components/GuideLayout";

export const metadata = {
  title: "Choppies vs Shoprite Zambia: Which is Cheaper? — SmartTroli",
  description:
    "A category-by-category look at how Choppies and Shoprite prices compare in Zambia — staples, fresh produce, toiletries and specials — so you know which store to head to for your list.",
};

export default function ChoppiesVsShoprite() {
  return (
    <GuideLayout
      title="Choppies vs Shoprite Zambia: Which is Cheaper?"
      subtitle="Two of the most common supermarkets on a Zambian shopping route, and the question we get asked more than any other. The honest answer is: it depends what's in your basket."
    >
      <div style={sectionStyle}>
        <div style={headingStyle}>The Short Answer</div>
        <p style={bodyStyle}>
          Neither chain is cheaper across the board. Choppies tends to undercut Shoprite on basic dry goods —
          mealie meal, rice, cooking oil and sugar — where its Botswana-linked supply chain keeps bulk staple
          prices competitive. Shoprite tends to win on weekly specials, imported and branded goods, and anything
          covered by its Xtra Savings program. The right move is comparing your actual list, not picking a "winner"
          store once and sticking with it.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Staples: Mealie Meal, Rice, Sugar, Cooking Oil</div>
        <p style={bodyStyle}>
          This is where Choppies most often has the edge. Bulk bags of breakfast meal, rice and sugar are usually a
          few Kwacha cheaper per unit than the equivalent at Shoprite, especially outside of a specific Shoprite
          promotion. If your basket is staple-heavy, start your comparison at Choppies.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Weekly Specials and Branded Goods</div>
        <p style={bodyStyle}>
          Shoprite's weekly catalogue frequently discounts specific branded items — snacks, frozen meat, toiletries,
          cleaning products — well below Choppies' everyday price on the same brand. If you're loyal to particular
          brands rather than generic equivalents, checking that week's Shoprite catalogue before you shop is worth
          it.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Fresh Produce and Bakery</div>
        <p style={bodyStyle}>
          Both chains are usually beaten by a local market or kantemba on fresh vegetables. Between the two
          supermarkets, prices tend to be close enough that convenience and freshness on the day matter more than
          the few Ngwee difference in price.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Toiletries, Cleaning and Household Goods</div>
        <p style={bodyStyle}>
          For soap, washing powder, toothpaste and cleaning supplies, the gap between the two chains is usually
          smaller than on staples or specials — often just a few Ngwee either way on the same size and brand. This
          is the category where checking that specific week's prices matters most, since a single Shoprite
          promotion can flip the usual pattern overnight.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>Store Footprint Matters Too</div>
        <p style={bodyStyle}>
          Shoprite has a wider branch network across Lusaka, the Copperbelt and provincial towns, so it's often the
          more convenient option even when it isn't the absolute cheapest. Choppies' footprint is smaller but
          growing, and where both are on your route the price difference is usually worth the extra stop.
        </p>
      </div>

      <div style={sectionStyle}>
        <div style={headingStyle}>A Simple Rule of Thumb</div>
        <p style={bodyStyle}>
          If your list is mostly bulk staples — mealie meal, rice, sugar, cooking oil — lean toward Choppies as your
          default. If your list leans toward branded snacks, frozen meat, toiletries or anything that might be on
          this week's Shoprite catalogue, check Shoprite first. For a mixed list, which is most households' reality,
          the only reliable answer is to compare both before you commit to one store for the whole trip.
        </p>
      </div>

      <div style={{ ...sectionStyle, ...listStyle, background: "rgba(249,115,22,0.08)", border: "1px solid rgba(249,115,22,0.25)" }}>
        <div style={headingStyle}>The Real Answer: Check Both, Every Time</div>
        <p style={bodyStyle}>
          Prices shift week to week with specials, exchange rates and stock. Rather than guessing which chain wins
          this month, add your list to SmartTroli and it'll show you, item by item, whether Choppies or Shoprite —
          or Pick n Pay, Spar or Game — is cheapest right now.
        </p>
      </div>
    </GuideLayout>
  );
}
