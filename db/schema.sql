-- Bijak AI schema (Neon Postgres). Mirrors the in-memory store in src/store/AppStore.jsx.
-- Safe to run more than once: every statement is IF NOT EXISTS.
-- Run with: npm run db:setup

-- Lookup lists for the Category / Supplier comboboxes.
CREATE TABLE IF NOT EXISTS categories (
  name        text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  name        text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- price IS NULL means the item is not sold directly (ingredients, packaging).
CREATE TABLE IF NOT EXISTS products (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  sku         text UNIQUE,
  category    text REFERENCES categories (name) ON UPDATE CASCADE,
  supplier    text REFERENCES suppliers (name) ON UPDATE CASCADE,
  location    text NOT NULL DEFAULT '',
  stock       numeric(10, 2) NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock   numeric(10, 2) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  unit        text NOT NULL,
  cost        numeric(10, 2) NOT NULL CHECK (cost >= 0),
  price       numeric(10, 2) CHECK (price >= 0),
  expiry      date,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Units sold per product per day (one row per product per day, like store.sales).
CREATE TABLE IF NOT EXISTS sales (
  sale_date   date NOT NULL,
  product_id  text NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  units       integer NOT NULL CHECK (units > 0),
  PRIMARY KEY (sale_date, product_id)
);
CREATE INDEX IF NOT EXISTS sales_product_idx ON sales (product_id);

-- AI Advisor conversations.
-- kind = 'dashboard': one per day (id 'dashboard-yyyy-mm-dd'); today's is pinned,
--   past days show in the history.
-- kind = 'advice': the single pinned "Today's advice" chat (id 'advice').
-- kind = 'chat': normal chats.
CREATE TABLE IF NOT EXISTS chats (
  id          text PRIMARY KEY,
  kind        text NOT NULL DEFAULT 'chat' CHECK (kind IN ('chat', 'dashboard', 'advice')),
  day         date,
  title       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id          text PRIMARY KEY,
  chat_id     text NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user', 'ai')),
  text        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_chat_idx ON messages (chat_id, created_at);

-- Upgrade from the first version (one pinned dashboard chat, no `day`).
ALTER TABLE chats ADD COLUMN IF NOT EXISTS day date;
DROP INDEX IF EXISTS chats_one_pinned_per_kind;
DELETE FROM chats WHERE id = 'dashboard' AND NOT EXISTS (SELECT 1 FROM messages WHERE chat_id = 'dashboard');
CREATE UNIQUE INDEX IF NOT EXISTS chats_one_dashboard_per_day ON chats (day) WHERE kind = 'dashboard';

-- Advice cards the owner pressed "Not now" on (ids from src/lib/advice.js).
CREATE TABLE IF NOT EXISTS dismissed_advice (
  advice_id     text PRIMARY KEY,
  dismissed_at  timestamptz NOT NULL DEFAULT now()
);
