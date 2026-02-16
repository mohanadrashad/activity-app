# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Start server:** `node server.js` (runs on http://localhost:3000)
- **Install dependencies:** `npm install`
- No test framework is configured.

## Architecture

Single-file Express 5 server (`server.js`) with a SQLite database (`database.db` via better-sqlite3) and static frontend files in `public/`.

### Backend (server.js)

All API routes and DB setup live in `server.js`. The database schema is auto-created on startup (activities and participants tables). Key patterns:
- All DB operations use synchronous better-sqlite3 prepared statements (not async)
- Admin routes are under `/api/admin/*` with no middleware auth — login is a simple password check against a hardcoded constant
- Deleting an activity cascades to delete its participants manually (not via DB cascade)
- Excel export uses ExcelJS to stream an `.xlsx` response

### Frontend (public/)

Vanilla HTML/CSS/JS with no build step or framework:
- `index.html` + `js/app.js` — Public registration form. Shows today's activities and lets participants register.
- `admin.html` + `js/admin.js` — Admin dashboard behind a client-side password gate. Tabbed UI for managing activities and viewing ranked participants.
- `style.css` — Shared styles for both pages.

### Data Model

- **activities**: id, name, points, active_date (YYYY-MM-DD). Only activities matching today's date appear on the public page.
- **participants**: id, first_name, middle_name, last_name, activity_id (FK), submitted_at. Ranked by activity points DESC then submission time ASC.
