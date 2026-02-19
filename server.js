const express = require('express');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Password Hashing ---
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === test;
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Clean URLs: /ranking → /ranking.html, /admin → /admin.html
app.use((req, res, next) => {
  if (!path.extname(req.path) && req.path !== '/') {
    const filePath = path.join(__dirname, 'public', req.path + '.html');
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  next();
});

// --- Database Setup ---
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    active_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    middle_name TEXT,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    activity_id INTEGER NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (activity_id) REFERENCES activities(id)
  );
`);

// Admin users table
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Seed super admin if not exists
const superAdmin = db.prepare('SELECT id FROM admin_users WHERE email = ?').get('mohanad@lagloire.sa');
if (!superAdmin) {
  db.prepare('INSERT INTO admin_users (email, password_hash, role) VALUES (?, ?, ?)').run(
    'mohanad@lagloire.sa', hashPassword('mohanad123'), 'super_admin'
  );
}

// Migration: add email column if missing (for existing databases)
try {
  db.exec(`ALTER TABLE participants ADD COLUMN email TEXT NOT NULL DEFAULT ''`);
} catch (e) {
  // Column already exists
}

// Migration: normalize emails to lowercase
db.exec(`UPDATE participants SET email = LOWER(email)`);

// Migration: remove duplicate (email + activity_id) entries, keeping the first
db.exec(`
  DELETE FROM participants WHERE id NOT IN (
    SELECT MIN(id) FROM participants GROUP BY LOWER(email), activity_id
  )
`);

// Migration: add unique constraint on email + activity_id
db.exec(`DROP INDEX IF EXISTS idx_email_activity`);
db.exec(`CREATE UNIQUE INDEX idx_email_activity ON participants(email, activity_id)`);

// --- Public Routes ---

// Get activities available today
app.get('/api/activities/today', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const activities = db.prepare(
    'SELECT id, name, points, active_date FROM activities WHERE active_date = ?'
  ).all(today);
  res.json(activities);
});

// Register a participant
app.post('/api/register', (req, res) => {
  const { first_name, last_name, email, activity_id } = req.body;

  if (!first_name || !last_name || !email || !activity_id) {
    return res.status(400).json({ error: 'First name, last name, email, and activity are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(activity_id);
  if (!activity) {
    return res.status(400).json({ error: 'Invalid activity selected.' });
  }

  const today = new Date().toISOString().split('T')[0];
  if (activity.active_date !== today) {
    return res.status(400).json({ error: 'This activity is not available today.' });
  }

  // Check for duplicate: same email + same activity
  const existing = db.prepare(
    'SELECT id FROM participants WHERE email = ? AND activity_id = ?'
  ).get(normalizedEmail, activity_id);

  if (existing) {
    return res.status(400).json({ error: 'You have already registered for this activity.' });
  }

  const result = db.prepare(
    'INSERT INTO participants (first_name, middle_name, last_name, email, activity_id) VALUES (?, ?, ?, ?, ?)'
  ).run(first_name, '', last_name, normalizedEmail, activity_id);

  res.json({ success: true, id: result.lastInsertRowid });
});

// Get public ranking (aggregated by email, sorted by total points)
app.get('/api/ranking', (req, res) => {
  const participants = db.prepare(`
    SELECT
      p.email,
      first_reg.first_name,
      first_reg.last_name,
      SUM(a.points) AS total_points
    FROM participants p
    JOIN activities a ON p.activity_id = a.id
    JOIN (
      SELECT email, first_name, last_name
      FROM participants
      WHERE id IN (SELECT MIN(id) FROM participants GROUP BY email)
    ) first_reg ON first_reg.email = p.email
    GROUP BY p.email
    ORDER BY total_points DESC
  `).all();
  res.json(participants);
});

// --- Admin Routes ---

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  res.json({ success: true, email: user.email, role: user.role });
});

// --- Super Admin: User Management ---
function requireSuperAdmin(req, res, next) {
  const adminEmail = req.headers['x-admin-email'];
  if (!adminEmail) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(adminEmail);
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied. Super admin only.' });
  }
  next();
}

// List admin users
app.get('/api/admin/users', requireSuperAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, role, created_at FROM admin_users ORDER BY created_at ASC').all();
  res.json(users);
});

// Create admin user
app.post('/api/admin/users', requireSuperAdmin, (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email already exists.' });
  }

  const result = db.prepare('INSERT INTO admin_users (email, password_hash, role) VALUES (?, ?, ?)').run(
    normalizedEmail, hashPassword(password), 'admin'
  );

  res.json({ success: true, id: result.lastInsertRowid });
});

// Delete admin user
app.delete('/api/admin/users/:id', requireSuperAdmin, (req, res) => {
  const { id } = req.params;

  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (user.role === 'super_admin') {
    return res.status(400).json({ error: 'Cannot delete the super admin.' });
  }

  db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
  res.json({ success: true });
});

// List all activities with participant count
app.get('/api/admin/activities', (req, res) => {
  const activities = db.prepare(`
    SELECT a.id, a.name, a.points, a.active_date,
      (SELECT COUNT(*) FROM participants p WHERE p.activity_id = a.id) AS participant_count
    FROM activities a
    ORDER BY a.active_date DESC
  `).all();
  res.json(activities);
});

// Get participants for a specific activity
app.get('/api/admin/activities/:id/participants', (req, res) => {
  const { id } = req.params;
  const participants = db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.email, p.submitted_at
    FROM participants p
    WHERE p.activity_id = ?
    ORDER BY p.submitted_at ASC
  `).all(id);
  res.json(participants);
});

// Export participants for a specific activity as Excel
app.get('/api/admin/activities/:id/export', async (req, res) => {
  const { id } = req.params;
  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
  if (!activity) {
    return res.status(404).json({ error: 'Activity not found.' });
  }

  const participants = db.prepare(`
    SELECT p.first_name, p.last_name, p.email, p.submitted_at
    FROM participants p
    WHERE p.activity_id = ?
    ORDER BY p.submitted_at ASC
  `).all(id);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Participants');

  sheet.columns = [
    { header: '#', key: 'num', width: 6 },
    { header: 'First Name', key: 'first_name', width: 18 },
    { header: 'Last Name', key: 'last_name', width: 18 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Registered At', key: 'submitted_at', width: 22 },
  ];

  sheet.getRow(1).font = { bold: true };

  participants.forEach((p, i) => {
    sheet.addRow({ num: i + 1, ...p });
  });

  const safeName = activity.name.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'activity';
  const filename = `${safeName}_participants.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(activity.name + '_participants.xlsx')}`);

  try {
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export.' });
    }
  }
});

// Create activity
app.post('/api/admin/activities', (req, res) => {
  const { name, points, active_date } = req.body;

  if (!name || points == null || !active_date) {
    return res.status(400).json({ error: 'Name, points, and date are required.' });
  }

  const result = db.prepare(
    'INSERT INTO activities (name, points, active_date) VALUES (?, ?, ?)'
  ).run(name, parseInt(points), active_date);

  res.json({ success: true, id: result.lastInsertRowid });
});

// Update activity
app.put('/api/admin/activities/:id', (req, res) => {
  const { name, points, active_date } = req.body;
  const { id } = req.params;

  db.prepare(
    'UPDATE activities SET name = ?, points = ?, active_date = ? WHERE id = ?'
  ).run(name, parseInt(points), active_date, id);

  res.json({ success: true });
});

// Delete activity
app.delete('/api/admin/activities/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM participants WHERE activity_id = ?').run(id);
  db.prepare('DELETE FROM activities WHERE id = ?').run(id);
  res.json({ success: true });
});

// Admin: add participant to a specific activity (no date restriction)
app.post('/api/admin/activities/:id/participants', (req, res) => {
  const { id } = req.params;
  const { first_name, last_name, email } = req.body;

  if (!first_name || !last_name || !email) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }

  const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(id);
  if (!activity) {
    return res.status(400).json({ error: 'Activity not found.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  const existing = db.prepare(
    'SELECT id FROM participants WHERE email = ? AND activity_id = ?'
  ).get(normalizedEmail, id);

  if (existing) {
    return res.status(400).json({ error: 'This person is already registered for this activity.' });
  }

  const result = db.prepare(
    'INSERT INTO participants (first_name, middle_name, last_name, email, activity_id) VALUES (?, ?, ?, ?, ?)'
  ).run(first_name, '', last_name, normalizedEmail, id);

  res.json({ success: true, id: result.lastInsertRowid });
});

// Get all participants aggregated by email, ranked by total points
app.get('/api/admin/participants', (req, res) => {
  const participants = db.prepare(`
    SELECT
      p.email,
      first_reg.first_name,
      first_reg.last_name,
      SUM(a.points) AS total_points,
      COUNT(a.id) AS activity_count,
      GROUP_CONCAT(a.name, ', ') AS activities
    FROM participants p
    JOIN activities a ON p.activity_id = a.id
    JOIN (
      SELECT email, first_name, last_name
      FROM participants
      WHERE id IN (SELECT MIN(id) FROM participants GROUP BY email)
    ) first_reg ON first_reg.email = p.email
    GROUP BY p.email
    ORDER BY total_points DESC
  `).all();
  res.json(participants);
});

// Update participant (by email)
app.put('/api/admin/participants/:email', (req, res) => {
  const { email } = req.params;
  const { first_name, last_name, new_email } = req.body;

  if (!first_name || !last_name || !new_email) {
    return res.status(400).json({ error: 'First name, last name, and email are required.' });
  }

  const normalizedOld = decodeURIComponent(email).toLowerCase();
  const normalizedNew = new_email.trim().toLowerCase();

  db.prepare(
    'UPDATE participants SET first_name = ?, last_name = ?, email = ? WHERE email = ?'
  ).run(first_name, last_name, normalizedNew, normalizedOld);

  res.json({ success: true });
});

// Delete a single participant by ID
app.delete('/api/admin/participants/single/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM participants WHERE id = ?').run(id);
  res.json({ success: true });
});

// Delete participants (bulk by emails)
app.post('/api/admin/participants/delete', (req, res) => {
  const { emails } = req.body;

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'No participants selected.' });
  }

  const placeholders = emails.map(() => '?').join(',');
  db.prepare(`DELETE FROM participants WHERE email IN (${placeholders})`).run(...emails);

  res.json({ success: true });
});

// Export participants as Excel
app.get('/api/admin/export', async (req, res) => {
  const participants = db.prepare(`
    SELECT
      p.email,
      first_reg.first_name,
      first_reg.last_name,
      SUM(a.points) AS total_points,
      COUNT(a.id) AS activity_count,
      GROUP_CONCAT(a.name, ', ') AS activities
    FROM participants p
    JOIN activities a ON p.activity_id = a.id
    JOIN (
      SELECT email, first_name, last_name
      FROM participants
      WHERE id IN (SELECT MIN(id) FROM participants GROUP BY email)
    ) first_reg ON first_reg.email = p.email
    GROUP BY p.email
    ORDER BY total_points DESC
  `).all();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Participants');

  sheet.columns = [
    { header: 'Rank', key: 'rank', width: 8 },
    { header: 'First Name', key: 'first_name', width: 18 },
    { header: 'Last Name', key: 'last_name', width: 18 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Total Points', key: 'total_points', width: 12 },
    { header: 'Activities', key: 'activities', width: 35 },
    { header: 'Activity Count', key: 'activity_count', width: 15 },
  ];

  // Style header row
  sheet.getRow(1).font = { bold: true };

  participants.forEach((p, i) => {
    sheet.addRow({ rank: i + 1, ...p });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=participants.xlsx');

  await workbook.xlsx.write(res);
  res.end();
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin dashboard: http://localhost:${PORT}/admin.html`);
});
