'use strict';
/**
 * Migration 002 - Products and inventory.
 * Stock is ALWAYS stored in single bottles/pieces. Packs/cartons/crates are display + entry conversions only.
 * Prices are integer paise PER SINGLE BOTTLE.
 */
module.exports = {
  version: 2,
  name: 'products_inventory',
  sql: `
CREATE TABLE products (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  brand              TEXT NOT NULL DEFAULT '',
  category           TEXT NOT NULL DEFAULT '',
  size               TEXT NOT NULL DEFAULT '',
  bottles_per_pack   INTEGER NOT NULL DEFAULT 1 CHECK (bottles_per_pack >= 1),
  bottles_per_carton INTEGER CHECK (bottles_per_carton IS NULL OR bottles_per_carton >= 1),
  bottles_per_crate  INTEGER CHECK (bottles_per_crate  IS NULL OR bottles_per_crate  >= 1),
  cost_price         INTEGER NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  retail_price       INTEGER NOT NULL DEFAULT 0 CHECK (retail_price >= 0),
  wholesale_price    INTEGER NOT NULL DEFAULT 0 CHECK (wholesale_price >= 0),
  low_stock_alert    INTEGER NOT NULL DEFAULT 0 CHECK (low_stock_alert >= 0),
  stock_qty          INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),   -- DB refuses negative stock
  is_active          INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX idx_products_identity ON products(name COLLATE NOCASE, brand COLLATE NOCASE, size COLLATE NOCASE);
CREATE INDEX idx_products_category ON products(category);

-- Every change to stock is a row here. products.stock_qty must always equal SUM(qty_change).
CREATE TABLE stock_movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL REFERENCES products(id),
  ts             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  movement_type  TEXT NOT NULL CHECK (movement_type IN
                   ('opening','purchase','sale','sale_return','purchase_return','adjustment','damage','audit')),
  qty_change     INTEGER NOT NULL CHECK (qty_change <> 0),     -- single bottles, + in / - out
  balance_after  INTEGER NOT NULL CHECK (balance_after >= 0),
  unit_cost      INTEGER,                                       -- paise per bottle at the time, when known
  ref_type       TEXT,
  ref_id         TEXT,
  note           TEXT,
  user_id        INTEGER REFERENCES users(id)
);
CREATE INDEX idx_sm_product ON stock_movements(product_id, id);
CREATE INDEX idx_sm_ref ON stock_movements(ref_type, ref_id);
CREATE TRIGGER sm_no_update BEFORE UPDATE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock movements are append-only; post a correcting movement'); END;
CREATE TRIGGER sm_no_delete BEFORE DELETE ON stock_movements
BEGIN SELECT RAISE(ABORT, 'stock movements are append-only; post a correcting movement'); END;

-- Prices change over time; old purchases and sales must keep their original numbers.
CREATE TABLE product_price_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL REFERENCES products(id),
  ts              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cost_price      INTEGER NOT NULL,
  retail_price    INTEGER NOT NULL,
  wholesale_price INTEGER NOT NULL,
  user_id         INTEGER REFERENCES users(id)
);
CREATE INDEX idx_pph_product ON product_price_history(product_id, id);
`,
};
