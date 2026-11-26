// Tests the eligibility engine at its public seam: evaluateAll(student).
// The engine lives inline in the calculator HTML (so the site stays a single
// drop-in file); we pull out the block between the ENGINE-START / ENGINE-END
// markers and run it in a sandbox.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const HTML = fs.readFileSync(path.join(__dirname, "..", "hulkenstein-eligibility-calculator-bangla-1.html"), "utf8");
const m = HTML.match(/\/\/ ENGINE-START[^\n]*\n([\s\S]*?)\/\/ ENGINE-END/);
if (!m) throw new Error("ENGINE-START / ENGINE-END markers not found in the calculator HTML");
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(m[1] + "\n;this.evaluateAll = evaluateAll; this.ADMISSION = ADMISSION;", sandbox);
const { evaluateAll, ADMISSION } = sandbox;

const B = ADMISSION.currentHscBatch;

function student(over) {
  return Object.assign({
    sscGPA: 5, sscYear: B - 2, hscGPA: 5, hscYear: B, hscTrack: "science",
    subjects: { physics: 5, chemistry: 5, math: 5, biology: 5, english: 5 }
  }, over);
}
function eligibleUnits(s, uniId) {
  const hit = evaluateAll(s).find((r) => r.uni.id === uniId);
  // spread: copy into this realm so deepEqual(…, []) works on sandbox arrays
  return hit ? [...hit.eligibleUnits.map((u) => u.unit.unitName)] : [];
}

test("current-batch-only universities reject an older HSC batch", () => {
  assert.ok(eligibleUnits(student(), "du").length > 0, "current batch should be eligible for DU");
  assert.deepEqual(eligibleUnits(student({ sscYear: B - 5, hscYear: B - 3 }), "du"), []);
});

// ---- 2026-27 circulars (sources in CIRCULARS.md) ----

test("JU 2026-27: HSC 2025/2026 with SSC 2023/2024 only", () => {
  assert.ok(eligibleUnits(student({ sscYear: B - 3, hscYear: B - 1 }), "ju").length > 0, "second-timer with SSC 2023 ok");
  assert.deepEqual(eligibleUnits(student({ sscYear: B - 4, hscYear: B - 1 }), "ju"), [], "SSC 2022 not allowed");
  assert.deepEqual(eligibleUnits(student({ sscYear: B - 4, hscYear: B - 2 }), "ju"), [], "HSC 2024 not allowed");
});

test("JU 2026-27: lowered GPA floors", () => {
  const arts = (sum) => student({ hscTrack: "arts", sscGPA: 3.25, hscGPA: sum - 3.25 });
  assert.ok(eligibleUnits(arts(6.5), "ju").some((n) => n.startsWith("B")), "arts 6.50 now meets B unit");
  assert.ok(!eligibleUnits(arts(6.25), "ju").some((n) => n.startsWith("B")));
  const sci = student({ sscGPA: 4.0, hscGPA: 3.5 }); // 7.50 total
  const u = eligibleUnits(sci, "ju");
  assert.ok(u.some((n) => n.startsWith("A ")) && !u.some((n) => n.startsWith("D ")), "sci 7.5 meets A but not D (8.0)");
  const comm = student({ hscTrack: "commerce", sscGPA: 3.5, hscGPA: 3.5 }); // 7.0: C needs 7.5 for commerce
  assert.ok(!eligibleUnits(comm, "ju").some((n) => n.startsWith("C ")));
});

test("JnU 2026-27: HSC 2026 only, SSC 2023/2024, lowered floors", () => {
  const arts = student({ hscTrack: "arts", sscYear: B - 3, sscGPA: 3.25, hscGPA: 2.75 }); // 6.00
  const u = eligibleUnits(arts, "jnu");
  assert.ok(u.some((n) => n.includes("B")) && u.some((n) => n.includes("D")), "6.00 / 2.75 meets B and D");
  assert.ok(!u.some((n) => n.includes("C (")), "C still needs 6.50 / 3.00");
  assert.deepEqual(eligibleUnits(student({ sscYear: B - 4 }), "jnu"), [], "SSC 2022 not allowed");
  assert.deepEqual(eligibleUnits(student({ sscYear: B - 3, hscYear: B - 1 }), "jnu"), [], "no second-timers");
  assert.ok(eligibleUnits(student({ sscGPA: 4, hscGPA: 3 }), "jnu").some((n) => n.includes("A")), "sci 7.00/3.00 meets A");
});

test("DU 2026-27: SSC 2021-2024 with HSC 2026", () => {
  assert.ok(eligibleUnits(student({ sscYear: B - 5 }), "du").length > 0);
  assert.deepEqual(eligibleUnits(student({ sscYear: B - 6 }), "du"), []);
});

test("RU 2026-27: arts/commerce 6.50 & 3.00, science 7.50 & 3.50", () => {
  assert.equal(eligibleUnits(student({ hscTrack: "arts", sscGPA: 3.5, hscGPA: 3.0 }), "ru").length, 1);
  assert.equal(eligibleUnits(student({ sscGPA: 4.0, hscGPA: 3.5 }), "ru").length, 1);
  assert.equal(eligibleUnits(student({ sscGPA: 4.0, hscGPA: 3.25 }), "ru").length, 0);
});

test("MBBS/AFMC: physics and chemistry also need 3.50", () => {
  const s = student({ hscYear: B, subjects: { physics: 3.0, chemistry: 5, math: 5, biology: 5, english: 5 } });
  assert.deepEqual(eligibleUnits(s, "mbbs-bds"), []);
  assert.deepEqual(eligibleUnits(s, "afmc"), []);
});

test("CUET: English needs only a B (3.00)", () => {
  const s = student({ subjects: { physics: 5, chemistry: 5, math: 5, biology: 0, english: 3.0 } });
  assert.ok(eligibleUnits(s, "cuet").length > 0);
});

test("CU: current batch sees only current-batch rows; previous batch only second-timer rows", () => {
  const cur = eligibleUnits(student(), "cu");
  const prev = eligibleUnits(student({ hscYear: B - 1 }), "cu");
  assert.ok(cur.length > 0 && prev.length > 0);
  assert.ok(cur.every((n) => n.includes("চলতি ব্যাচ")), cur.join(" | "));
  assert.ok(prev.every((n) => n.includes("আগের ব্যাচ")), prev.join(" | "));
});

test("Agri cluster 2026-27: 4.00 in each, SSC 2022-2024, HSC 2025/2026", () => {
  const s = (o) => student(Object.assign({ sscGPA: 4.0, hscGPA: 4.0 }, o));
  assert.ok(eligibleUnits(s(), "gst-agri").length > 0, "4.00 + 4.00 is enough (no 8.50 total stated for 2026-27)");
  assert.deepEqual(eligibleUnits(s({ hscGPA: 3.9 }), "gst-agri"), []);
  assert.deepEqual(eligibleUnits(s({ sscYear: B - 5, hscYear: B - 1 }), "gst-agri"), [], "SSC 2021 not allowed");
});

test("NU honours: commerce is grouped with humanities (4.50 total)", () => {
  const comm = student({ hscTrack: "commerce", sscGPA: 2.25, hscGPA: 2.25 });
  assert.ok(eligibleUnits(comm, "nu").length > 0);
  assert.deepEqual(eligibleUnits(student({ sscGPA: 2.25, hscGPA: 2.25 }), "nu"), [], "science still needs 4.75");
});

// ---- Updates supplied 2026-11-26 ("Updates on the remaining universities") ----

test("MIST 2026-27: SSC 4.00, math+physics+chemistry >= 12.00 with each >= 3.50, second-timers allowed", () => {
  const subj = (m, p, c) => ({ physics: p, chemistry: c, math: m, biology: 0, english: 2.0 });
  const ab = (u) => u.filter((n) => !n.startsWith("C "));
  const s = (o) => student(Object.assign({ sscGPA: 4.0, hscGPA: 4.0, subjects: subj(4, 4, 4) }, o));
  assert.ok(ab(eligibleUnits(s(), "mist")).length > 0, "12.00 total, English 2.0 is fine now");
  assert.ok(ab(eligibleUnits(s({ hscYear: B - 1, sscYear: B - 3 }), "mist")).length > 0, "HSC 2025 second-timer");
  assert.deepEqual(ab(eligibleUnits(s({ subjects: subj(5, 3.25, 5) }), "mist")), [], "physics below 3.50");
  assert.deepEqual(ab(eligibleUnits(s({ subjects: subj(4, 3.5, 4) }), "mist")), [], "total 11.50");
  assert.deepEqual(ab(eligibleUnits(s({ sscGPA: 3.9 }), "mist")), []);
});

test("BUTEX 2026-27: 4-subject total 16.50, each >= 3.50, SSC & HSC >= 4.00", () => {
  const s = student({ sscGPA: 4, hscGPA: 4, subjects: { physics: 4, chemistry: 4, math: 4.5, biology: 0, english: 4 } }); // 16.50
  assert.ok(eligibleUnits(s, "butex").length > 0);
  const low = student({ sscGPA: 4, hscGPA: 4, subjects: { physics: 4, chemistry: 4, math: 4, biology: 0, english: 4.25 } }); // 16.25
  assert.deepEqual(eligibleUnits(low, "butex"), []);
});

test("Nursing BSc: total 7.00, 3.00 each, science with biology", () => {
  const s = (sum, bio) => student({ sscGPA: 3.5, hscGPA: sum - 3.5, subjects: { physics: 3, chemistry: 3, math: 3, biology: bio, english: 3 } });
  const bsc = (x) => eligibleUnits(x, "bnmc").filter((n) => n.includes("বিএসসি"));
  assert.equal(bsc(s(7.0, 3.0)).length, 1);
  assert.equal(bsc(s(6.75, 3.0)).length, 0, "6.75 total is below 7.00");
  assert.equal(bsc(s(7.0, 0)).length, 0, "biology required");
});

test("MIST 2026-27 (official circular): Units A/B need SSC 2023/2024; new Unit C (Science) needs 3.50 in each exam", () => {
  const weak = { physics: 3, chemistry: 3, math: 3, biology: 0, english: 3 };
  const ab = (u) => u.filter((n) => !n.startsWith("C "));
  assert.deepEqual(ab(eligibleUnits(student({ sscYear: B - 4, hscYear: B - 1 }), "mist")), [], "SSC 2022 not allowed for A/B");
  const c = eligibleUnits(student({ sscGPA: 3.5, hscGPA: 3.5, subjects: weak }), "mist");
  assert.equal(c.length, 1, "only Unit C: " + c.join(" | "));
  assert.ok(c[0].startsWith("C "));
  assert.deepEqual(eligibleUnits(student({ sscGPA: 3.5, hscGPA: 3.4, subjects: weak }), "mist"), []);
  assert.deepEqual(eligibleUnits(student({ hscYear: B - 2, sscGPA: 3.5, hscGPA: 3.5, subjects: weak }), "mist"), [], "HSC 2024 not allowed");
});
