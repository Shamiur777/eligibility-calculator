// Tests the leads API at its HTTP seam: real requests against createApp()
// on a random port, backed by a throwaway SQLite file.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leads-test-"));
process.env.DB_PATH = path.join(tmp, "leads.db");
process.env.ALLOWED_ORIGINS = "https://edgecoursebd.com";
const KEY = "test-key-0123456789abcdef0123456789abcdef";

const { createApp } = require("../app");

async function withServer(env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  const server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { return await fn(base); }
  finally { server.close(); process.env = saved; }
}

const validLead = {
  name: "Test Student", mobile: "01712345678", email: "t@example.com",
  sscGPA: 5, sscYear: 2024, sscTrack: "science",
  hscGPA: 5, hscYear: 2026, hscTrack: "science",
  eligibleUniversities: [{ name: "DU", units: ["Science"] }]
};
const post = (base, body, headers = {}) =>
  fetch(`${base}/api/leads`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("lead export is refused when ADMIN_API_KEY is not configured", async () => {
  await withServer({ ADMIN_API_KEY: undefined }, async (base) => {
    const res = await fetch(`${base}/api/leads/export.csv`);
    assert.notEqual(res.status, 200);
  });
});

test("lead export is refused when ADMIN_API_KEY is still the .env.example placeholder", async () => {
  await withServer({ ADMIN_API_KEY: "change-this-to-a-long-random-string" }, async (base) => {
    const res = await fetch(`${base}/api/leads`, { headers: { "x-api-key": "change-this-to-a-long-random-string" } });
    assert.notEqual(res.status, 200);
  });
});

test("valid key can export, and spreadsheet formulas in lead fields are neutralised", async () => {
  await withServer({ ADMIN_API_KEY: KEY }, async (base) => {
    const evil = '=HYPERLINK("http://evil.example","x")';
    assert.equal((await post(base, { ...validLead, name: evil })).status, 201);
    const res = await fetch(`${base}/api/leads/export.csv`, { headers: { "x-api-key": KEY } });
    assert.equal(res.status, 200);
    const csv = await res.text();
    assert.ok(!csv.includes(`,"=HYPERLINK`) && !csv.includes(",=HYPERLINK"), "formula must not start a cell");
    assert.ok(csv.includes(`"'=HYPERLINK(""http://evil.example"",""x"")"`), "formula should be prefixed with a quote");
  });
});

test("wrong key is rejected", async () => {
  await withServer({ ADMIN_API_KEY: KEY }, async (base) => {
    const res = await fetch(`${base}/api/leads`, { headers: { "x-api-key": "nope" } });
    assert.equal(res.status, 401);
  });
});

test("malformed or oversized lead payloads get 400, not a server error", async () => {
  await withServer({ ADMIN_API_KEY: KEY }, async (base) => {
    const bad = [
      { ...validLead, eligibleUniversities: [null] },
      { ...validLead, eligibleUniversities: [{ name: "DU", units: "Science" }] },
      { ...validLead, name: "x".repeat(500) },
      { ...validLead, email: "a@b.co" + "m".repeat(400) },
      { ...validLead, eligibleUniversities: Array(500).fill({ name: "DU", units: [] }) },
      { ...validLead, source: { $gt: 1 } },
      { ...validLead, hscYear: 99999 }
    ];
    for (const body of bad) {
      const res = await post(base, body);
      assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body).slice(0, 80)}`);
    }
  });
});

test("date filters that aren't plain strings get 400", async () => {
  await withServer({ ADMIN_API_KEY: KEY }, async (base) => {
    const res = await fetch(`${base}/api/leads?from=a&from=b`, { headers: { "x-api-key": KEY } });
    assert.equal(res.status, 400);
  });
});

test("a spoofed X-Forwarded-For is not stored as the lead's IP unless TRUST_PROXY is set", async () => {
  await withServer({ ADMIN_API_KEY: KEY, TRUST_PROXY: undefined }, async (base) => {
    await post(base, { ...validLead, mobile: "01812345678" }, { "x-forwarded-for": "6.6.6.6" });
    const { leads } = await (await fetch(`${base}/api/leads`, { headers: { "x-api-key": KEY } })).json();
    const lead = leads.find((l) => l.mobile === "01812345678");
    assert.ok(lead && lead.ip_address !== "6.6.6.6");
  });
});
