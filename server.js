const express = require('express');
const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const ADMIN_PASSWORD = 'admin123';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Database Setup ---
const db = new Database(path.join(__dirname, 'database.db'));
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

// --- Admin Routes ---

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password.' });
  }
});

// List all activities
app.get('/api/admin/activities', (req, res) => {
  const activities = db.prepare(
    'SELECT id, name, points, active_date FROM activities ORDER BY active_date DESC'
  ).all();
  res.json(activities);
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
  console.log(`Admin password: ${ADMIN_PASSWORD}`);
});
