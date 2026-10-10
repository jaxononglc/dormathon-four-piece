# Bijak AI — dormathon-four-piece

AI inventory & sales assistant for small businesses (demo shop: *Kedai Kak Ros*, a home bakery).
React + Vite front end with a small API (`server/api.js`) on a Neon Postgres database.
Gemini (optional) powers the AI Advisor, the paper-record scan and the sales forecast.

## Run

```bash
npm install
cp .env.example .env     # fill in DATABASE_URL (and GEMINI_API_KEY for the AI features)
npm run db:setup         # creates the tables, loads the demo shop into an empty database
npm run dev              # http://localhost:5173 (the API runs inside the Vite dev server)
npm run build            # production build in dist/
```

## Deploy to Vercel

1. Import the repo in Vercel (framework: Vite; `vercel.json` sets the build, the page rewrites and the 60 s limit for AI calls).
2. Project → Settings → Environment Variables: `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`.
3. Run `npm run db:setup` once against that database.
4. In production, `/api/*` is served by `api/[...path].js` (the same code as `server/api.js`), and
   "Reset demo data" is switched off unless you add `ALLOW_RESET=true`.

## Pages

| Route | Screen |
|---|---|
| `/` | Overview dashboard + AI Advisor panel, "Record New Sale" (daily sales modal) |
| `/inventory` | Stock catalog: search, filters, quick +/-, add / edit / delete, CSV export |
| `/inventory/reorder` | Reorder helper: suggested quantities, receive one / receive all |
| `/sales` | Sales analysis: period switch, revenue trend, top products, margins, slow movers |
| `/advisor` | AI Advisor chat (mock replies built from live store data) |
| `/settings` | Reset demo data |

## Structure

```
src/
  data/mockData.js      mock products, sales records, analysis data
  store/AppStore.jsx    global state (useReducer + context, persisted to localStorage)
  store/Toast.jsx       toast notifications
  lib/advisor.js        keyword-based mock AI replies
  lib/format.js         RM / date formatting, CSV download
  components/           Sidebar, KpiCard, Charts (SVG), Modal, StockForm, DailySalesModal…
  pages/                Dashboard, Inventory, SalesAnalysis, Advisor, Settings
  styles/app.css        design tokens + all styles
```
