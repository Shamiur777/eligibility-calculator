// routes/leads.js
const express = require("express");
const router = express.Router();
const { insertLead, getAllLeads, getLeadById, getStats } = require("../models/db");
const { leadsToCsv } = require("../utils/csv");

const TRACKS = new Set(["science", "arts", "commerce"]);

function toNumberOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

function validatePayload(body) {
  const errors = [];

  if (!body.name || typeof body.name !== "string" || body.name.trim().length < 2) {
    errors.push("name is required (min 2 characters)");
  }
  if (!body.mobile || !/^01[3-9]\d{8}$/.test(String(body.mobile).trim())) {
    errors.push("mobile must be a valid Bangladeshi number, e.g. 017XXXXXXXX");
  }
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    errors.push("email format is invalid");
  }
  if (body.hscTrack && !TRACKS.has(body.hscTrack)) {
    errors.push("hscTrack must be one of science | arts | commerce");
  }
  if (body.sscTrack && !TRACKS.has(body.sscTrack)) {
    errors.push("sscTrack must be one of science | arts | commerce");
  }

  if (typeof body.name === "string" && body.name.trim().length > 100) errors.push("name is too long");
  if (body.email && (typeof body.email !== "string" || body.email.length > 254)) errors.push("email is too long");
  if (body.source !== undefined && (typeof body.source !== "string" || body.source.length > 50)) {
    errors.push("source must be a short string");
  }
  for (const f of ["sscYear", "hscYear"]) {
    if (body[f] !== undefined && body[f] !== null && body[f] !== "") {
      const y = Number(body[f]);
      if (!Number.isInteger(y) || y < 2000 || y > 2100) errors.push(`${f} must be a year`);
    }
  }
  if (body.eligibleUniversities !== undefined) {
    const list = body.eligibleUniversities;
    const okItem = (u) =>
      u && typeof u === "object" && typeof u.name === "string" && u.name.length <= 200 &&
      (u.units === undefined || (Array.isArray(u.units) && u.units.length <= 50 &&
        u.units.every((x) => typeof x === "string" && x.length <= 200)));
    if (!Array.isArray(list) || list.length > 100 || !list.every(okItem)) {
      errors.push("eligibleUniversities must be a list of { name, units[] }");
    }
  }

  const gpaFields = ["sscGPA", "hscGPA", "physics", "chemistry", "math", "biology", "english"];
  for (const f of gpaFields) {
    if (body[f] !== undefined && body[f] !== null && body[f] !== "") {
      const n = Number(body[f]);
      if (!Number.isFinite(n) || n < 0 || n > 5) {
        errors.push(`${f} must be a number between 0 and 5`);
      }
    }
  }

  return errors;
}

// POST /api/leads
// Body shape sent by the calculator frontend after it computes eligibility:
// {
//   name, mobile, email,
//   sscGPA, sscYear, sscTrack,
//   hscGPA, hscYear, hscTrack,
//   physics, chemistry, math, biology, english,
//   eligibleUniversities: [{ name: "Dhaka University", units: ["Science Unit", "IBA"] }, ...]
// }
router.post("/", (req, res) => {
  const body = req.body || {};
  const errors = validatePayload(body);
  if (errors.length) {
    return res.status(400).json({ ok: false, errors });
  }

  const eligibleList = Array.isArray(body.eligibleUniversities) ? body.eligibleUniversities : [];
  const eligibleSummary = eligibleList
    .map((u) => (u.units && u.units.length ? `${u.name} (${u.units.join(", ")})` : u.name))
    .join("; ");

  const lead = {
    name: String(body.name).trim(),
    mobile: String(body.mobile).trim(),
    email: body.email ? String(body.email).trim() : null,

    ssc_gpa: toNumberOrNull(body.sscGPA),
    ssc_year: toIntOrNull(body.sscYear),
    hsc_gpa: toNumberOrNull(body.hscGPA),
    hsc_year: toIntOrNull(body.hscYear),
    ssc_track: body.sscTrack || null,
    hsc_track: body.hscTrack || null,

    physics_gpa: toNumberOrNull(body.physics),
    chemistry_gpa: toNumberOrNull(body.chemistry),
    math_gpa: toNumberOrNull(body.math),
    biology_gpa: toNumberOrNull(body.biology),
    english_gpa: toNumberOrNull(body.english),

    eligible_count: eligibleList.length,
    eligible_summary: eligibleSummary,
    eligible_json: JSON.stringify(eligibleList),

    source: body.source || "eligibility-calculator",
    // req.ip honours X-Forwarded-For only when TRUST_PROXY is set (app.js),
    // so a client can't write an arbitrary IP into the table.
    ip_address: req.ip || null,
    user_agent: req.headers["user-agent"] || null
  };

  try {
    const id = insertLead(lead);
    res.status(201).json({ ok: true, id });
  } catch (err) {
    console.error("Failed to insert lead:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// GET /api/leads?from=2026-01-01&to=2026-12-31
// Protected by the same API-key middleware applied in server.js - this
// returns raw JSON, useful if the CTO wants to build an internal dashboard
// later instead of only working from the CSV export.
// from/to must be single plain dates/datetimes (e.g. 2026-01-01 or
// "2026-01-01 10:00:00"); anything else (arrays, objects) is a 400.
function dateRange(req, res) {
  const { from, to } = req.query;
  const ok = (v) => v === undefined || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(v));
  if (!ok(from) || !ok(to)) {
    res.status(400).json({ ok: false, error: "from/to must be dates like 2026-01-31" });
    return null;
  }
  return { from, to };
}

router.get("/", (req, res) => {
  const range = dateRange(req, res);
  if (!range) return;
  const { from, to } = range;
  const leads = getAllLeads({ from, to });
  res.json({ ok: true, count: leads.length, leads });
});

// GET /api/leads/stats
router.get("/stats", (req, res) => {
  res.json({ ok: true, stats: getStats() });
});

// GET /api/leads/export.csv?from=&to=
// This is the button the marketing team clicks. Opens directly in Excel /
// Google Sheets / LibreOffice - no import wizard needed.
router.get("/export.csv", (req, res) => {
  const range = dateRange(req, res);
  if (!range) return;
  const { from, to } = range;
  const leads = getAllLeads({ from, to });
  const csv = leadsToCsv(leads);

  const filename = `hulkenstein-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// GET /api/leads/:id
router.get("/:id", (req, res) => {
  const lead = getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, lead });
});

module.exports = router;
