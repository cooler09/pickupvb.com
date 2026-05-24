# Hero Images Proposal (2026-05-24)

## Context

- User requested an evaluation / write-up for adding hero images to events, groups, and public profiles.
- The repo currently only has URL-based `avatar_url` fields for these surfaces; there is no existing upload flow to extend.
- The ask was to save the analysis into the audit docs so it can be revisited later without re-deriving the tradeoffs.

## Decisions

- Chose a new audit-style proposal note over folding the write-up into the monetization audit because this is a product/UX feature proposal, not a monetization finding.
- Chose to recommend hero images as a free platform-quality upgrade instead of a Pro-gated feature because the feature increases the polish of public surfaces and would look incomplete if hidden behind a paywall.
- Chose events-first rollout over simultaneous rollout for events, groups, and profiles because events are the highest-leverage surface and the upload infrastructure is brand new.
- Chose to frame the upload model around Supabase Storage + `next/image` because that matches the stack and keeps the proposal actionable.

## Changes

- Added [docs/audits/hero-images.md](../audits/hero-images.md) with the requested proposal, pros/cons, phased rollout, and open questions.
- Added a pointer in [docs/audits/README.md](../audits/README.md) so the proposal is discoverable from the audit index.

## Patterns observed

- `avatar_url` fields in this repo are currently plain URL inputs, so adding user-uploaded hero images is a new primitive rather than a small variation on existing image handling.
- Hero images introduce moderation and performance tradeoffs immediately, so they should be scoped as a phased release rather than a broad surface-area rollout.

## Follow-ups

- Validate moderation minimums before implementation: manual report/review may be enough for v1, but the policy needs to be explicit before shipping uploads.
- Decide whether upload-time cropping is required or whether display-time `object-cover` is sufficient for the first release.
- If the feature moves past proposal into implementation, the next step should start with events only and a dedicated upload component.
