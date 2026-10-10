# Bijak AI — dormathon-four-piece

AI inventory & sales assistant for small businesses (demo shop: *Kedai Kak Ros*, a home bakery).
React + Vite front end only — **no backend or database**. All data is mock data in
`src/data/mockData.js`; your edits are kept in the browser's localStorage
(Settings → Reset brings back the original data).

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

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
