<!--
Thanks for sending a PR! Fill in the sections below so reviewers know what
to look for. Delete sections that don't apply.
-->

## Summary

<!-- One or two sentences: what does this change and why? -->

## Changes

<!-- Bullet list of meaningful changes. -->

-

## Verification

Required before requesting review (see [AGENTS.md](../AGENTS.md)):

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] Manual smoke of the affected flow

If this PR touches the database:

- [ ] New migration in `supabase/migrations/` (never edit an applied one)
- [ ] `pnpm db:migrate` run locally
- [ ] `pnpm --filter @pickupvb/supabase gen:types` re-run; types committed

If this PR touches the domain or application packages:

- [ ] Errors use a typed `DomainError` subclass (no `throw new Error('CODE')`)
- [ ] Unit tests added or updated (when test scaffold exists)

If this PR is architecturally significant:

- [ ] New ADR under `docs/adr/` (or extends an existing one)

## Screenshots / recordings

<!-- For UI changes. -->

## Related issues / context

<!-- Closes #xxx, refs #yyy, links to audits or ADRs. -->
