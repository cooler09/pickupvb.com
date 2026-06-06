# persona-ux P3 closeout: claim `?next=` + H-3 tap targets (2026-06-06)

## Context

Third quick-win of the "wrap up outstanding items" plan, clearing the two
remaining persona-ux P3 backlog items
([docs/audits/persona-ux.md](../audits/persona-ux.md) standing backlog).

## Decisions

### Claim `?next=` propagation (V-4 follow-up)

- **Thread `next` through the full confirm → set-password chain.** Multiple
  gates already redirect anon users to `/claim?next=<path>` (`/events/new`,
  `/teams/new`, the event signup panels, `server-auth`), but `/claim` ignored
  it, so a guest who claimed their account from a host gate was dumped on
  `/events` instead of back where they were headed. The fix touches four hops:
  `/claim` page reads `?next=` → `ClaimForm` hidden field → `claimAccount`
  builds `emailRedirectTo = /auth/callback?next=<encoded
/reset-password?from=claim&next=<encoded orig>>` → `/reset-password` reads
  `next` and lands there.
- **Re-validate `next` at every hop with the existing same-origin guard**
  (`/^\/(?![/\\])/` — rejects `//evil.com` and `/\evil.com`), the same regex
  `/auth/callback` uses (security audit P1 #1). Validating once isn't enough —
  the value crosses a client form and a Supabase redirect, so the page, the
  action, and `/reset-password` each re-check before use.
- **Read `next` in `/reset-password` from `window.location` at submit time, not
  `useSearchParams`.** Avoids forcing a `<Suspense>` boundary (Next 16 de-opts a
  page that calls `useSearchParams` without one) — the target is only needed in
  the post-success `router.push`, so a one-line URL read there is simpler and
  has no render-time cost.

### H-3 row-action tap targets

- **Follow the member-row precedent exactly** (the audit's cited reference):
  neutral row actions → `` `${neutralButtonClass('sm')} tap-target` ``,
  the primary-tinted "+ Follow" → `tonalButtonClass('sm')`. The three
  already-32px neutral hand-rolls (`my-teams-panel` sign-in, `invite-response`
  Decline, `extra-members-form` Save) are like-for-like vocab swaps with no
  density change; the genuine 24px offenders (`attendee-list`, `friends-list`)
  also gain `tap-target` (a 48px min box).
- **Keep the "mark paid" affirmative emerald + add `tap-target`.** There's no M3
  `success*` button vocab yet (a documented gap), so forcing it onto
  `neutralButtonClass` would lose the affirmative cue. Color stays; only the
  touch target is lifted. Left as a documented non-migration until a `success*`
  family lands.
- **"Unfollow" is neutral, not destructive.** Mapped to `neutralButtonClass`
  (matching the "✓ Following" toggle), not `errorOutlinedButtonClass` — the
  member-row "Remove" earned the error treatment because it's destructive;
  unfollowing is a reversible toggle.

## Changes

- Claim: `claim/page.tsx`, `claim/claim-form.tsx`, `claim/actions.ts`,
  `reset-password/page.tsx`.
- H-3: `components/attendee-list.tsx`, `components/friends-list.tsx`,
  `teams/_components/my-teams-panel.tsx`,
  `teams/[id]/_components/invite-response.tsx`,
  `teams/[id]/_components/extra-members-form.tsx`.
- `docs/audits/persona-ux.md` — both items marked resolved; H-3 closed.

## Patterns observed

- **A `?next=` that survives an email round-trip must be re-validated at each
  hop, not just where it's first read.** The claim chain crosses a client form
  and Supabase's confirmation redirect before it reaches `/reset-password`;
  trusting the first validation would reopen the open-redirect at the last hop.
- **`tap-target` is a 48px min-box, not a hit-area extender** — applying it to a
  dense row genuinely changes layout density. Worth eyeballing the attendee
  roster on a deployed preview (no render verification in this pass).

## Follow-ups

- **`success*` button vocab** — would let the "mark paid" emerald affirmative
  join the vocab. Tracked as the persona-ux secondary-convergence gap; not worth
  inventing a one-off family here.
