// TadweerHub API — Cloudflare Worker
// Routes: /api/users, /api/factories, /api/dropoffs, /api/pickups, /api/orders, /api/stats, /api/leaderboard

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const json  = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...cors } });
const error = (msg, status = 400)  => json({ error: msg }, status);

async function initDB(db) {
  await db.exec(`
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
      location TEXT NOT NULL,
      material_type TEXT DEFAULT 'plastic',
      notes TEXT,
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
      material TEXT NOT NULL,
      quantity_kg INTEGER NOT NULL,
      address TEXT NOT NULL,
      required_by TEXT,
      notes TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (factory_id) REFERENCES factories(id)
    );
  `);
}

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') return new Response(null, { headers: cors });

    try { await initDB(env.DB); } catch(e) { /* tables exist */ }

    // ── Users ─────────────────────────────────────────────────

    if (path === '/api/users' && method === 'POST') {
      const { name, email, phone } = await request.json();
      if (!name || !email) return error('name and email required');
      try {
        const user = await env.DB.prepare(
          'INSERT INTO users (name, email, phone) VALUES (?, ?, ?) RETURNING *'
        ).bind(name, email, phone || null).first();
        return json(user, 201);
      } catch(e) {
        if (e.message.includes('UNIQUE')) return error('Email already registered', 409);
        return error(e.message, 500);
      }
    }

    if (path === '/api/users' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY points DESC').all();
      return json(results);
    }

    if (path.match(/^\/api\/users\/\d+$/) && method === 'GET') {
      const id   = path.split('/')[3];
      const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      if (!user) return error('User not found', 404);
      return json(user);
    }

    // ── Factories ─────────────────────────────────────────────

    if (path === '/api/factories' && method === 'POST') {
      const { name, contact, email, phone, governorate, material_pref } = await request.json();
      if (!name || !email || !contact) return error('name, contact, and email required');
      try {
        const factory = await env.DB.prepare(
          'INSERT INTO factories (name, contact, email, phone, governorate, material_pref) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
        ).bind(name, contact, email, phone || null, governorate || null, material_pref || 'both').first();
        return json(factory, 201);
      } catch(e) {
        if (e.message.includes('UNIQUE')) return error('Email already registered', 409);
        return error(e.message, 500);
      }
    }

    if (path === '/api/factories' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM factories ORDER BY created_at DESC').all();
      return json(results);
    }

    if (path.match(/^\/api\/factories\/\d+$/) && method === 'GET') {
      const id      = path.split('/')[3];
      const factory = await env.DB.prepare('SELECT * FROM factories WHERE id = ?').bind(id).first();
      if (!factory) return error('Factory not found', 404);
      return json(factory);
    }

    // ── Drop-offs ─────────────────────────────────────────────

    if (path === '/api/dropoffs' && method === 'POST') {
      const { user_id, bottles, location, material_type, notes } = await request.json();
      if (!user_id || !bottles || !location) return error('user_id, bottles, and location required');
      if (bottles < 1 || bottles > 10000) return error('bottles must be between 1 and 10000');

      const dropoff = await env.DB.prepare(
        'INSERT INTO dropoffs (user_id, bottles, location, material_type, notes) VALUES (?, ?, ?, ?, ?) RETURNING *'
      ).bind(user_id, bottles, location, material_type || 'plastic', notes || null).first();

      await env.DB.prepare('UPDATE users SET points = points + ? WHERE id = ?').bind(bottles, user_id).run();

      return json(dropoff, 201);
    }

    if (path === '/api/dropoffs' && method === 'GET') {
      const userId = url.searchParams.get('user_id');
      let stmt, args;
      if (userId) {
        stmt = `SELECT d.*, u.name as user_name FROM dropoffs d JOIN users u ON d.user_id = u.id WHERE d.user_id = ? ORDER BY d.created_at DESC`;
        args = [userId];
      } else {
        stmt = `SELECT d.*, u.name as user_name FROM dropoffs d JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT 50`;
        args = [];
      }
      const { results } = await env.DB.prepare(stmt).bind(...args).all();
      return json(results);
    }

    // ── Pickups ───────────────────────────────────────────────

    if (path === '/api/pickups' && method === 'POST') {
      const { user_id, address, quantity, material_type, preferred_date } = await request.json();
      if (!user_id || !address || !quantity) return error('user_id, address, and quantity required');

      const pickup = await env.DB.prepare(
        'INSERT INTO pickups (user_id, address, quantity, material_type, preferred_date) VALUES (?, ?, ?, ?, ?) RETURNING *'
      ).bind(user_id, address, quantity, material_type || 'mixed', preferred_date || null).first();

      return json(pickup, 201);
    }

    if (path === '/api/pickups' && method === 'GET') {
      const userId = url.searchParams.get('user_id');
      let stmt, args;
      if (userId) {
        stmt = `SELECT p.*, u.name as user_name FROM pickups p JOIN users u ON p.user_id = u.id WHERE p.user_id = ? ORDER BY p.created_at DESC`;
        args = [userId];
      } else {
        stmt = `SELECT p.*, u.name as user_name FROM pickups p JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC LIMIT 50`;
        args = [];
      }
      const { results } = await env.DB.prepare(stmt).bind(...args).all();
      return json(results);
    }

    if (path.match(/^\/api\/pickups\/\d+\/status$/) && method === 'PUT') {
      const id     = path.split('/')[3];
      const { status } = await request.json();
      if (!['pending','confirmed','completed','cancelled'].includes(status)) return error('Invalid status');
      await env.DB.prepare('UPDATE pickups SET status = ? WHERE id = ?').bind(status, id).run();
      return json({ id, status });
    }

    // ── Supply Orders ─────────────────────────────────────────

    if (path === '/api/orders' && method === 'POST') {
      const { factory_id, material, quantity_kg, address, required_by, notes } = await request.json();
      if (!factory_id || !material || !quantity_kg || !address) return error('factory_id, material, quantity_kg, and address required');
      if (quantity_kg < 50) return error('Minimum order is 50 kg');

      const order = await env.DB.prepare(
        'INSERT INTO orders (factory_id, material, quantity_kg, address, required_by, notes) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
      ).bind(factory_id, material, quantity_kg, address, required_by || null, notes || null).first();

      return json(order, 201);
    }

    if (path === '/api/orders' && method === 'GET') {
      const factoryId = url.searchParams.get('factory_id');
      let stmt, args;
      if (factoryId) {
        stmt = `SELECT o.*, f.name as factory_name FROM orders o JOIN factories f ON o.factory_id = f.id WHERE o.factory_id = ? ORDER BY o.created_at DESC`;
        args = [factoryId];
      } else {
        stmt = `SELECT o.*, f.name as factory_name FROM orders o JOIN factories f ON o.factory_id = f.id ORDER BY o.created_at DESC LIMIT 50`;
        args = [];
      }
      const { results } = await env.DB.prepare(stmt).bind(...args).all();
      return json(results);
    }

    // ── Stats ─────────────────────────────────────────────────

    if (path === '/api/stats' && method === 'GET') {
      const totals = await env.DB.prepare(`
        SELECT
          (SELECT COUNT(*) FROM users)    as total_users,
          (SELECT COUNT(*) FROM factories) as total_factories,
          (SELECT COALESCE(SUM(bottles),0) FROM dropoffs) as total_bottles,
          (SELECT COUNT(*) FROM dropoffs)  as total_dropoffs,
          (SELECT COUNT(*) FROM pickups)   as total_pickups,
          (SELECT COUNT(*) FROM orders)    as total_orders
      `).first();

      const bottles = Number(totals.total_bottles);
      return json({
        total_users:      totals.total_users,
        total_factories:  totals.total_factories,
        total_bottles:    bottles,
        total_dropoffs:   totals.total_dropoffs,
        total_pickups:    totals.total_pickups,
        total_orders:     totals.total_orders,
        co2_saved_kg:     +(bottles * 0.082).toFixed(2),
        water_saved_liters: +(bottles * 3.5).toFixed(1),
        oil_saved_liters: +(bottles * 0.06).toFixed(2),
      });
    }

    // ── Leaderboard ───────────────────────────────────────────

    if (path === '/api/leaderboard' && method === 'GET') {
      const { results } = await env.DB.prepare(`
        SELECT u.id, u.name, u.points,
          COUNT(d.id) as dropoff_count,
          COALESCE(SUM(d.bottles), 0) as total_bottles
        FROM users u
        LEFT JOIN dropoffs d ON u.id = d.user_id
        GROUP BY u.id
        ORDER BY u.points DESC
        LIMIT 10
      `).all();
      return json(results);
    }

    return error('Not found', 404);
  },
};
