/**
 * Shared `<script type="application/ld+json">` emitter for every schema.org
 * JSON-LD blob on the site (events, teams, groups, breadcrumbs, community
 * listings).
 *
 * Why this exists: `JSON.stringify` does **not** escape `<`, so embedding it
 * raw in a `<script>` lets any user-controlled string value (an event/listing
 * title, a group description) close the script early with `</script>` and
 * inject markup — a stored-XSS vector, reachable by anyone who can name an
 * aggregate. Community listings made it trivially exploitable (any signed-in
 * user submits a title). We escape `<` plus the two JS line terminators that
 * are legal in JSON but break inline scripts (U+2028 / U+2029) to their
 * `\uXXXX` forms, which keeps the JSON valid while making break-out impossible.
 */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Values are escaped by `jsonLdString` so no untrusted markup can break
      // out of the inline script (see file header).
      dangerouslySetInnerHTML={{ __html: jsonLdString(data) }}
    />
  );
}
