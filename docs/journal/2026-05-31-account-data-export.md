# Account data-export endpoint — GDPR Art. 20 / CCPA (2026-05-31)

## Context

Follow-on from the [privacy re-audit](../audits/privacy.md) (same day). P3 #12
("no data-export endpoint") was a standing legal-feature gap: GDPR Art. 20 and
CCPA § 1798.100 require a machine-readable export of a user's data on request,
and we had neither endpoint nor UI. The audit explicitly recommended shipping
this **before** the larger account-deletion feature (P1 #2 follow-up) because it
forces the data-inventory work and gives support a safe answer to "send me my
data" emails. User picked it as the next item.

## Decisions

- **User-scoped client, not admin.** Chose `getServerSupabase()` + per-category
  `.eq('<owner col>', uid)` filters over the admin client. Every table in the
  payload has an owner/self RLS read path, so the explicit filter and the policy
  agree and RLS stays a safety net — no `createSupabaseAdminClient()` /
  RLS-bypass for a self-read (AGENTS.md pitfall #8). Same posture as the existing
  `receipts/[year]/statement.csv` route, which this is modeled on.
- **Throw on any read error; never return a partial file.** A GDPR export that
  silently drops a category is worse than one that fails — the 15 reads run in
  `Promise.all`, then the first `.error` surfaces as a 500 so the user retries.
  An RLS-empty result is `[]`, not an error, so legitimately-empty categories
  don't trip it.
- **Omit cross-user identifiers and credentials.** Kept what is plainly the
  user's own (`tipper_display_name` on a received tip, `friend_id` / `blocked_id`
  on their own lists) but dropped `tipper_user_id`; excluded the push
  subscription `auth` secret (a credential, not personal data).
- **Thin route, inline collection — no extracted lib, no mock test.** Matched the
  sibling file routes (`receipts`, `earnings`, `attendees`), which do the read +
  shape inline and have no unit test. A 15-query builder mock would be a brittle
  new pattern; the payload is verified by typecheck (every column checked against
  the generated `Database` types) + the file-download smoke path.
- **Plain `<a download>` on the profile page**, not a client component — the
  route streams `content-disposition: attachment`, so a server-rendered anchor
  is all that's needed (and the route is an API path, so no
  `no-html-link-for-pages` lint concern).
- **Included the chat surface** (`messages` as sender, conversations
  participated in, `user_blocks`), which resolves the export half of privacy
  audit #15 in the same pass.

## Changes

- `apps/web/src/app/api/account/export/route.ts` — new `GET` handler; 16-category
  JSON export, user-scoped, throws-on-partial, attachment download.
- `apps/web/src/app/profile/page.tsx` — new "Privacy & your data" section with a
  "Download my data" link.
- `docs/audits/privacy.md` — P3 #12 marked resolved (file + payload), #15 export
  half resolved, re-audit status bullet + remediation log entry.
- `docs/audits/README.md` — privacy index row updated.

## Patterns observed

- **Schema drift makes column names the risky part.** The tables renamed heavily
  since the audit (`event_attendees` → `event_participants`, team tables
  collapsed to `event_team_entries` / `event_team_entry_members`). Extracted the
  exact `Row` shapes from `packages/supabase/src/database.types.ts` before
  writing any `.select(...)` — typecheck then catches a wrong column name, but
  only because each select is against the typed client.

## Follow-ups

- **Account-deletion (P1 #2)** is the remaining big privacy item; this export did
  its data-inventory groundwork. #15's deletion half (chat CASCADE side-effects,
  the DM "deleting one party removes the other's copy" tombstone question) rides
  on it.
- **Chat retention (P2 #14)** and **`rate_limits.key` hashing (P3 #10)** still
  open — see [privacy.md](../audits/privacy.md).
- Possible enhancement: rate-limit the export route if abuse shows up (it's
  authenticated + self-only, so low priority).
