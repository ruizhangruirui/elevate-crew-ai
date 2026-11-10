import { describe, it } from "node:test";
import { strictEqual } from "node:assert/strict";
import { formatDate, formatDateTime, formatMonthLabel } from "./dates";

describe("date display format", () => {
  it("shows day, full month name and year", () => {
    strictEqual(formatDate("2026-05-05"), "05 May 2026");
    strictEqual(formatDate("2026-11-10"), "10 November 2026");
    strictEqual(formatDate("2026-01-01"), "01 January 2026");
    strictEqual(formatDate("2026-12-31"), "31 December 2026");
  });

  it("keeps single-digit days padded to two digits", () => {
    strictEqual(formatDate("2026-05-09"), "09 May 2026");
    strictEqual(formatDate("2026-05-01"), "01 May 2026");
  });

  it("reads plain calendar dates in UTC so the day never shifts", () => {
    strictEqual(formatDate("2026-05-05T00:00:00.000Z"), "05 May 2026");
  });

  it("falls back for empty and unreadable values", () => {
    strictEqual(formatDate(null), "—");
    strictEqual(formatDate(""), "—");
    strictEqual(formatDate(undefined, "n/a"), "n/a");
    strictEqual(formatDate("not a date"), "not a date");
  });

  it("adds a 24-hour time for timestamps", () => {
    strictEqual(
      formatDateTime("2026-05-05T12:06:00.000Z"),
      `${formatDate("2026-05-05")}, ${new Date("2026-05-05T12:06:00.000Z").getHours().toString().padStart(2, "0")}:06`,
    );
    strictEqual(formatDateTime(null), "—");
  });

  it("names the month in chart labels", () => {
    strictEqual(formatMonthLabel("2026-05"), "May");
    strictEqual(formatMonthLabel("2026-12"), "December");
    strictEqual(formatMonthLabel(null), "—");
  });
});
