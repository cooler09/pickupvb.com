# 0009. Canonical domain apex: `pickupvb.com`, no `www.`

- **Status:** Accepted
- **Date:** 2026-05-22

## Context

The site has been available at the apex (`pickupvb.com`) since launch, but
the question of whether the canonical hostname should be `pickupvb.com` or
`www.pickupvb.com` was never written down. The decision is encoded in
several places already (Vercel domain alias, [robots.ts](../../apps/web/src/app/robots.ts),
[sitemap.ts](../../apps/web/src/app/sitemap.ts), JSON-LD `@id`s, and the
`PROD_APP_URL` constant in [app-url.ts](../../apps/web/src/lib/app-url.ts))
but a future reader who sees those references can't tell whether the choice
was deliberate or accidental. The community-listings allow-list
[external-url.ts](../../packages/domain/src/community-listings/external-url.ts)
also has to treat `pickupvb.com`, `www.pickupvb.com`, and
`dev.pickupvb.com` as the same trust boundary, which only makes sense once
the canonical form is fixed.

The [environments doc](../environments.md) already documents the topology
(production at `pickupvb.com`, staging at `dev.pickupvb.com`) but doesn't
explain _why_ the apex was picked over `www.`.

## Decision

The canonical production hostname is **`pickupvb.com`** — bare apex, no
`www.`. The `www.` subdomain redirects 308 to the apex at the Vercel
edge. Staging uses `dev.pickupvb.com` (subdomain, not a separate apex).

All SEO-canonical identifiers are pinned to the apex via the
`PROD_APP_URL` constant in [apps/web/src/lib/app-url.ts](../../apps/web/src/lib/app-url.ts):

- `metadataBase` in the root layout.
- JSON-LD `@id` URLs (BreadcrumbList, SportsTeam, SportsOrganization).
- `sitemap.xml` URLs.
- `robots.txt` `Host:` directive and `sitemap:` URL.

Per-visitor share/CTA links use `APP_URL` (the per-deployment value) so
links generated on staging don't accidentally point at production. The
boolean `IS_PROD_HOST = APP_URL === PROD_APP_URL` gates behavior that
should only happen on the canonical production deployment (real
`robots.txt`, full `sitemap.xml`).

## Consequences

- ✅ A single canonical form means search engines never see split
  authority between `www.` and apex variants. JSON-LD `@id` values stay
  stable.
- ✅ Email-from addresses (`noreply@pickupvb.com`), `VAPID_SUBJECT`,
  geocoder `User-Agent`, and other identity strings all align with the
  visible hostname.
- ✅ The dev subdomain pattern (`dev.pickupvb.com`) leaves room for
  further subdomains (`status.`, `docs.`, …) without rewriting the
  canonical-form decision.
- ❌ Apex domains can't be served via CNAME at most registrars — we rely
  on Vercel's ANAME / ALIAS-style A-record support. A registrar swap
  would need DNS work that a `www.` setup wouldn't.
- ❌ Cookies set on the apex are visible to every future subdomain
  (including any third-party subdomain pointed at the apex IP). Mitigated
  by scoping auth cookies to `pickupvb.com` only and not using wildcard
  cookie domains.

## Alternatives considered

- **`www.pickupvb.com` as canonical, apex redirects to `www.`.** The
  classic "always use www" argument is cookie scoping and CNAME-everywhere
  flexibility. Rejected because (a) the brand reads as `pickupvb.com`
  without the `www.` prefix, (b) Vercel handles apex DNS natively, and
  (c) we don't need wildcard cookies.
- **Serve both equally (no redirect).** Splits authority for SEO and
  doubles the surface for share-link mismatches. Rejected.
- **Use a different apex for staging (`pickupvb-dev.com`).** Cleaner
  isolation but doubles DNS / TLS / email-domain setup for no real
  benefit at current scale. The `dev.` subdomain is good enough and the
  [environments doc](../environments.md) already documents the split.
