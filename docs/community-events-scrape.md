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

17 keys. See `apps/web/src/lib/listing-draft.ts` for the authoritative shape.

| field                                                | notes                                                                                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `title`                                              | 3–200 chars. Required.                                                                                                           |
| `description`                                        | format/cost/divisions/venue + multi-day span. `''` if none.                                                                      |
| `externalUrl`                                        | real `https://` info/sign-up page (a shared series/landing page is fine).                                                        |
| `externalHostName`                                   | club/org/region name, or `null`.                                                                                                 |
| `startsAtLocal`                                      | `YYYY-MM-DDTHH:mm`. For all-day rows use `…T12:00`.                                                                              |
| `endsAtLocal`                                        | `null` for all-day (and usually otherwise — span goes in description).                                                           |
| `allDay`                                             | **`true`** for date-only events (the common case).                                                                               |
| `addressLine`/`city`/`region`/`postalCode`/`country` | city+region+`"United States"` is the usual minimum; rest null.                                                                   |
| `surface`                                            | `sand` \| `grass` \| `indoor` \| null. Beach tour = sand; grass tour = grass.                                                    |
| `format`                                             | `doubles`/`triples`/`quads`/`sixes` or null.                                                                                     |
| `skillLevel`                                         | `beginner`/`intermediate`/`advanced`/`competitive` or null.                                                                      |
| `eventType`                                          | `tournament` \| `league` \| `open_play` \| null. Reuses the **events** enum; powers the `/community` "Type" filter + card badge. |
| `gender`                                             | `mens` \| `womens` \| `coed` \| null. Reuses the **events** enum. null when mixed-division or unstated.                          |

Generate with a throwaway Python script (validate: every URL unique + `https://`,
`startsAtLocal` matches the pattern, enums valid, `allDay` boolean).

### Deriving `eventType` + `gender` (the classify() pass)

These two were added 2026-06-13 to align community listings with the events
model. The derivation is **post-hoc** (no extra API calls) and lives in
`/tmp/enrich_types.py` (standalone backfill of `community-events-public.json` +
chunks) and is mirrored into the final pass of `/tmp/build_volo.py`, so a fresh
`build_vbl.py && build_volo.py` reproduces it:

- **`eventType`** —
  - **Volo**: matched on the `program=<_id>` in the row's URL against
    `volo_raw.json`'s `program_type` (`LEAGUE`→league, `PICKUP`/`DROPIN`→open_play,
    `TOURNAMENT`→tournament, `CLINIC`→open_play, `EVENT`→null).
  - **Volleyball Life**: always `tournament` (the API pulled tournament summaries).
  - **Other** (CBVA + hand-scraped): a host map first
    (`cbva.com`→tournament, `chicagosocial.com`/`houstonssc.com`→league, …), then
    a title/description keyword heuristic (`league`→league;
    `pickup`/`drop-in`/`open play`→open_play; `tourney`/`classic`/`qualifier`/
    `doubles`/…→tournament); **null when genuinely ambiguous** (≈11 rows, e.g.
    Players "Friday Night 4s" — could be league or tournament).
- **`gender`** — keyword scan of title+description. `mens` / `womens` / `coed`;
  **null when BOTH men's and women's divisions appear** (mixed-division
  tournament isn't single-gender) or when unstated. Strip `women`/`woman` before
  testing for `men` so "women's" doesn't false-match `mens`.

Per the project's "prefer null over a guess" rule, leave both null rather than
forcing a class onto an ambiguous event.

## Source registry (what's fetchable, what isn't)

Updated 2026-06-12. **✅ = WebFetch works server-side; ⚠️ = JS SPA / login wall.**

| Source                  | Fetchable?             | What you get                                                                                                                                                                                                                                                                 | URL                              |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| AVP Pro schedule        | ✅                     | Pro **spectator** tour stops (date/city). Not participatory — keep out of import unless asked.                                                                                                                                                                               | `avp.com/the-2026-avp-schedule/` |
| AVP Grass schedule      | ✅                     | AVP Grass Tour (Pottstown, CT DIG, Susquehanna, Grass Nationals).                                                                                                                                                                                                            | `avp.com/avp-grass/schedule/`    |
| USA Volleyball events   | ✅                     | **Goldmine.** Beach Nationals + BNQ/BRQ qualifiers nationwide, each with a per-event URL.                                                                                                                                                                                    | `usavolleyball.org/events/`      |
| CBVA tournament list    | ✅ (list only)         | **Goldmine for CA.** Paginate `?page=N`; date/venue/divisions + canonical `cbva.com/tournaments/<id>`. Detail pages are SPA (no times).                                                                                                                                      | `cbva.com/tournaments`           |
| Named marquee sites     | ✅ usually             | Seaside (OR), Waupaca Boatride (WI), DDD (MN), The Luau (HI), Pottstown Rumble.                                                                                                                                                                                              | their own domains                |
| Eventbrite              | ✅ (individual events) | Search → fetch individual `/e/` pages for full date/time/venue. Collections are hit-or-miss.                                                                                                                                                                                 | `eventbrite.com`                 |
| **The Volleyball Life** | ✅ via API             | SPA in the browser, but its backend is a public JSON API (`api-v8.volleyballlife.com/tournament/summaries?filter=upcoming`) — the whole nationwide calendar (~2,485 events) with coords + divisions. **The biggest source.** See the dedicated section below for the recipe. | `api-v8.volleyballlife.com`      |
| **Volo Sports**         | ✅ via API             | SPA, but its **Hasura** API is public+unauthenticated — every upcoming public volleyball **league + pickup + tournament** across ~13 metros (~614), with real local times + venue addresses. **The leagues/pickup source.** Dedicated section below.                         | `volosports.com/hapi/v1/graphql` |
| GCVA (Gulf Coast)       | ⚠️ 403                 | Blocks WebFetch.                                                                                                                                                                                                                                                             | `gcva.net`                       |
| Facebook events         | ⚠️ scrape only         | Can't auto-fetch FB **pages** (login wall) — to extract event **data** the user runs the `facebook-events-import` scraper. But a FB **link is a fine `externalUrl`** when another public source gives it to you (e.g. a USAV event whose details live on a FB group).        | `facebook.com`                   |

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

## The Volleyball Life API — SOLVED + EXECUTED (the biggest source)

> **Status (2026-06-12):** done. Pulled the feed, filtered to **765** single-venue
> adult upcoming events, reverse-geocoded their coords offline (`reverse_geocoder`,
> `mode=1`), mapped to `ListingDraft`, and merged into `community-events-public.json`
> (now **869 across 41 states**, 765 with exact coords). The importer was extended
> to accept `latitude`/`longitude` so these use the precise venue pin and skip
> geocoding. 7 hand-scraped marquee/USAV rows were dropped as VBL dups (host-aware
> (date,city) match); CBVA/Chicago/Atlanta/Houston/SLC kept (not on VBL). Recipe below.

`volleyballlife.com` is the registration backend for a huge share of US outdoor
volleyball (AVP America 200+ affiliates, USA Volleyball Beach Tour, AVP Grass,
Seaside, Pottstown, DDD, the Luau, Waupaca, Pittsburgh Grass, Bravo Beach,
Chesapeake, BVNE, p1440, and hundreds of independent organizers). The site is a
client-rendered SPA (WebFetch gets an empty shell), but its backend is a **public,
unauthenticated JSON API** — found 2026-06-12:

```
GET https://api-v8.volleyballlife.com/tournament/summaries?filter=upcoming&includeDivisionMeta=true
```

Returns a **bare JSON array of ~2,485 upcoming tournaments** nationwide — no auth,
no API key (it sets a `device-id` cookie but doesn't require one). Fetch it
straight from a script (`curl`/`fetch`); it's ~4 MB.

**Per-tournament fields that matter:**

| field                   | use                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `id`                    | event URL → `https://volleyballlife.com/event/<id>` (unique per event)                              |
| `name`                  | title (sometimes embeds a time, e.g. "…Check in 5pm" — freeform, don't rely on it)                  |
| `startDate` / `endDate` | **date-only** (`YYYY-MM-DD`) — so these are **all-day** (anchor noon, `allDay:true`)                |
| `coordinates[0]`        | `"<lat> <lng>"` string — **present on 100% of events**; reverse-geocode it for city/state + map pin |
| `locations[0]`          | venue name (only ~11% include a `, City, ST`)                                                       |
| `organization.name`     | host → `externalHostName` (`organization.username` is the affiliate subdomain)                      |
| `tags`                  | surface: `"Beach"`→sand, `"Grass"`→grass, `"Indoor"`→indoor; also `"Adult"` vs junior age tags      |
| `divisionMeta[].format` | `"Twos"`→doubles, `"Threes"`→triples, `"Fours"`→quads, `"Sixes"`→sixes (null if mixed)              |
| `divisionNames`         | skill: Open→competitive, AA→advanced, A→intermediate, B/BB→beginner (null if mixed)                 |
| `isPublic`, `statusId`  | filter: `isPublic:true`, `statusId:0` is the normal published state                                 |

**Filter recipe → importable set.** The feed mixes single tournaments with
season "tour containers" (year-long date range + many `locations`). Keep only:
`endDate-startDate ≤ 3` days **and** `len(locations)==1` **and** `isPublic` **and**
`startDate ≥ today` **and** `"Adult" in tags`. As of 2026-06-12 that's **768
events** (sand 524 / grass 234 / indoor 9).

**Per-tournament enrichment (two more public endpoints, one call each).** The
summaries feed has no street address and only a terse division list, so for each
kept tournament also fetch (bounded concurrency ~8, cache to disk — re-runs free):

- `GET …/Locations/GetAddresses?tournamentId=<id>` → `["123 St, City, ST 00000, USA"]`.
  Parse it for `addressLine` + a **more accurate** city/state/zip (override the
  reverse-geocode; keep the summary's exact coords). ~88% of tournaments return a
  parseable address; the rest fall back to the reverse-geocoded city.
- `GET …/tournament/<id>` → `{ description (HTML), divisions, externalRegistrationUrl, … }`.
  Strip the HTML → a **real event description** (format, divisions, check-in time)
  far better than a generated blurb; cap ~800 chars. (`division.location` has the
  venue name + a maps-embed URL but **not** the clean street address — that's only
  in `GetAddresses`.) Date is still date-only ⇒ keep `allDay`.

**Two build tasks before this is import-ready:**

1. **Reverse-geocode `coordinates`** → city/state/country for the draft (only 11%
   carry a parseable state in the location string). Options: a Python offline
   reverse geocoder (`reverse_geocoder`), Nominatim reverse (1 req/s — ~13 min for
   768), or extend the importer/`ListingDraft` to accept lat/lng directly (cleanest
   — we have exact coords, so skip geocoding entirely).
2. **Dedup against what's already imported.** Many API events overlap the
   hand-scraped sources (AVP Grass, USAV, Pottstown, DDD, …) but under a _different_
   URL (`volleyballlife.com/event/<id>` vs `avp.com/…`), so the `(url,date)` key
   won't catch them. Dedup on a `(normalized-name, date, ~coords)` heuristic, and
   decide whether the API set **replaces** the hand-scraped one (it's more
   authoritative + has coords) or augments it.

**Volume is the real decision.** 768 is far more than the admin can review
one-by-one. Curate (e.g. next 60 days = ~549; or by region; or by `teamCount`/
popularity), or add a bulk-trust path. Don't dump all 768 through the row-by-row
reviewer.

**Etiquette:** it's a public calendar, but cache the 4 MB response and don't
hammer it; one pull per run is plenty.

**SSOVA (Florida) — already covered by this same API.** SSOVA's `ssova.com`
schedule is an image and it links a `ssova.bracketpal.com` signup, but its
_events_ are posted to Volleyball Life (org `"SSOVA"`), so the pull above already
captured them — **25 SSOVA adult events + ~63 Florida events** (Florida Beach
Volleyball Tour, p1440, GVT, First Coast, St Pete Ballers, BVNE, …) are in the
merged set. The `Adult`-tag filter correctly drops SSOVA's _Juniors_ dates. No
bracketpal scrape needed — when an org has both a bracketpal signup and a VBL
listing, VBL is the source of truth.

## The Volo API — leagues + pickup + drop-in (SOLVED + EXECUTED)

Volo Sports (`volosports.com`) runs social-sports **leagues, pickup, and
drop-in** in ~13 major metros (Denver, Boston, Baltimore, San Diego, DC, NYC, SF,
LA, San Jose, Morristown, Philly, Charleston, Miami). Its site is a SPA, but the
backend is a **public, unauthenticated Hasura GraphQL API**:

```
POST https://volosports.com/hapi/v1/graphql      (header: origin: https://www.volosports.com)
```

Because it's Hasura, you write your own query — no need to lift the app's exact
operation. The pull that worked (2026-06-12, **614 volleyball programs**):

```graphql
query V($w: leagues_bool_exp!) {
  leagues(where: $w, order_by: { start_date: asc }) {
    _id
    display_name
    name
    program_type
    start_date
    start_time_estimate
    end_time_estimate
    num_weeks_estimate
    sportBySport {
      name
    }
    organizationByOrganization {
      name
      timezone
      latitude
      longitude
      slug
    }
    venueByVenue {
      shorthand_name
      formatted_address
    }
    neighborhoodByNeighborhood {
      name
    }
  }
}
# variables.w = { sportBySport:{name:{_eq:"Volleyball"}}, status:{_eq:"registration_open"},
#                 private:{_eq:false}, archived:{_eq:false}, start_date:{_gte:"<today>"} }
```

Mapping → `ListingDraft` (see `/tmp/build_volo.py` shape):

- **`program_type`** ∈ LEAGUE (419) / PICKUP (158) / TOURNAMENT (29) / CLINIC / EVENT — keep all.
- **Real local times!** `start_time_estimate`/`end_time_estimate` are `"HH:mm"` in
  the org's tz → `allDay:false`. Get the local **date** by converting `start_date`
  (a UTC instant) into `organizationByOrganization.timezone` (Python `zoneinfo`).
- **Recurring = ONE listing.** A league/pickup is one program row; the date/time
  shown is the season start / next session, with recurrence noted in the
  description. Do **not** explode into one row per week.
- **Location:** parse `venueByVenue.formatted_address` ("St, City, ST ZIP, USA")
  → addressLine/city/region/postal, no coords (importer geocodes the precise
  venue). If it doesn't parse (~4%), fall back to `org.name` + `org.latitude/longitude`.
- **`externalUrl`:** Volo program pages aren't individually indexed, so link the
  city page **uniquely per program**: `https://www.volosports.com/{org.slug}/volleyball?program={_id}`
  (the `?program=` keeps the (URL,date) key unique so they don't collapse).
- **format** from the name (`6v6`→sixes, `4v4`→quads, `2v2`→doubles); **surface**
  from name/venue keywords (Beach→sand, …); **skill** only on explicit words
  (Recreational/Intermediate/Competitive) — **Volo "Open" means open-to-all, NOT
  a skill division**, so leave it null.
- **Dedup:** Volo doesn't overlap the other sources (own platform); the merge is
  a plain append, made idempotent by dropping any prior `volosports.com` rows
  from the base first.

Re-run with `/tmp/build_volo.py` (fetches the API, maps, merges into
`community-events-public.json`, re-chunks). Etiquette: one query per run.

## New avenues to try (next time)

- **Sport & Social / metro rec leagues in every big city** — the Chicago Players
  pattern repeats nationwide (e.g. Houston SSC, Austin Sports Center, DC/Boston/
  Denver/Atlanta social clubs). Each posts a dated season; high yield, server-rendered.
- **Regional grass/sand series** still unswept: Texas
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
- **The importer uses `latitude`/`longitude` from the draft when present and
  skips geocoding** (precise pin, no MapTiler call). See the coord rule below.

### ⚠️ Bake coordinates into the JSON — don't rely on import-time geocoding

The importer geocodes `addressLine/city/region` → coords via **MapTiler**
(`MAPTILER_API_KEY`). If that key is **unset in the import environment**, it
falls back to OSM Nominatim, which **blocks server/datacenter IPs** → _every_
address-based row imports with **no coordinates** ("Saved with the address as
text… won't show on the map"). This bit a full 1,400-row import (2026-06-12).

**Fix: every emitted row should carry `latitude`/`longitude`** so the importer
uses them directly and never touches the geocoder:

- **VBL** rows already include exact venue coords from the API.
- **Volo** rows: city-level coords (parse the venue city, look it up offline).
- **Hand-scraped / anything else**: backfill **offline** from the
  `reverse_geocoder` cities1000 table (pop≥1000, ~16k US cities) — build a
  forward `(city.lower(), full-state-name.lower()) → (lat,lon)` map from its
  bundled `rg_cities1000.csv`. Add aliases for the misses (NYC's entry is "New
  York City"; DC isn't a standard row; a few neighborhoods/small towns).
  `/tmp/build_volo.py` does this over the whole merged set — 100% coverage.

(Separately, it's worth setting `MAPTILER_API_KEY` in every env that runs the
importer or the manual `/community/new` form, so non-coord submissions geocode.)

## Scoping note

The **manual** community-listing create/edit form is intentionally still
time-based (no all-day checkbox) — all-day is a bulk-import concern, and an
individual submitter knows their event's time. If that ever needs parity, add an
all-day checkbox to `community-listing-fields.tsx` + thread `all_day` through
`parse-community-listing-form.ts` (the schema already defaults it false).
