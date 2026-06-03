# SmartTroli Zambia — Catalogue PDFs

Drop Zambian store catalogue PDFs here and they will be automatically processed.

## How to add a catalogue

1. Download the PDF from the store's Facebook page or website
2. Rename it using this format: `StoreName_StartDate_EndDate.pdf`
3. Drag it into this folder on GitHub (or push via git)
4. GitHub Action will automatically extract all prices and save to database

## Naming examples

```
Shoprite_01May_14May2026.pdf
Choppies_07May_21May2026.pdf
PicknPay_05May_18May2026.pdf
Game_01May_31May2026.pdf
Spar_06May_19May2026.pdf
```

## Supported stores

- Shoprite
- Choppies
- Pick n Pay (or PnP)
- Game
- Spar
- Woolworths
- Food Lovers Market
- Checkers

## Where to get catalogues

- **Shoprite Zambia**: facebook.com/ShopriteZM or shoprite.co.zm
- **Choppies**: choppies.co.zm/promotions or their Facebook page
- **Pick n Pay**: picknpayzambia.com or their WhatsApp channel
- **Game**: massmart.co.zm or their Facebook page

## Notes

- PDF will be processed within minutes of being pushed
- Prices are saved in Zambian Kwacha (K)
- Duplicate catalogues (same store + validity date) are automatically skipped
