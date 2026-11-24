// models/db.js
//
// SQLite is used deliberately here instead of Postgres/MySQL: it needs zero
// external server, zero setup, and the leads.db file itself IS the backup.
// If EdgeCourse's stack already runs Postgres/MySQL in production, this file
// is the only one that needs to change - everything in routes/leads.js talks
// to `db` through the same three functions (insertLead, getAllLeads, getStats)
// so swapping the storage engine later does not require touching the API layer.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// DB_PATH can be overridden (tests point it at a temp file).
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "leads.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL"); // safe for concurrent reads while writes happen

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    -- contact info (this is what the marketing / sales team actually calls)
    name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    email TEXT,

    -- academic inputs, exactly as entered in the calculator
    ssc_gpa REAL,
    ssc_year INTEGER,
    hsc_gpa REAL,
    hsc_year INTEGER,
    ssc_track TEXT,           -- science | arts | commerce
    hsc_track TEXT,           -- science | arts | commerce

    physics_gpa REAL,
    chemistry_gpa REAL,
    math_gpa REAL,
    biology_gpa REAL,
    english_gpa REAL,

    -- calculator output, stored as JSON + a plain-text summary column so a
    -- non-technical team member can just scroll the CSV without parsing JSON
    eligible_count INTEGER,
    eligible_summary TEXT,     -- human-readable: "DU (Science Unit); BUET; CUET..."
    eligible_json TEXT,        -- full structured result, for anything more detailed later

    -- basic request metadata, useful for de-duping / fraud-checking leads
    source TEXT DEFAULT 'eligibility-calculator',
    ip_address TEXT,
    user_agent TEXT,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Helpful indexes for the CTO's team when the table grows past a few
// thousand rows (phone lookups and date-range exports are the two most
// common queries on a leads table).
db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_mobile ON leads(mobile);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);`);

function insertLead(lead) {
  const stmt = db.prepare(`
    INSERT INTO leads (
      name, mobile, email,
      ssc_gpa, ssc_year, hsc_gpa, hsc_year, ssc_track, hsc_track,
      physics_gpa, chemistry_gpa, math_gpa, biology_gpa, english_gpa,
      eligible_count, eligible_summary, eligible_json,
      source, ip_address, user_agent
    ) VALUES (
      @name, @mobile, @email,
      @ssc_gpa, @ssc_year, @hsc_gpa, @hsc_year, @ssc_track, @hsc_track,
      @physics_gpa, @chemistry_gpa, @math_gpa, @biology_gpa, @english_gpa,
      @eligible_count, @eligible_summary, @eligible_json,
      @source, @ip_address, @user_agent
    )
  `);
  const info = stmt.run(lead);
  return info.lastInsertRowid;
}

function getAllLeads({ from, to } = {}) {
  let query = "SELECT * FROM leads";
  const params = [];
  if (from && to) {
    query += " WHERE created_at BETWEEN ? AND ?";
    params.push(from, to);
  } else if (from) {
    query += " WHERE created_at >= ?";
    params.push(from);
  } else if (to) {
    query += " WHERE created_at <= ?";
    params.push(to);
  }
  query += " ORDER BY created_at DESC";
  return db.prepare(query).all(...params);
}

function getLeadById(id) {
  return db.prepare("SELECT * FROM leads WHERE id = ?").get(id);
}

function getStats() {
  const total = db.prepare("SELECT COUNT(*) AS c FROM leads").get().c;
  const today = db
    .prepare("SELECT COUNT(*) AS c FROM leads WHERE date(created_at) = date('now')")
    .get().c;
  const byTrack = db
    .prepare("SELECT hsc_track, COUNT(*) AS c FROM leads GROUP BY hsc_track")
    .all();
  return { total, today, byTrack };
}

module.exports = { db, insertLead, getAllLeads, getLeadById, getStats };
