// utils/csv.js
//
// Hand-rolled CSV writer instead of pulling in a dependency - the leads
// table is simple enough (flat rows, no nested objects except the one JSON
// column) that a library adds more surface area than it saves. This also
// means the CTO's team can read every line of what gets exported.

const COLUMNS = [
  { key: "id", header: "ID" },
  { key: "created_at", header: "Submitted At" },
  { key: "name", header: "Name" },
  { key: "mobile", header: "Mobile" },
  { key: "email", header: "Email" },
  { key: "ssc_gpa", header: "SSC GPA" },
  { key: "ssc_year", header: "SSC Year" },
  { key: "ssc_track", header: "SSC Track" },
  { key: "hsc_gpa", header: "HSC GPA" },
  { key: "hsc_year", header: "HSC Year" },
  { key: "hsc_track", header: "HSC Track" },
  { key: "physics_gpa", header: "Physics GPA" },
  { key: "chemistry_gpa", header: "Chemistry GPA" },
  { key: "math_gpa", header: "Math GPA" },
  { key: "biology_gpa", header: "Biology GPA" },
  { key: "english_gpa", header: "English GPA" },
  { key: "eligible_count", header: "Eligible Count" },
  { key: "eligible_summary", header: "Eligible Universities" },
  { key: "source", header: "Source" }
];

function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  let str = String(value);
  // CSV/formula injection: Excel and Sheets execute cells starting with
  // = + - @ (or tab/CR). Names and emails are typed by the public, so
  // prefix those with ' to force them to plain text. Numbers are left as-is.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(str)) str = "'" + str;
  // Any field containing a comma, quote, or newline must be quoted, and any
  // internal quote doubled - this is the actual CSV spec (RFC 4180), not
  // just "wrap everything in quotes", so it survives being opened directly
  // in Excel/Google Sheets without breaking columns.
  if (/[",\r\n]/.test(str) || str !== String(value)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function leadsToCsv(leads) {
  const header = COLUMNS.map((c) => escapeCsvField(c.header)).join(",");
  const rows = leads.map((lead) =>
    COLUMNS.map((c) => escapeCsvField(lead[c.key])).join(",")
  );
  // Prefixing with a UTF-8 BOM so Excel on Windows renders বাংলা names
  // correctly instead of showing mojibake - this one byte sequence is the
  // difference between "Rakib" showing correctly and showing as garbage
  // when a Bangladeshi sales team opens this in Excel.
  const BOM = "\uFEFF";
  return BOM + [header, ...rows].join("\r\n");
}

module.exports = { leadsToCsv, COLUMNS };
