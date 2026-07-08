// Matches the structure of the uploaded template (Sample_docs/VWO.com - TC.csv):
// project metadata block, a blank spacer row, then the real column header.
export const COLUMNS = [
  "TID",
  "Scenario Description",
  "Test Case ID",
  "Pre Condition",
  "Steps to Execute",
  "Expected Result",
  "Actual Result",
  "Status",
  "Executed QA Name",
  "Misc (Comments)",
  "Priority",
];

function templateMetaRows() {
  const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  return [
    ["Test Case Template for Project"],
    ["Project Name", "", "app.vwo.com"],
    ["Module Name", "", "Generated via Smart TestCaseGen RAG"],
    ["Created Date", "", today],
    [],
  ];
}

// Full-text CSV parser -- tracks quote state across the whole string rather
// than splitting on "\n" first. The model's "Steps to Execute" field quotes
// its numbered steps across multiple physical lines (e.g. "1. Open the
// page\n2. Enter details\n..."), so a naive split-by-line-then-parse breaks
// one logical row into several misaligned rows.
function parseCsvRecords(text) {
  const records = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0] !== "") records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // skip -- paired \n (if any) handles the row break
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();

  return records;
}

function quoteField(value = "") {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function looksLikeCsv(text) {
  if (!text) return false;
  const records = parseCsvRecords(text.trim());
  if (records.length === 0) return false;
  return records[0].length >= 5 && /TC[_-]?\d/i.test(text);
}

const PRIORITY_WORD = /^(high|medium|low|critical)$/i;
const REF_MARKER = /^ref:/i;

// The model doesn't always emit exactly 11 fields per row: it sometimes
// leaves Expected Result unquoted despite containing its own commas
// (splitting into extra fields), or drops one of the blank Actual
// Result/Status/QA Name placeholders (too few fields). Columns 0-5
// (TID..Expected Result) are reliably atomic, and the prompt guarantees the
// Misc (Comments) field always starts with "Ref:" -- so anchor on that
// marker directly rather than padding blindly by position, which previously
// shifted the Ref text into Executed QA Name whenever a blank was dropped.
function reconcileFieldCount(fields) {
  const refIndex = fields.findIndex((f, i) => i >= 5 && REF_MARKER.test(f.trim()));

  if (refIndex !== -1) {
    const head = fields.slice(0, 6);
    while (head.length < 6) head.push("");
    const blanksBeforeMisc = fields.slice(6, refIndex);
    while (blanksBeforeMisc.length < 3) blanksBeforeMisc.push("");
    const misc = fields[refIndex];
    const after = fields.slice(refIndex + 1).map((f) => f.trim());
    const priority = after.length > 0 ? after[after.length - 1] : "";
    return [...head.slice(0, 6), ...blanksBeforeMisc.slice(0, 3), misc, priority];
  }

  if (fields.length === COLUMNS.length) return fields;

  const last = fields[fields.length - 1]?.trim() ?? "";
  const hasPriorityTail = PRIORITY_WORD.test(last) && fields.length > 5;

  if (fields.length > COLUMNS.length) {
    const tailLen = hasPriorityTail ? 5 : Math.min(5, fields.length - 5);
    const head = fields.slice(0, 5);
    const tail = fields.slice(fields.length - tailLen);
    const expectedResult = fields.slice(5, fields.length - tailLen).join(", ");
    const merged = [...head, expectedResult, ...tail];
    while (merged.length < COLUMNS.length) merged.splice(merged.length - 1, 0, "");
    return merged.slice(0, COLUMNS.length);
  }

  // Too few fields -- if the row ends in a recognizable priority value,
  // pin it to the last column and pad blanks in front of it rather than
  // after (a trailing pad would push Priority's value into Misc instead).
  if (hasPriorityTail) {
    const withoutPriority = fields.slice(0, -1);
    while (withoutPriority.length < COLUMNS.length - 1) withoutPriority.push("");
    return [...withoutPriority, last];
  }

  return fields;
}

/**
 * Parses the model's raw output into row arrays (padded/trimmed to the
 * template's column count) and renumbers the TID column sequentially --
 * the model often only fills in TID on the first row and leaves it blank
 * on the rest.
 */
export function parseTestCaseRows(text) {
  const records = parseCsvRecords(text.trim());
  return records.map((fields, i) => {
    const row = reconcileFieldCount(fields);
    while (row.length < COLUMNS.length) row.push("");
    row[0] = String(i + 1);
    return row.slice(0, COLUMNS.length);
  });
}

export function downloadCsv(rows, filename = "generated_test_cases.csv") {
  const allRows = [...templateMetaRows(), COLUMNS, ...rows];
  const csvText = allRows.map((row) => row.map(quoteField).join(",")).join("\n");
  // BOM prefix so Excel opens it with correct encoding instead of mangling special characters
  const blob = new Blob(["﻿" + csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
