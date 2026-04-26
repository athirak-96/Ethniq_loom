require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const DB_PATH = process.env.DB_PATH || 'database.db';
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    items            TEXT    NOT NULL,
    total            INTEGER NOT NULL,
    address          TEXT,
    razorpay_order_id TEXT,
    status           TEXT    DEFAULT 'pending',
    createdAt        INTEGER DEFAULT (strftime('%s','now'))
  )
`);

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ── Admin auth (HTTP Basic) ──────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Ethniq Loom Admin"');
    return res.status(401).send('Login required');
  }
  const decoded = Buffer.from(auth.slice(6), 'base64').toString();
  const password = decoded.slice(decoded.indexOf(':') + 1);
  if (password === process.env.ADMIN_PASSWORD) return next();
  res.set('WWW-Authenticate', 'Basic realm="Ethniq Loom Admin"');
  res.status(401).send('Invalid password');
}

// Block direct file access — admin must go through the protected route
app.get('/admin.html', (_req, res) => res.redirect('/admin'));

// Protected admin page
app.get('/admin', requireAdmin, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve everything else statically
app.use(express.static('public'));

// ── Config (public key ID is safe to expose) ────────────────────────────────
app.get('/config', (_req, res) => {
  res.json({ razorpayKeyId: process.env.RAZORPAY_KEY_ID });
});

// ── Products ─────────────────────────────────────────────────────────────────
app.get('/products', (_req, res) => {
  const data = fs.readFileSync('products.json');
  res.json(JSON.parse(data));
});

// ── Create order ─────────────────────────────────────────────────────────────
app.post('/create-order', async (req, res) => {
  const { items, total, address } = req.body;

  try {
    const razorpayOrder = await razorpay.orders.create({
      amount:   total * 100,
      currency: 'INR',
      receipt:  `order_${Date.now()}`,
    });

    db.prepare(`
      INSERT INTO orders (items, total, address, razorpay_order_id, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(JSON.stringify(items), total, JSON.stringify(address), razorpayOrder.id);

    res.json({
      amount:          razorpayOrder.amount,
      razorpayOrderId: razorpayOrder.id,
    });

  } catch (err) {
    console.error('Razorpay error:', err);
    res.status(500).json({ error: 'Could not create order' });
  }
});

// ── Verify payment ────────────────────────────────────────────────────────────
app.post('/verify-payment', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ success: false, error: 'Invalid signature' });
  }

  db.prepare("UPDATE orders SET status = 'paid' WHERE razorpay_order_id = ?")
    .run(razorpay_order_id);

  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
