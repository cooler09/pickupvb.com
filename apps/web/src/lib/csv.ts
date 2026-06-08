/**
 * CSV cell escaping shared by every `*.csv` route (receipts, earnings, and the
 * attendee export). Previously each route carried its own copy of this
 * function; they drifted into a single hardened home here (receipts-tax audit
 * R-3 / R-7).
 *
 * Two jobs:
 *
 *  1. **RFC-4180 quoting** — wrap the value in double quotes (and double any
 *     embedded quote) when it contains a comma, quote, or newline.
 *
 *  2. **Formula-injection defense** — a cell whose first character is one of
 *     `=` `+` `-` `@` TAB CR is interpreted as a *formula* by Excel / Google
 *     Sheets / LibreOffice when the file is opened. Our cells carry
 *     user-controlled text (event titles, host + attendee display names), so a
 *     host could name an event `=HYPERLINK("http://evil","click")` and have it
 *     execute in a buyer's downloaded statement. Prefix such a value with a
 *     single quote so the spreadsheet treats it as literal text. See
 *     docs/audits/receipts-tax.md R-3.
 */
export function csvCell(value: string | null | undefined): string {
  if (value == null) return '';
  let v = value;
  // Neutralize formula injection before any quoting.
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  // RFC-4180 quote when the (possibly prefixed) value needs it.
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
