/**
 * Shared date display helpers.
 *
 * Every date the app shows uses the same shape: `05 May 2026` — two-digit day,
 * full English month name, four-digit year. Letters (reference letter,
 * employment certificate) use the same formatter so on-screen and exported
 * documents never disagree.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, "0");

/** `2026-05-05` / ISO timestamp / Date -> `05 May 2026`. */
export function formatDate(value?: string | Date | null, fallback = "—"): string {
  if (value == null || value === "") return fallback;

  // Plain `YYYY-MM-DD` values are calendar days, not instants: read them in UTC
  // so a browser west of Greenwich cannot roll them back one day.
  if (typeof value === "string") {
    const exact = DATE_ONLY.exec(value.trim());
    if (exact) return `${pad(Number(exact[3]))} ${MONTHS[Number(exact[2]) - 1]} ${exact[1]}`;
  }

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : fallback;
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** `2026-05-05T13:06:00Z` -> `05 May 2026, 14:06` (viewer's own clock). */
export function formatDateTime(value?: string | Date | null, fallback = "—"): string {
  if (value == null || value === "") return fallback;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : fallback;
  return `${formatDate(date)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `2026-05` -> `May` (chart axis labels). */
export function formatMonthLabel(value?: string | null, fallback = "—"): string {
  if (!value) return fallback;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return value;
  return MONTHS[Number(match[2]) - 1] ?? value;
}
