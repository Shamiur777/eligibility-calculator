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
  return hit ? hit.eligibleUnits.map((u) => u.unit.unitName) : [];
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
