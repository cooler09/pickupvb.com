# 2026-06-08 — Waiver acknowledgement + signature tracking (monetization O-9, free + soft)

## Context

O-9: a per-event liability waiver. Shipped in two steps in one session, with an
honest course-correction in the middle worth recording:

1. **First cut:** a free-for-any-host, **soft** (never blocks registration)
   typed-name click-wrap waiver — host pastes text, attendees sign, host sees the
   list. (Maintainer's earlier call: don't paywall a safety tool; keep it soft so
   it touches no join/checkout path.)
2. **Maintainer note:** "hosts will probably have their own legal waivers and
   collect waivers in person." Correct — a typed-name click-wrap is not a legal
   substitute (enforceability varies, no identity verification), and serious
   hosts already use their insurer/sanctioning-body waiver + paper at check-in.
   So the first cut over-claimed and was redundant for that persona.
3. **Reframe (this entry):** stop pretending it's a legal instrument. Make it a
   **link-your-own-waiver + acknowledgement + manual signature tracker** — which
   matches how hosts actually operate and adds real value (record who signed,
   however they signed). Still free, still soft.

## Decisions

- **Link your own + rules text — `external_url` and/or `body`.** The host links
  their real waiver (PDF/DocuSign/sanctioning body) and/or pastes rules text; at
  least one (DB CHECK). The detail page shows "Read the full waiver ↗" + an
  online acknowledgement. We no longer call it a "liability waiver" in the UI —
  it's a waiver/rules **acknowledgement**.

- **Manual in-person tracking is the real value (maintainer's add).** The host
  records who signed on paper, at their discretion: a free-text name →
  `waiver_signatures` with `method='in_person'`, `user_id` NULL (not tied to an
  account — covers walk-ins/guests), `recorded_by` = the host. The edit panel
  lists every signature (Online / In person + date + version) with remove. So the
  signature list is a real operational roster regardless of how someone signed.

- **One table, two methods, clean RLS.** `waiver_signatures.method` is `'self'`
  (attendee click-wrap — self-RLS insert/update/select, `user_id` = them) or
  `'in_person'` (host-recorded — written/read on the admin client, gated by
  `canManage`; the self-insert policy requires `method='self'` so attendees can't
  forge in-person rows). `unique(event_id, user_id)` enforces one record per
  known attendee while letting many NULL-user in-person rows coexist (Postgres
  NULLs are distinct).

- **Edited the unapplied migration in place.** O-9's migration was brand-new and
  deploy-gated (never applied), so the reframe edited `20261005000000` directly
  (body→nullable + `external_url` + the has-content CHECK; `user_id`→nullable +
  `method` + `recorded_by_user_id`) rather than stacking a follow-up.

## Surfaces

Migration `20261005000000_event_waivers.sql`. `lib/waivers.ts` (read facade +
`addManualSignature` / `removeSignature`). Host: `edit/waiver-actions.ts`
(upsert with external_url; add-in-person; remove-signature; delete) +
`edit/event-waiver-panel.tsx` (link/text fields + the signature roster).
Attendee: `waiver-actions.ts` (self acknowledge) +
`_components/event-waiver-section.tsx` (link-out + acknowledge, injected on the
event page). Hand-edited DB types. No ADR (small, free, non-architectural). Docs:
features.md (reframed), monetization.md (O-9 ✅ + remediation log), README.

## Deferred (possible premium hooks if it's ever monetized)

Hard-gating registration on a signature; team/tournament (captain-vs-player)
waivers; downloadable signed-PDF export; tying in-person records to specific
attendee accounts (roster checklist) rather than free-text names.

## Verify

`pnpm typecheck && pnpm lint && pnpm test && pnpm build` — green (0 lint errors;
all suites). One typecheck fix: the optional `flashCode` prop needed a narrowed
const + conditional spread (`exactOptionalPropertyTypes`). Migration **not**
applied locally (deploy-gated). Unverified on a live env: the acknowledge →
record → re-sign-on-version-bump round-trip and the host manual add/remove; run
on dev after deploy.
