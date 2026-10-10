## Project Description
This project 'bijak ai' is aimed towards to help SME to minimize their workflow while also enabling them to make smart analyzation for their business with very little amount of friction 

## Getting started

### Option 1: just open the live app (nothing to install)

The app is already deployed and connected to its database: **https://four-bijak.vercel.app**
It works on a phone and on a computer, so you can use it right away.

### Option 2: run it on your own computer

**What you need to download / have**

1. **Node.js** (version 20 or newer): https://nodejs.org
2. **Git** to download the code (https://git-scm.com), or use the green *Code → Download ZIP* button on GitHub.
3. A free **Neon** Postgres database (https://neon.tech). Create a project and copy its connection string; this is `DATABASE_URL`.
4. *Optional:* a **Gemini API key** (https://aistudio.google.com/apikey) for the AI Advisor chat and the Dashboard forecast. Without it the app still works and uses built-in answers.

**After downloading, run these commands** in the project folder:

```bash
git clone https://github.com/jaxononglc/dormathon-four-piece.git
cd dormathon-four-piece
npm install                    # downloads the libraries the project uses
cp .env.example .env           # on Windows PowerShell: copy .env.example .env
```

Open the new `.env` file and fill in `DATABASE_URL` (and `GEMINI_API_KEY` if you have one). Then:

```bash
npm run db:setup               # creates the tables and loads the demo shop (run once)
npm run dev                    # starts the app at http://localhost:5173
```

Open **http://localhost:5173** in your browser. Use `npm run build` to make a production build.

## Features

### Record daily sales

The **Record New Sale** pop-up keeps **one record per day**, with two numbers per product: units sold and units damaged.

- Pick any date with the month arrows (‹ ›), the date picker on the month label, or the scrolling day row. A day with nothing saved shows **Missing**.
- It lists every inventory item that is **still in stock**. Items without a selling price (ingredients, packaging) can be marked damaged but not sold. Items on the day's record stay visible even if they have sold out since.
- **Save** stores the day's sales and damaged goods and moves stock right away. A saved day is locked; **Edit** reopens it and stock moves by the difference. **Delete day's record** returns the units to stock.
- Sold + damaged can never exceed the stock available.
- Damaged goods are stored in the `DamageLog` table (one row per item per day); sales in `Sales` / `SalesItem`.

### Scan paper record

The camera button on the Record pop-up reads a photo of a sales sheet and fills the **Units sold** and **Damaged** boxes. Nothing is saved until you press Save.

- On a phone the button opens the **camera**; the picture icon next to it picks a photo from the gallery. On a computer it opens the file picker.
- The photo is read **on the device** with OCR (`src/lib/scan.js`) and the text is matched to your products by plain code (`src/lib/ocrParse.js`). No upload, no tokens. The first scan downloads the OCR engine from a CDN.
- It understands tables with a header row (e.g. `Item ID | Item Name | Item Cost Price | Item Sold`): only the **name** and the **sold / damaged** columns are used, so IDs and prices are ignored. It also understands plain lines (`Kek Lapis 34 2`) and words such as `sold 12`, `rosak 2`, `DG 2`, `dmg`, `reject`, `buang`.
- Rows the reader is unsure about are highlighted amber with the text it read, so you can correct them.
- **Limit:** OCR reads printed text and neat block writing well, but **messy handwriting poorly**. Check every highlighted row.

### Sales analysis

All numbers are worked out in code from the database (`src/lib/analysis.js`), so the page is instant and uses no AI tokens.

- Periods: **1 week, 1 month, 3 months, 1 year**, or a **custom date range** from the calendar button. Each period is compared with the same number of days right before it.
- Cards: Revenue, Units sold, Gross profit (with margin), Damaged goods (units and RM lost).
- Revenue trend: hover or tap a point to see *This period*, *Previous period*, and the difference in RM.
- Top products (units, damaged, revenue, margin), margin by product against the 35% target, and slow movers (little or no sales, or expiring within a week).
- The report icon exports a CSV.

### Dashboard forecast

The dashed bars for the rest of the week come from Gemini, which reads the last 8 weeks of daily revenue and the upcoming events (`src/lib/forecast.js`). The answer is cached in the browser and only asked again when sales change. Without Gemini, it falls back to an average of the same weekday (labelled **Estimate**).

### AI Advisor

Chat answers come from Gemini using a live snapshot of stock and sales. When Gemini is slow or unavailable, it quietly answers from built-in rules (`src/lib/advisor.js`) using the same data. The free Gemini plan allows about **20 requests a day**; the Advisor and the forecast share it.

# Bijak AI — dormathon-four-piece

AI inventory & sales assistant for small businesses (demo shop: *Kedai Kak Ros*, a home bakery).

- **Front end:** React + Vite, built for phones first (bottom tab bar, card layouts) and works on desktop too.
- **Back end:** a small API (`server/api.js`) on a **Neon Postgres** database. In development it runs inside the Vite dev server; on Vercel it runs as a serverless function (`api/[...path].js`).
- **AI:** Gemini (optional) powers the AI Advisor chat and the Dashboard sales forecast. Reading a paper sales sheet is done **on the device** with OCR (`tesseract.js`), with no AI service. Sales analysis is plain code.

## Run

```bash
npm install
cp .env.example .env     # fill in DATABASE_URL (and GEMINI_API_KEY for the AI features)
npm run db:setup         # creates the tables, loads the demo shop into an empty database
npm run dev              # http://localhost:5173 (the API runs inside the Vite dev server)
npm run build            # production build in dist/
```

| Variable | Needed for |
|---|---|
| `DATABASE_URL` | the Neon database (required) |
| `GEMINI_API_KEY` | AI Advisor chat and the Dashboard forecast (without it the app falls back to built-in answers and a simple estimate) |
| `GEMINI_MODEL` | model name, default `gemini-3.8-flash` |
| `ALLOW_RESET` | set to `true` on Vercel to allow "Reset demo data" (off there by default) |

These are server-only. Never prefix them with `VITE_`, which would put them in the browser bundle.

`npm run db:migrate` moves data from the older table layout to the current one (one-off; see `db/migrate.mjs`).



## Pages

| Route | Screen |
|---|---|
| `/` | Dashboard: stock / sales cards, Daily sales chart with a forecast, **Record New Sale**, and the AI Advisor panel (desktop only) |
| `/inventory` | Stock & inventory: search, filters, add / edit / delete, per-product history, CSV export |
| `/sales` | Sales analysis: periods, revenue trend, top products, margins, slow movers, export |
| `/advisor` | AI Advisor chat with history, receipts, and a product picker |
| `/settings` | Shop profile and (locally) Reset demo data |



## Data model

Tables are in `db/schema.sql`: `Shop`, `Users`, `Category`, `Supplier`, `Item`, `Inventory`, `Sales`, `SalesItem`, `DamageLog`, `Restocklog`, `StockLog`, `Chat`, `Message`, `DismissedAdvice`.

## Structure

```
api/[...path].js        Vercel function: serves /api/* with server/api.js
vercel.json             build, page rewrites, 60 s limit for AI calls
server/api.js           API routes (state, products, sales, damage, stock log, chats, AI, forecast)
server/seed.js          demo data queries
db/                     schema.sql, setup.mjs, migrate.mjs, demo-data.js
src/
  App.jsx               routes and layout
  store/AppStore.jsx    global state (useReducer + context); saves each action to the API
  lib/analysis.js       sales analysis in code
  lib/ocrParse.js       turns OCR text / tables into sold + damaged rows
  lib/scan.js           photo preparation + OCR (tesseract.js)
  lib/forecast.js       Dashboard forecast (Gemini, with fallback)
  lib/gemini.js         AI Advisor request + shop snapshot
  lib/advisor.js        built-in answers used when Gemini is unavailable
  lib/api.js            fetch helper and action → API calls
  components/           DailySalesModal, Charts (SVG), Modal, MobileNav, StockForm, …
  pages/                Dashboard, Inventory, SalesAnalysis, Advisor, Settings
  styles/app.css        design tokens + all styles (mobile rules at the bottom)
  data/                 config.js (app settings), mockData.js (a few demo constants)
```

## Known limits

- **No login.** Anyone with the site link can read and change the shop's data and use the Gemini quota.
- OCR cannot reliably read messy handwriting (see Scan paper record).
- A few Dashboard figures are still fixed demo values: the "vs last week" numbers on the cards and the Month view of the Daily sales chart (`src/data/mockData.js`).
