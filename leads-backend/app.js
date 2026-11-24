// app.js
//
// Builds the Express app without starting it, so tests can spin it up on a
// random port. server.js is the thing you actually run.

require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const crypto = require("crypto");

const leadsRouter = require("./routes/leads");

const PLACEHOLDER_KEY = "change-this-to-a-long-random-string"; // value shipped in .env.example

// Constant-time comparison so the key can't be guessed byte-by-byte from timing.
function keyMatches(provided, expected) {
  if (typeof provided !== "string") return false;
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function createApp() {
  const app = express();
  // Behind nginx / Render / Railway etc. set TRUST_PROXY=1 (number of proxy
  // hops) so rate limiting and the stored IP use the real client address.
  // Left unset, X-Forwarded-For is ignored (it is trivially spoofable).
  if (process.env.TRUST_PROXY) {
    const n = Number(process.env.TRUST_PROXY);
    app.set("trust proxy", Number.isInteger(n) ? n : process.env.TRUST_PROXY);
  }
  const API_KEY = process.env.ADMIN_API_KEY; // required to view/export leads

  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));

  // CORS: only allow the calculator's own domains to POST leads. Add any
  // staging/preview domains here too, otherwise the browser will block the
  // request with a CORS error before it even reaches this server.
  const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
    "https://edgecoursebd.com,https://www.edgecoursebd.com,http://localhost:3000"
  ).split(",").map((s) => s.trim());

  app.use(
    cors({
      origin(origin, callback) {
        // allow no-origin requests (curl, server-to-server, Postman) and any
        // whitelisted origin
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        callback(Object.assign(new Error("Not allowed by CORS"), { status: 403 }));
      }
    })
  );

  // Rate limiting on lead submission specifically - this is a public-facing
  // form, so it's the most likely target for spam/bot submissions. 20
  // submissions per 15 minutes per IP is generous for a real student
  // (they only submit once) but stops a script from flooding the table.
  const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Too many submissions from this IP, please try again later." }
  });
  app.use("/api/leads", (req, res, next) => {
    if (req.method === "POST") return submitLimiter(req, res, next);
    next();
  });

  // Everything except POST (i.e. reading/exporting leads) requires the admin
  // API key. This is deliberately simple (a single shared secret via header)
  // rather than full auth/login, since this is meant to be swapped for
  // whatever auth system edgecoursebd.com's dashboard already uses.
  app.use("/api/leads", (req, res, next) => {
    if (req.method === "POST") return next(); // public: submitting a lead
    // Fail closed: with no real key configured, nobody can read leads.
    if (!API_KEY || API_KEY.length < 16 || API_KEY === PLACEHOLDER_KEY) {
      console.warn("ADMIN_API_KEY is missing, too short or still the placeholder - lead export is DISABLED until it is set in .env.");
      return res.status(503).json({ ok: false, error: "admin_key_not_configured" });
    }
    if (!keyMatches(req.headers["x-api-key"], API_KEY)) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    next();
  });

  app.use("/api/leads", leadsRouter);

  app.get("/health", (req, res) => res.json({ ok: true, service: "hulkenstein-leads-api" }));

  app.use((req, res) => res.status(404).json({ ok: false, error: "not_found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status === 403) return res.status(403).json({ ok: false, error: "origin_not_allowed" });
    console.error(err);
    res.status(500).json({ ok: false, error: "internal_error" });
  });

  return app;
}

module.exports = { createApp };
