# 0005. Page composition: `_components/` + co-located actions

- **Status:** Accepted
- **Date:** 2026-05-14

## Context

A handful of App Router pages had grown to 200–460 LOC, mixing data
fetching, snake_case→camelCase shaping, multiple `<form>` server actions,
and large inline JSX trees. Symptoms:

- Hard for AI assistants and humans to find "where does the join button
  live?" — it was 200 lines into a god-page.
- Re-using a section (e.g. an event card) on a new page meant
  copy-pasting because nothing was a real component.
- Server actions defined inline at the bottom of the page were invisible
  from outside the file and couldn't be reused.

## Decision

Adopt a four-rule composition pattern for any route under `apps/web/src/app/`:

1. **Co-locate sub-components under `_components/`.** Underscore prefix
   prevents Next.js from treating the folder as a route segment.
2. **Co-locate server actions next to (not inside) the page.** A file like
   `co-host-actions.ts` or `members-actions.ts` lives beside `page.tsx` and
   uses `'use server'` at the top.
3. **Map snake_case DB rows → camelCase props at the page boundary.**
   Components take camelCase. The page does the explicit mapping. DB shape
   never reaches a reusable component.
4. **Pure helpers** (`memberName`, `initials`, `bannerFor`, …) live in the
   file of their primary consumer. No shared util file for one-time use.

Pages should be thin orchestrators (target < ~200 LOC, ideally < 150).

## Consequences

- ✅ The 6-page refactor that introduced this pattern reduced 1,730 LOC of
  pages to 1,015 LOC (-41%) while making each section independently
  reusable and reviewable.
- ✅ "Where does X render?" answers itself from the folder structure.
- ✅ Server actions can be unit-tested by importing them directly.
- ❌ More files per route — accept the tradeoff for navigability.
- ❌ The snake→camel mapping is repeated boilerplate. We've intentionally
  *not* generalized it; explicit mapping at the boundary is easier to read
  and refactor than a generic case-conversion helper.

## Alternatives considered

- **Keep god-pages, accept the size.** Lost too much velocity on changes;
  AI-assisted edits in particular suffered.
- **Per-route folder of route.tsx + view.tsx + actions.ts at every level.**
  Too much ceremony for small pages. The current rule kicks in at ~200 LOC
  rather than always.
- **Push DB shape through to components (snake_case props).** Couples
  components to the schema. Schema migrations become UI migrations.
