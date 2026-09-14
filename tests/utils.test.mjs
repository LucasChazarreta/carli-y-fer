import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarFile,
  countdown,
  csvText,
  safeURL,
  escapeHTML,
} from "../public/utils.js";
import { initialWedding } from "../public/data.js";
test("calendar keeps Argentina local times across the UTC date boundary", () => {
  const text = calendarFile(initialWedding, new Date("2026-09-13T00:00:00Z"));
  assert.match(text, /DTSTART:20261018T000000Z/);
  assert.match(text, /DTSTART:20261018T010000Z/);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.ok(!text.includes("DTEND"));
});
test("calendar escapes content and folds UTF-8 lines to at most 75 bytes", () => {
  const text = calendarFile({
    ...initialWedding,
    welcome: "",
    names: "Á".repeat(100) + ";\nBEGIN:BAD,\\",
  });
  for (const line of text.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
  const unfolded = text.replace(/\r\n /g, "");
  assert.ok(unfolded.includes("\\;\\nBEGIN:BAD\\,\\\\"));
});
test("countdown never shows negative days after the wedding", () =>
  assert.deepEqual(
    countdown(
      "2026-10-18T00:00:00Z",
      new Date("2026-10-20T00:00:00Z").getTime(),
    ),
    [0, 0, 0, 0],
  ));
test("CSV protects spreadsheet formulas and preserves names and delimiters", () => {
  const result = csvText([
    ['=HYPERLINK("bad")', " +SUM(1;1)", "Carli; Fer", "Álvaro"],
  ]);
  assert.ok(result.startsWith("\ufeff"));
  assert.ok(result.includes("'=HYPERLINK"));
  assert.ok(result.includes("' +SUM"));
  assert.ok(result.includes('"Carli; Fer"'));
});
test("guest-controlled HTML and unsafe links cannot become active markup", () => {
  assert.equal(safeURL("javascript:alert(1)"), "");
  assert.equal(safeURL("http://example.com"), "");
  assert.equal(safeURL("https://maps.google.com"), "https://maps.google.com/");
  assert.equal(
    escapeHTML('<img onerror="x">'),
    "&lt;img onerror=&quot;x&quot;&gt;",
  );
});
