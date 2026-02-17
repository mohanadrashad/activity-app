# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Start server:** `node server.js` (runs on http://localhost:3000)
- **Install dependencies:** `npm install`
- No test framework is configured.

## Architecture

Single-file Express 5 server (`server.js`) with a SQLite database (`database.db` via better-sqlite3) and static frontend files in `public/`. Branded as "بادر" (Bader).

### Backend (server.js)

All API routes, DB setup, and migrations live in `server.js`. The database schema is auto-created on startup with migrations for evolving the schema. Key patterns:
- All DB operations use synchronous better-sqlite3 prepared statements (not async)
- Password hashing uses Node.js built-in `crypto.scryptSync` (salt:hash format)
- Admin auth: email+password login against `admin_users` table, returns role. User management endpoints use `x-admin-email` header checked via `requireSuperAdmin` middleware.
- Participants are identified by email (case-insensitive, normalized to lowercase). A unique index on `(email, activity_id)` prevents duplicate registrations.
- Deleting an activity cascades to delete its participants manually (not via DB cascade)
- Excel export uses ExcelJS to stream `.xlsx` responses (both global ranking and per-activity)

### Frontend (public/)

Vanilla HTML/CSS/JS with no build step or framework:
- `index.html` + `js/app.js` — Public registration form with English/Arabic i18n toggle. Shows today's activities and lets participants register by name + email.
- `admin.html` + `js/admin.js` — Admin dashboard with email+password login. Three tabs:
  - **Activities** — CRUD activities, expandable participant list per activity with download, add person to activity, search filter
  - **Participants** — Aggregated leaderboard (points summed across activities per email), bulk delete via checkboxes, edit participant, export to Excel, search filter
  - **Users** (super_admin only) — Create/delete admin users
- `style.css` — Shared styles using CSS variables for the green/gold Bader theme.

### Data Model

- **activities**: id, name, points, active_date (YYYY-MM-DD). Only activities matching today's date appear on the public page.
- **participants**: id, first_name, middle_name, last_name, email, activity_id (FK), submitted_at. Unique on (email, activity_id). Aggregated ranking sums points per email, ordered DESC. Name is taken from the first registration (MIN id) for consistency.
- **admin_users**: id, email (unique), password_hash, role ('super_admin' | 'admin'), created_at. Super admin is seeded on first startup.
