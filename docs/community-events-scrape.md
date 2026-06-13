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

### Deeper sweep (2026-06-12, round 2) — regional organizers

Added ~38 events across IL/GA/TX/CO. **Fetchable ✅:** Players Sport & Social
(`playerssports.net/page/upcoming-volleyball-tournaments` — a whole Chicago
season of dated sand+grass tournaments, per-series shared URLs); Chicago Sport &
Social (`chicagosocial.com`); Angry Dragon (`angrydragonvolleyball.com/tournaments`
— Atlanta grass, unique per-event URLs); Spikefest (Dallas); MotherLode
(`motherlodevolleyball.com` — Aspen). **Didn't pan out ⚠️:** SSOVA schedule
(image, not text — register at `ssova.bracketpal.com`); `texasvolleyballtour.com`
(403); BVNE (routes to Volleyball Life SPA); New England Region `nevolleyball.org`
(indoor juniors only); PNW Summer Classic (high-school event); `thedigbvb.com`
(news, not a schedule); `coloradovolleyballtournaments.com` (self-signed cert).
NVL/AVP-pro/`volleyballworld` are spectator tours — keep out unless asked.

**Round 3** (+9 → TX-Houston, UT). **✅:** Houston Sports & Social
(`houstonssc.com/leagues?sport=Sand+Volleyball` — dated one-day tournaments,
unique `/league/<id>/details` URLs); SandBar SLC (`sandbarslc.com/tournaments/` +
`sandbarbluffdale.com/tournaments/` — Utah sand, shared per-venue URL across
dates). **Lesson:** most metro "Sport & Social / rec league" sites are
**weekly-league only** — only some (Chicago Players, Houston SSC) post one-day
_tournaments_; scan for a tournaments/one-day page before investing. **Didn't
pan out:** Austin Sports Center (2027 juniors), Minneapolis (leagues),
`sdbvl.com` (400), `nwvolleyball.com` (403), Volo (league-heavy, vague URLs),
SSOVA schedule (still image-only). **Skipped as cross-file dup:** Pittsburgh
Grass Open (already in the FB `community-listings.json`) — always check the FB
set before adding a marquee event from another source.

## The Volleyball Life API — biggest untapped source (future task)

`volleyballlife.com` is the registration backend for a huge share of US outdoor
volleyball, so unlocking it would dwarf every other source here in one pass.
**What runs on it (seen during this sweep):** AVP America (200+ affiliates,
45k+ members), the USA Volleyball Beach Tour (`usav.volleyballlife.com`), AVP
Grass, Seaside, Pottstown Rumble, DDD (MN), The Luau (HI), Waupaca, Pittsburgh
Grass, Bravo Beach/Bluegrass (KY), Chesapeake, BVNE (New England), and more.
Affiliates each get a subdomain; events live at predictable URLs:

- `https://<affiliate>.volleyballlife.com/tournaments/upcoming` — an affiliate's calendar
- `https://volleyballlife.com/event/<numeric-id>` — a single event
- Subdomains seen: `avp`, `usav`, `pottstown`, `seaside`, `ddd`, `bravobeach`,
  `chesapeake`, `pittsburghgrass`, `bvne`, `waupaca`.

**Why WebFetch can't read it:** the site is a client-rendered single-page app —
a server-side fetch gets an empty shell, so the calendar never appears (this is
why every `…volleyballlife.com` row in the registry is ⚠️). We can only capture
event URLs that _other_ (server-rendered) sources hand us.

**How a future task should crack it — in order of preference:**

1. **Find the JSON API (best).** Open an affiliate `…/tournaments/upcoming` page
   in a browser with DevTools → Network → Fetch/XHR and watch the calls the SPA
   makes. It almost certainly hits a REST/GraphQL backend (look for
   `api.volleyballlife.com` or similar) returning **structured JSON** — event
   name, **date _and start time_**, venue, divisions, fees. If any endpoint is
   unauthenticated, call it server-side (by affiliate or date range), page
   through it, and map the response straight to the `ListingDraft` contract. This
   is the dream: no HTML scraping, full coverage, and — crucially — **real start
   times**, so these events import as timed (`allDay: false`) instead of date-only.
2. **Logged-in Playwright pull (fallback).** If the API needs auth, mirror the
   `facebook-events-import` skill's pattern: a headful browser the _user_ runs (a
   real window won't surface from an agent process), navigate each affiliate
   calendar, and either intercept the API responses or read the rendered cards,
   dumping to JSON. Cache per (affiliate, date) like the FB scraper does.
3. **SSOVA (Florida) is a sibling case** but on a _different_ platform
   (`ssova.bracketpal.com`) — its schedule is an image on `ssova.com`, so the
   same "find-the-JSON or render-it" playbook applies to bracketpal.

**Build it as its own task**, not inside a normal scrape run — it needs the
network-inspect step (and maybe a login) up front. When it lands, add a
`volleyballlife` row to the registry marked ✅ and fold its events in via the
normal `(externalUrl, date)` upsert. Watch for **cross-file dups** against events
already captured from server-rendered sources (e.g. Pittsburgh Grass appears both
here and in the FB set).

## New avenues to try (next time)

- **Sport & Social / metro rec leagues in every big city** — the Chicago Players
  pattern repeats nationwide (e.g. Houston SSC, Austin Sports Center, DC/Boston/
  Denver/Atlanta social clubs). Each posts a dated season; high yield, server-rendered.
- **Regional grass/sand series** still unswept: SSOVA (FL, via bracketpal), Texas
  Volleyball Tour (403 — try a different fetch), EVP, p1440, NVL-amateur, Big
  Sky/Rocky Mountain, Utah, Pacific NW adult (vs. the junior qualifier).
- **More marquee**: Hyannis (MA), Volleyball City Clash (Holyoke MA), Fresh Coast
  (Milwaukee), AVP Contender stops (Denver Open, etc.).
- **Meetup / Eventbrite** pickup + beach-social operators (recurring drop-ins —
  decide whether recurring listings fit before importing).

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
