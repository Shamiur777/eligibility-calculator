# HulkenStein Leads API

Backend for the Admission Eligibility Calculator. Every time a student submits
the form, this API stores their **name, phone, email, SSC/HSC results, track,
subject GPAs, and the list of universities the calculator matched them to**
in a database, and exposes a one-click **CSV export** so the marketing/sales
team can download it and open it directly in Excel or Google Sheets.

## What this is (and isn't)

- **Is:** a small, self-contained Node.js + Express API with a SQLite
  database. No external services, no signup, no monthly cost. Runs anywhere
  Node runs (a VPS, Render, Railway, Vercel serverless functions with minor
  changes, or directly inside the existing EdgeCourse server).
- **Isn't:** a full admin dashboard. It gives you the raw data + CSV export;
  building a nice-looking internal UI on top of `GET /api/leads` is a
  separate, smaller task if you want one later.

## Quick start (local test)

```bash
npm install
cp .env.example .env
# edit .env - set ADMIN_API_KEY to something random, and ALLOWED_ORIGINS
# to match wherever the calculator HTML is actually hosted
npm start
```

The API is now running on `http://localhost:4000`. Test it:

```bash
# Submit a test lead (this is what the calculator's frontend does automatically)
curl -X POST http://localhost:4000/api/leads \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Student",
    "mobile": "01712345678",
    "email": "test@example.com",
    "sscGPA": 5.0, "sscYear": 2023, "sscTrack": "science",
    "hscGPA": 5.0, "hscYear": 2025, "hscTrack": "science",
    "physics": 5.0, "chemistry": 5.0, "math": 5.0, "biology": 0, "english": 5.0,
    "eligibleUniversities": [
      { "name": "Dhaka University", "units": ["Science Unit", "IBA"] },
      { "name": "BUET", "units": ["Engineering Programs"] }
    ]
  }'

# Download all leads as CSV (needs the API key from .env)
curl http://localhost:4000/api/leads/export.csv \
  -H "x-api-key: YOUR_ADMIN_API_KEY" \
  -o leads.csv
```

Open `leads.csv` in Excel - every column (name, mobile, email, SSC/HSC GPA,
year, track, subject GPAs, matched universities) is there, one row per
student, ready to filter/call from.

## Deploying

Any of these work with zero code changes:

- **Same server as edgecoursebd.com** (recommended if it's already Node):
  run this as a second process (e.g. via `pm2 start server.js --name leads-api`)
  on a different port, then reverse-proxy `/api/leads` to it in your existing
  nginx/Next.js config.
- **Railway / Render / Fly.io**: push this folder as its own repo, set the
  three env vars in their dashboard, done. They all support SQLite via a
  persistent volume - just make sure `data/` is mounted on a persistent disk,
  not the ephemeral filesystem.
- **A plain VPS**: `git clone`, `npm install`, `npm start` behind pm2 + nginx,
  same as any other small Node API.

If EdgeCourse's stack is Next.js (this looks likely from the site), the
absolute simplest integration is to copy `models/db.js`, `utils/csv.js`, and
`routes/leads.js` into the existing project as Next.js API routes
(`pages/api/leads/index.js`, `pages/api/leads/export.csv.js`, etc.) - the
logic in each file is framework-agnostic and just needs the Express
`req`/`res` calls swapped for the Next.js equivalent, which is a couple of
hours of work, not a rewrite.

## Frontend integration

The calculator's HTML/JS needs one addition: right after it computes
`results` (the array of `{ uni, eligibleUnits }` the eligibility engine
already produces), send that plus the contact form fields to this API. Add
this function to the calculator's `<script>` block and call it instead of
(or in addition to) rendering the results screen:

```javascript
async function submitLead(student, formEls, results) {
  const payload = {
    name: formEls.name.value,
    mobile: formEls.mobile.value,
    email: formEls.email.value || null,
    sscGPA: student.sscGPA,
    sscYear: student.sscYear,
    sscTrack: formEls.sscTrack.value,
    hscGPA: student.hscGPA,
    hscYear: student.hscYear,
    hscTrack: student.hscTrack,
    physics: student.subjects.physics,
    chemistry: student.subjects.chemistry,
    math: student.subjects.math,
    biology: student.subjects.biology,
    english: student.subjects.english,
    eligibleUniversities: results.map(function(r) {
      return { name: r.uni.name, units: r.eligibleUnits.map(function(u) { return u.unit.unitName; }) };
    })
  };

  try {
    await fetch("https://YOUR-API-DOMAIN/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // Fail silently on the frontend - a lead-tracking error should never
    // block the student from seeing their results.
    console.error("Lead submission failed:", err);
  }
}
```

Call `submitLead(student, els, results)` at the same point the calculator
currently calls `renderResults(results, student)` in the `toStep3` click
handler.

Replace `https://YOUR-API-DOMAIN` with wherever this API ends up deployed
(e.g. `https://api.edgecoursebd.com` or `https://edgecoursebd.com/api` if
merged into the same Next.js app).

## API reference

| Method | Path                     | Auth        | Purpose                                  |
|--------|--------------------------|-------------|-------------------------------------------|
| POST   | `/api/leads`             | none        | Submit a lead from the calculator         |
| GET    | `/api/leads`             | `x-api-key` | List all leads as JSON                   |
| GET    | `/api/leads/stats`       | `x-api-key` | Quick totals (today / all-time / by track)|
| GET    | `/api/leads/export.csv`  | `x-api-key` | Download all leads as a CSV file          |
| GET    | `/api/leads/:id`         | `x-api-key` | Fetch a single lead                       |
| GET    | `/health`                | none        | Uptime check                              |

`GET /api/leads` and `/export.csv` both accept optional `?from=YYYY-MM-DD&to=YYYY-MM-DD`
query params to filter by submission date - useful for exporting "this week's leads" only.

## Database

SQLite file lives at `data/leads.db`. This file **is** the database - back it
up by copying it (or set up a cron job to copy it to S3/Google Drive daily).
Schema is defined in `models/db.js` if the team wants to add columns later
(e.g. a `contacted` boolean, or a `follow_up_notes` field for the sales team).

## Security notes for the CTO

- Set `ADMIN_API_KEY` in production - without it, the export/list endpoints
  are open to anyone who finds the URL. The server logs a loud warning on
  startup if this is missing.
- `ALLOWED_ORIGINS` must match the exact domain the calculator HTML is served
  from, or the browser will block the lead submission with a CORS error.
- Rate limiting (20 submissions / 15 min / IP) is already wired in for the
  public POST endpoint to deter spam/bot form-filling.
- Phone numbers are validated against the Bangladeshi mobile number pattern
  (`01[3-9]XXXXXXXX`) before being stored, so the CSV won't fill up with
  garbage numbers that can't be called.
