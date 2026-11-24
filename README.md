# HulkenStein Admission Eligibility Calculator

A Bangla-language web calculator that tells a student which Bangladeshi
public universities and units they are eligible to apply to, based on SSC and
HSC GPA, passing years, HSC track and subject GPAs. When the student submits
the form, the calculator also sends the entry (contact details, results and
matched universities) to a small leads API, which stores it in SQLite and
exports it as CSV for the sales team.

Layout:

- `hulkenstein-eligibility-calculator-bangla-1.html` - the calculator. One
  self-contained file: HTML, CSS, JavaScript, the eligibility rules, the
  images and the font (QNA Books, embedded) are inside it. It needs no other
  files and loads nothing from external servers except the outbound links.
- `index.html` - a redirect to the calculator file. Only needed if the site is
  served from the repo root and you want `/` to open the calculator.
- `leads-backend/` - Node/Express + SQLite API (`POST /api/leads`, CSV export).
  See `leads-backend/README.md`.
- `fonts/` - the font licence (`OFL.txt`) and the source woff2, kept for
  reference only. The calculator does not load anything from this folder.
- `test/engine.test.js` - tests for the eligibility engine.
- `leads-backend/test/api.test.js` - tests for the API.
- `package.json` - root `npm test` script.

## What changed in this version

### At a glance

Do these when deploying:

1. Replace the calculator HTML file with the new one.
2. Backend: set a real `ADMIN_API_KEY` (16+ characters). Without it the list and export endpoints return 503.
3. If the API runs behind a proxy, set `TRUST_PROXY=1`.
4. The calculator now POSTs leads to `LEADS_API_URL` (default `"/api/leads"`). Make sure the API is reachable there.
5. After deploying, submit one test lead and check that it appears in `/api/leads/export.csv`.

### Calculator page (frontend)

- Eligibility year rules were never applied, because the reference year was the student's own HSC year. They are now counted from `ADMISSION.currentHscBatch` (2026, session 2026-27).
- Leads were never sent to the backend. They are now POSTed, fire-and-forget: the page works even if the API is down.
- Form validation: SSC/HSC GPA 1-5, subject GPAs 0-5, Bangladeshi mobile number (Bangla digits are accepted and normalised, for example ০১৭১১-২২৩৩৪৪ becomes 01711223344), and email format. Invalid fields get a red border.
- The restart button now also resets the result tab.
- Font: the whole page now uses the QNA Books font (Bangla glyphs, embedded in the HTML, so it is still a single self-contained file). English text falls back to Times New Roman. The Google Fonts import was removed, so the page no longer loads anything from external servers except the outbound links. Font licence: `fonts/OFL.txt` (Kalpurush, SIL Open Font License).
- New `index.html` that redirects to the calculator.
- The footer is updated to session 2026-27, with a note that universities without a new circular use last year's rules.

### Leads API (backend)

- The admin key fails closed: 503 when it is missing, too short or the placeholder value. The key is compared in constant time.
- CSV export neutralises formula injection (cells starting with `=`, `+`, `-`, `@`, tab or carriage return are prefixed with `'`).
- Input validation on `POST /api/leads` and on the `from`/`to` query parameters. Malformed payloads used to crash with a 500; they now return 400.
- `X-Forwarded-For` is trusted only when `TRUST_PROXY` is set.
- A disallowed CORS origin now gets 403 instead of 500.
- Dependencies upgraded: fixes the critical `proxy-addr` advisory; better-sqlite3 13, express-rate-limit 8, helmet 8, dotenv 18.
- `app.js` and `server.js` are split. New `DB_PATH` option. Tests added.
- No database schema change. An existing `leads.db` works as it is.

### Eligibility rules (2026-27)

| University | Change | Status |
|---|---|---|
| DU | HSC 2026 only, SSC 2021-24 | verified 2026-27 |
| JU | HSC 2025/26, SSC 2023/24, GPA floors lowered, Law moved to B | verified 2026-27 |
| JnU | HSC 2026 only, SSC 2023/24, new GPA floors | verified 2026-27 |
| RU | Arts/commerce 6.50 total, 3.00 each; science 7.50 / 3.50 | verified 2026-27 |
| Agri cluster | SSC 2022-24, HSC 2025/26, 4.00 each; old 8.50 total removed | verified 2026-27 |
| GST | Now 20 universities; GPA rules not yet published | count verified; GPA is last year's |
| BUET | Unchanged | verified 2026-27 |
| MBBS/BDS and AFMC | Physics, chemistry and biology each at least 3.50 | correction |
| CUET | English at least B (3.00) | correction |
| NU honours | Business Studies grouped with Humanities (4.50) | correction |
| CU | Rows relabelled current/previous batch; numbers still 2025-26 | last year's rules |

All other universities still use 2025-26 rules until their circulars are out. See `CIRCULARS.md` for sources and the list of open items.

### How this release was tested

- `npm test`: 11 engine tests and 8 API tests.
- End-to-end run: calculator and API on one origin, form submitted in a real browser. The lead returned 201 and appeared in the protected CSV export with the Bangla name and the normalised mobile number intact.
- Live checks: no key gives 401, wrong key 401, foreign origin 403, malformed payload 400, a formula-style name is neutralised, a spoofed IP is ignored, and the rate limit returns 429 after 20 requests per 15 minutes.

## Upgrading an existing deployment (same address)

You do not need to change the public URL. Replace the files in place.

### 1. Frontend (the calculator page)

- Replace the existing HTML file with the new
  `hulkenstein-eligibility-calculator-bangla-1.html`, at the same path and
  with the same filename. Keep the filename as it is.
- If the site previously served the calculator as `index.html` (or under some
  other name), do one of these:
  - upload the new `index.html` from this repo as well (it redirects to
    `hulkenstein-eligibility-calculator-bangla-1.html`, so that file must be
    uploaded too), or
  - rename the calculator file to the name and path it had before. The file
    has no relative links to other assets, so renaming is safe.
- New in this version: the calculator now POSTs each submission to the leads
  API. The address is the constant `LEADS_API_URL` near the top of the UI
  script, below the line `// Where submissions are sent (leads-backend)`:

  ```js
  const LEADS_API_URL = "/api/leads";
  ```

  - Default `"/api/leads"` is same-origin: the API must be reachable at
    `/api/leads` on the same domain as the page (for example nginx proxying
    `/api/leads` to the Node process).
  - If the API lives on a different origin, set the full URL, for example
    `"https://api.example.com/api/leads"`, and add the calculator's origin
    (scheme and host, no trailing slash) to `ALLOWED_ORIGINS` in the
    backend `.env`.
  - Set it to `""` to switch submission off. The calculator still works.
  - Even when the API is same-origin, add the site's own origin to
    `ALLOWED_ORIGINS` (browsers send an `Origin` header on POST). The default
    list already contains `https://edgecoursebd.com` and
    `https://www.edgecoursebd.com`.
  - A failed submission is silent for the student. The results page is shown
    regardless.

### 2. Backend (leads API)

Requires Node 18 or newer.

1. Get the new code onto the server: `git pull`, or copy `leads-backend/` over
   the old folder. Do not delete `data/leads.db` (the leads) or `.env` (your
   settings) when copying.
2. In `leads-backend/`, run `npm ci`.
3. Update `.env` using `.env.example` as the reference. See the breaking
   change below, and the new `TRUST_PROXY` and `DB_PATH` variables.
4. Restart: `pm2 restart leads-api` (use whatever name the process has, see
   `pm2 ls`), or trigger a redeploy on the host.
5. Check `GET /health` returns `{"ok":true,...}`.

The existing `data/leads.db` is compatible. There is no schema change.

### Breaking changes in the backend

- `GET /api/leads`, `/api/leads/stats`, `/api/leads/export.csv` and
  `/api/leads/:id` now return HTTP 503 (`admin_key_not_configured`) unless
  `ADMIN_API_KEY` is set to a real value of at least 16 characters. The
  placeholder from `.env.example` does not count. Before, a missing key only
  logged a warning and left the endpoints open. Generate a key with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  Anything that calls the export (scripts, dashboards) must send it in the
  `x-api-key` header.
- If the API runs behind a reverse proxy (nginx, Render, Railway,
  Cloudflare), set `TRUST_PROXY=1` (number of proxy hops). Without it the
  rate limiter and the stored IP address see the proxy's address, not the
  student's. With it unset, `X-Forwarded-For` is ignored on purpose, because
  clients can fake it. Set it only when a proxy really is in front.
- Optional: `DB_PATH` sets the location of the SQLite file (default
  `leads-backend/data/leads.db`). Set it if the database must live on a
  persistent volume or you want to keep the old file where it is.

### Static hosts (GitHub Pages, Netlify, Vercel)

Point the host at the repo root; it serves `index.html`, which redirects to the
calculator. These hosts cannot run the backend or keep a SQLite file, so host
the API separately (Render, Railway, a VPS, or the existing server) with a
persistent disk for `data/` (or `DB_PATH`). Then set `LEADS_API_URL` in the
HTML to the API's full URL and put the static site's origin in
`ALLOWED_ORIGINS`.

## Updating eligibility rules each year

All rules are data in the `UNIVERSITIES` array inside the calculator HTML,
between the markers `// ENGINE-START` and `// ENGINE-END`. The tests load
exactly that block, so keep the markers in place. Do not print or paste the
whole HTML in an editor that struggles with long lines: the file contains
long base64 image lines. Use search to jump to what you need.

Steps:

1. Bump `ADMISSION = { session, currentHscBatch }` at the top of the engine
   block. `currentHscBatch` is the newest HSC batch that applies in the new
   session (2026 for 2026-27, 2027 for 2027-28). Every year rule is counted
   from this number, not from the student's own HSC year.
2. For each university, edit the unit objects to match the new circular.
   Universities whose circular is not out yet keep last year's rules.
3. Record the circular (university, session, date, link) in `CIRCULARS.md`.
4. Add or update a test in `test/engine.test.js`, then run `npm test`.

A unit looks like this:

```js
{ unitName: "...", track: ["science"], hscGapMax: 0, sscToHscGapMax: 5,
  combinedMin: 8.0, individualMin: 3.5 }
```

Rule fields (all optional except `unitName`; a missing field means no check).
Let `gap = currentHscBatch - hscYear`, as the engine computes it.

| Field | Meaning |
|---|---|
| `track` | Array of allowed HSC tracks (`science`, `arts`, `commerce`). The student's HSC track must be in it. Use separate units for cross-apply rows. |
| `hscGapMax` | Maximum `gap`. 0 = current HSC batch only, 1 = current and previous batch. An HSC year later than the current batch (negative gap) always fails when this is set. |
| `hscGapMin` | Minimum `gap`. 1 = current batch not allowed (previous batches only). |
| `sscToHscGapMax` | Maximum years between SSC year and HSC year (`hscYear - sscYear`). An SSC year after the HSC year always fails. |
| `sscToHscGapMin` | Minimum years between SSC and HSC. |
| `maxGapYears` | If present, used instead of `sscToHscGapMax` for the SSC-to-HSC gap check. |
| `sscMaxYearsBeforeBatch` | Oldest SSC year allowed, counted back from `currentHscBatch`: SSC year must be at least `currentHscBatch - N`. With batch 2026 and N = 3, SSC 2023 or later. |
| `combinedMin` | Minimum of SSC GPA + HSC GPA. |
| `individualMin` | Minimum for SSC GPA and for HSC GPA, each on its own. |
| `sscMin` | Minimum SSC GPA only. |
| `hscMin` | Minimum HSC GPA only. |
| `subjectMins` | Object of per-subject minimums, e.g. `{ physics: 3.5, chemistry: 3.5 }`. A blank subject counts as 0. Subjects: `physics`, `chemistry`, `math`, `biology`, `english`. |
| `subjectCombinedMin` + `subjectCombinedSubjects` | Minimum for the sum of the listed subjects' GPAs, e.g. `subjectCombinedSubjects: ["physics","chemistry"]`. Both fields must be present. |
| `requiredSubjects` | Subjects the student must have studied: the GPA must be greater than 0 (blank or 0 fails). |

Student years that are blank are not checked against the SSC-related year
rules (`sscToHscGap*`), but a missing HSC year fails any unit with a year
rule. SSC and HSC years are chosen from a fixed list in the UI
(`YEARS`, currently 2018 to 2028); extend that loop if the range runs out.

If a university has a rule that none of these fields can express, add the
logic in `checkUnit` and add a test for it.

## Tests

```
cd leads-backend && npm ci && cd ..
npm test
```

`npm test` at the repo root runs the engine tests in `test/` and then the API
tests in `leads-backend/test/`. The API tests need the backend dependencies
installed first (`npm ci` in `leads-backend/`). They use a temporary database
and do not touch `data/leads.db`. Node 18 or newer.
