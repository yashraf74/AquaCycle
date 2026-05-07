CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  points INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS factories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  governorate TEXT,
  material_pref TEXT DEFAULT 'both',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dropoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  bottles INTEGER NOT NULL,
  weight_kg REAL NOT NULL DEFAULT 0,
  location TEXT NOT NULL,
  material_type TEXT DEFAULT 'plastic',  -- 'plastic' | 'cans' (no mixed)
  notes TEXT,
  points_earned INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS pickups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  address TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  material_type TEXT DEFAULT 'mixed',
  preferred_date TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  factory_id INTEGER NOT NULL,
  invoice_id TEXT NOT NULL,           -- e.g. INV-LB3K2XF-A4C1
  material TEXT NOT NULL,
  quantity_kg INTEGER NOT NULL,
  price_per_kg INTEGER NOT NULL DEFAULT 0,
  total_egp INTEGER NOT NULL DEFAULT 0,
  address TEXT NOT NULL,
  required_by TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (factory_id) REFERENCES factories(id)
);
