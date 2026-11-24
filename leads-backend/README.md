# HulkenStein Leads API

Backend for the Admission Eligibility Calculator. Every time a student submits
the form, this API stores their **name, phone, email, SSC/HSC results, track,
subject GPAs, and the list of universities the calculator matched them to**
in a database, and exposes a one-click **CSV export** so the marketing/sales
team can download it and open it directly in Excel or Google Sheets.

## What this is (and isn't)

- **Is:** a small, self-contained Node.js + Express API with a SQLite
  database. No external services, no signup, no monthly cost. Runs anywhere
  Node 18+ runs (a VPS, Render, Railway, or directly inside the existing
  EdgeCourse server).
- **Isn't:** a full admin dashboard. It gives you the raw data + CSV export;
  building a nice-looking internal UI on top of `GET /api/leads` is a
  separate, smaller task if you want one later.

## Quick start (local test)

```bash
npm ci            # or npm install
cp .env.example .env
# edit .env - set ADMIN_API_KEY to a random string of 16+ characters, and
# ALLOWED_ORIGINS to match wherever the calculator HTML is actually hosted
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

## Configuration (.env)

Copy `.env.example` to `.env`. The file is read at startup, so restart the
process after changing it.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Port the API listens on. |
| `ALLOWED_ORIGINS` | `https://edgecoursebd.com,https://www.edgecoursebd.com,http://localhost:3000` | Comma-separated origins allowed to submit leads (CORS). Must match the page's origin exactly: scheme, host, port, no trailing slash. Include the site's own origin even when the API is served on the same domain, because browsers send an `Origin` header on POST. Requests with no `Origin` (curl, server-to-server) are always allowed. |
| `ADMIN_API_KEY` | none | Required to list, read or export leads, sent in the `x-api-key` header. Must be at least 16 characters and not the placeholder from `.env.example`. If it is missing, too short or still the placeholder, every non-POST request to `/api/leads` returns HTTP 503 (`admin_key_not_configured`) and a warning is logged. Lead submission (POST) still works. The key is compared in constant time. |
| `TRUST_PROXY` | empty (off) | Number of reverse-proxy hops in front of the API, usually `1`. When set, the rate limiter and the stored IP address use the client address from `X-Forwarded-For`. Leave it empty if clients reach the API directly, otherwise they can fake their IP. |
| `DB_PATH` | `./data/leads.db` | Location of the SQLite file. Point it at a persistent volume on Render/Railway/Fly. |

Generate a key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Tests

```bash
npm test
```

Runs `test/api.test.js` with Node's built-in test runner against a temporary
database (it does not touch `data/leads.db`). From the repo root, `npm test`
runs these and the calculator engine tests together.

## Deploying

Any of these work with zero code changes. In all cases, set `ADMIN_API_KEY`,
`ALLOWED_ORIGINS` and, when a proxy is in front, `TRUST_PROXY=1`.

- **Same server as edgecoursebd.com** (recommended if it's already Node):
  run this as a second process (e.g. via `pm2 start server.js --name leads-api`)
  on a different port, then reverse-proxy `/api/leads` to it in your existing
  nginx config. Because nginx is a proxy, set `TRUST_PROXY=1` and make sure
  nginx passes the client address, for example
  `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. The
  calculator's default `LEADS_API_URL` is `/api/leads`, so this setup needs
  no change in the HTML.
- **Railway / Render / Fly.io**: push this folder as its own repo and set the
  env vars in their dashboard. They sit behind a proxy, so set `TRUST_PROXY=1`.
  They all support SQLite via a persistent volume: mount a volume and set
  `DB_PATH` to a file on it (or mount it at `data/`), not the ephemeral
  filesystem. When the API is on a different domain from the calculator, set
  `LEADS_API_URL` in the HTML to the full URL and add the calculator's origin
  to `ALLOWED_ORIGINS`.
- **A plain VPS**: `git clone`, `npm ci`, `npm start` behind pm2 + nginx,
  same as any other small Node API (with `TRUST_PROXY=1`).

To upgrade an existing install, copy or pull the new code without deleting
`data/leads.db` or `.env`, run `npm ci`, update `.env` from `.env.example`,
and restart (`pm2 restart leads-api`). The database schema has not changed.

### Code layout and integrating into another app

- `server.js` only reads `PORT`, calls `createApp()` from `app.js` and
  listens.
- `app.js` builds the Express app (helmet, CORS, rate limit, admin-key check,
  routes, error handling) and exports `createApp()`. Tests use it directly.

If EdgeCourse's stack is Next.js, `app.js` is not the part to reuse. The
portable parts are `routes/leads.js` (validation and handlers),
`models/db.js` (SQLite access) and `utils/csv.js` (CSV writer, with formula
escaping). The route logic is framework-agnostic apart from the Express
`req`/`res` calls, which need swapping for the Next.js equivalents
(`pages/api/leads/index.js`, `pages/api/leads/export.csv.js`, etc.). When you
do that you must re-create what `app.js` does around the router: the
admin-key check on non-POST requests, rate limiting on POST, CORS, and
`TRUST_PROXY`-style handling of the client IP.

## Frontend integration

Nothing to add. The calculator HTML in the repo root already sends each
submission here. The URL is the constant `LEADS_API_URL` near the top of the
UI script in `hulkenstein-eligibility-calculator-bangla-1.html`:

- `"/api/leads"` (default): same origin as the page.
- A full URL such as `"https://api.example.com/api/leads"`: use this when the
  API is on another origin, and add the page's origin to `ALLOWED_ORIGINS`.
- `""`: do not send anything.

The request is a JSON POST (fire-and-forget; a failure never blocks the
student). Fields: `name`, `mobile`, optional `email`, `sscGPA`, `sscYear`,
`sscTrack`, `hscGPA`, `hscYear`, `hscTrack`, `physics`, `chemistry`, `math`,
`biology`, `english`, and `eligibleUniversities` as a list of
`{ name, units: [] }`.

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
Values that are not plain dates return HTTP 400.

Responses: invalid payload on POST returns 400 with `{ ok: false, errors: [...] }`;
wrong or missing key returns 401; no configured admin key returns 503; more
than 20 POSTs per 15 minutes from one IP returns 429.

## Database

SQLite file lives at `data/leads.db` unless `DB_PATH` is set. This file **is**
the database - back it up by copying it (or set up a cron job to copy it to
S3/Google Drive daily). Schema is defined in `models/db.js` if the team wants
to add columns later (e.g. a `contacted` boolean, or a `follow_up_notes` field
for the sales team). The database runs in WAL mode, so `leads.db-wal` and
`leads.db-shm` files appear beside it; copy them together with the main file,
or use `sqlite3 leads.db ".backup backup.db"`.

## Security notes for the CTO

- `ADMIN_API_KEY` is required. Without a real key (16+ characters, not the
  placeholder) the list and export endpoints are disabled and return 503, so
  student data is never exposed by accident. Keep the key out of git; `.env`
  is already in `.gitignore`.
- `ALLOWED_ORIGINS` must match the exact domain the calculator HTML is served
  from, or the browser will block the lead submission with a CORS error.
- Set `TRUST_PROXY` only when a reverse proxy is in front. Left unset,
  `X-Forwarded-For` is ignored, so the stored IP and the rate limit cannot be
  spoofed by clients.
- Rate limiting (20 submissions / 15 min / IP) is wired in for the public POST
  endpoint to deter spam/bot form-filling.
- Phone numbers are validated against the Bangladeshi mobile number pattern
  (`01[3-9]XXXXXXXX`) before being stored, so the CSV won't fill up with
  garbage numbers that can't be called. Other fields (name, email, years,
  GPAs 0 to 5, university list) are length- and type-checked.
- The CSV export prefixes cells starting with `=`, `+`, `-`, `@`, tab or CR
  with `'` so a malicious name cannot run as a spreadsheet formula.
