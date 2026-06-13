# Community events scrape — recurring runbook

How to periodically refill the **Community** section (`/community`) with upcoming
volleyball events scraped from the public web, then bulk-import them via
`/admin/community-import`. This is a **recurring task** — re-run it every few
weeks and skim the "New avenues to try" list for fresh sources.

Related:

- [facebook-events-import skill](../.claude/skills/facebook-events-import/SKILL.md)
  — the Facebook / logged-in-scraper path and the listing-draft JSON contract.
- `apps/web/src/lib/listing-draft.ts` — the `ListingDraft` contract the importer accepts.
- `apps/web/src/app/admin/community-import/` — the importer UI + server action.

## TL;DR for the agent

1. Confirm scope with the user (geography, sources, time window). Default:
   **nationwide US, public sources, upcoming only.**
2. Sweep the **fetchable public sources** in the registry below (WebSearch +
   WebFetch). You can't auto-fetch Facebook **pages** (login wall) — but a
   Facebook **URL is a fine `externalUrl`** when a public source hands it to you
   (e.g. USA Volleyball lists an event whose details live on a FB group). To pull
   event **data out of FB**, the user runs the `facebook-events-import` scraper.
3. Emit two files at the repo root (untracked working artifacts):
   - `community-events-public.json` — import-ready `ListingDraft[]`.
   - `community-events.md` — human running tally (grouped + an appendix of
     found-but-excluded events).
4. Hand off: the user uploads the JSON at `https://pickupvb.com/admin/community-import`.

## Hard rules (learned the hard way)

- **Never invent a start time.** Most tournament sources publish a **date only**
  (real times live on JS/login-walled registration pages). Set
  **`allDay: true`** and anchor `startsAtLocal` to **noon** (`…T12:00`). The app
  renders the date alone and labels it "time TBD." Do **not** fall back to a
  9am/8am placeholder. (Community listings gained an `all_day` flag specifically
  for this — migration `20261013000000`.)
- **`externalUrl` is a real info page, but it doesn't have to be unique.** A
  dedicated registration URL is a nice-to-have, not a requirement — if an event
  doesn't have its own page, link the **series / landing page** that has its
  details (e.g. several AVP Grass stops share `avp.com/avp-grass/schedule/`; the
  AXV/Bluegrass/Chesapeake series each share one URL across dates). The importer
  keys on **`(externalUrl, startsAt)`** (`findByExternalUrl`), so shared URLs are
  fine as long as the **dates differ** — they won't collapse. Only avoid two rows
  with the **same URL and the same date** (that's a true duplicate). Don't drop
  an event just because it lacks its own sign-up link.
- **Don't fabricate locations.** City + state is enough (the server geocodes to a
  city-level point). Put the venue/beach name in the `description`, leave
  `addressLine`/`postalCode` null. If you don't even know the city, leave **all**
  location fields null (the importer requires city+country _together_).
- **`format` / `skillLevel` stay null when an event spans multiple** formats or
  divisions — don't collapse "Open/A/B" into one guess.
- **Upcoming only.** Today's date is the floor; drop past events.

## The `ListingDraft` contract (one object per event)

15 keys. See `apps/web/src/lib/listing-draft.ts` for the authoritative shape.

| field                                                | notes                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `title`                                              | 3–200 chars. Required.                                                        |
| `description`                                        | format/cost/divisions/venue + multi-day span. `''` if none.                   |
| `externalUrl`                                        | real `https://` info/sign-up page (a shared series/landing page is fine).     |
| `externalHostName`                                   | club/org/region name, or `null`.                                              |
| `startsAtLocal`                                      | `YYYY-MM-DDTHH:mm`. For all-day rows use `…T12:00`.                           |
| `endsAtLocal`                                        | `null` for all-day (and usually otherwise — span goes in description).        |
| `allDay`                                             | **`true`** for date-only events (the common case).                            |
| `addressLine`/`city`/`region`/`postalCode`/`country` | city+region+`"United States"` is the usual minimum; rest null.                |
| `surface`                                            | `sand` \| `grass` \| `indoor` \| null. Beach tour = sand; grass tour = grass. |
| `format`                                             | `doubles`/`triples`/`quads`/`sixes` or null.                                  |
| `skillLevel`                                         | `beginner`/`intermediate`/`advanced`/`competitive` or null.                   |

Generate with a throwaway Python script (validate: every URL unique + `https://`,
`startsAtLocal` matches the pattern, enums valid, `allDay` boolean).

## Source registry (what's fetchable, what isn't)

Updated 2026-06-12. **✅ = WebFetch works server-side; ⚠️ = JS SPA / login wall.**

| Source                  | Fetchable?             | What you get                                                                                                                                                                                                                                                          | URL                              |
| ----------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| AVP Pro schedule        | ✅                     | Pro **spectator** tour stops (date/city). Not participatory — keep out of import unless asked.                                                                                                                                                                        | `avp.com/the-2026-avp-schedule/` |
| AVP Grass schedule      | ✅                     | AVP Grass Tour (Pottstown, CT DIG, Susquehanna, Grass Nationals).                                                                                                                                                                                                     | `avp.com/avp-grass/schedule/`    |
| USA Volleyball events   | ✅                     | **Goldmine.** Beach Nationals + BNQ/BRQ qualifiers nationwide, each with a per-event URL.                                                                                                                                                                             | `usavolleyball.org/events/`      |
| CBVA tournament list    | ✅ (list only)         | **Goldmine for CA.** Paginate `?page=N`; date/venue/divisions + canonical `cbva.com/tournaments/<id>`. Detail pages are SPA (no times).                                                                                                                               | `cbva.com/tournaments`           |
| Named marquee sites     | ✅ usually             | Seaside (OR), Waupaca Boatride (WI), DDD (MN), The Luau (HI), Pottstown Rumble.                                                                                                                                                                                       | their own domains                |
| Eventbrite              | ✅ (individual events) | Search → fetch individual `/e/` pages for full date/time/venue. Collections are hit-or-miss.                                                                                                                                                                          | `eventbrite.com`                 |
| **The Volleyball Life** | ⚠️ SPA                 | The registration backend for AVP America, Seaside, Pottstown, DDD, Luau, most USAV beach events. Can only capture event URLs surfaced elsewhere, **not** browse its calendar. **Biggest untapped source** — an API/logged-in pull would multiply the count.           | `volleyballlife.com`             |
| GCVA (Gulf Coast)       | ⚠️ 403                 | Blocks WebFetch.                                                                                                                                                                                                                                                      | `gcva.net`                       |
| Facebook events         | ⚠️ scrape only         | Can't auto-fetch FB **pages** (login wall) — to extract event **data** the user runs the `facebook-events-import` scraper. But a FB **link is a fine `externalUrl`** when another public source gives it to you (e.g. a USAV event whose details live on a FB group). | `facebook.com`                   |

CBVA venue → city map (sand, CA): Manhattan Pier/Marine Ave/Rosecrans→Manhattan
Beach; Belmont Shore→Long Beach; Mission Beach/Ocean Beach→San Diego; Main
Beach→Santa Cruz; North Beach/Ocean Park→Santa Monica; Waterfront Park→Monterey;
Beach Blvd→Huntington Beach; East Beach→Santa Barbara; Hermosa Pier→Hermosa
Beach; Dockweiler→Los Angeles.

## New avenues to try (next time)

- **The Volleyball Life API** — by far the highest-leverage unlock. Inspect its
  network calls for a public JSON endpoint, or pull with a logged-in session
  (mirror the FB scraper pattern). Would cover most of the registry above in one
  pass.
- **Regional beach associations** not yet swept: EVP Tour (East Coast), p1440
  (juniors-heavy), NVL, BVNE (New England), Florida Region, Lone Star, Big
  Sky/Rocky Mountain. Many post a season schedule page.
- **More marquee grass tournaments**: Motherlode (Aspen), Hyannis (MA), Volleyball
  City Clash (Holyoke MA — 2026 dates weren't posted as of this writing).
- **Meetup** pickup/rec groups (recurring drop-ins) — different shape (weekly
  recurring) than tournaments; decide whether recurring listings fit before
  importing.
- **Eventbrite** organizer pages for the big beach-social operators.

## Import — what the importer does now

- **Idempotent on `(externalUrl, startsAt)`** — re-uploading after edits updates
  in place, never duplicates; a shared series URL across different dates stays as
  separate listings. A claimed/removed/pending listing is skipped, not overwritten.
- **Chunked + progress** — the client uploads in small batches with a progress
  bar; geocoding fans out with bounded concurrency, and the route's `maxDuration`
  is raised. A large file (60+ rows) won't time out, and a mid-run failure leaves
  already-saved rows intact (idempotent retry).
- **All-day review** — each draft card has an "All day / time TBD" checkbox; the
  scrape sets it true for date-only events.
- **Geocode is non-fatal** — a row whose address won't resolve still imports
  (address kept as text, absent from map/distance search until coords are added).

## Scoping note

The **manual** community-listing create/edit form is intentionally still
time-based (no all-day checkbox) — all-day is a bulk-import concern, and an
individual submitter knows their event's time. If that ever needs parity, add an
all-day checkbox to `community-listing-fields.tsx` + thread `all_day` through
`parse-community-listing-form.ts` (the schema already defaults it false).
