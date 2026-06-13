# Community events — public-source scrape (running tally)

> **Scraped:** 2026-06-12 · **Scope:** nationwide US, upcoming events only · **Sources:** public/no-login only (AVP.com schedules, USA Volleyball events, CBVA, and individual tournament sites). Facebook was intentionally skipped.

## How to use this file

- **67 import-ready events** live in [`community-events-public.json`](community-events-public.json) (the community-listing draft contract). Upload that file at `https://pickupvb.com/admin/community-import` (platform-admin only). The importer geocodes each address, resolves the timezone, and lets you review/fix every row before saving — now with a progress bar and chunked uploads so a large file won't time out. It's **idempotent on `externalUrl`**, so re-uploading after edits won't create duplicates.

- This is **separate** from the existing [`community-listings.json`](community-listings.json) (49 Facebook-sourced PA/OH/KY listings, mostly past). These are kept apart on purpose so importing one doesn't touch the other.

### ⚠️ Data caveats (review before import)

- **Every row is all-day (`allDay: true`) — no invented start times.** These sources publish a date, not a clock time (real start times live on the JS/login-walled registration pages). Rather than guess, each listing carries the accurate calendar date with the time deliberately omitted; the site renders just the date and labels it "time TBD." If you later learn an event's real start time, uncheck "All day" on that row during review and set it.

- **Multi-day events** show only the first day; the full date span is in each listing's `description`. `endsAtLocal` is left null.

- **Locations are city-level** (venue/beach name is in the description, not a street address) — the geocoder will place an approximate point; refine if you want exact pins.

- **`format`/`skillLevel` are conservative** — left blank when an event spans multiple formats or divisions rather than guessing a single value.

## 1. Marquee national grass & sand tournaments (6)

| Event                                      | Date       | Location        | Surface | Format  | Skill | Link                                                                            |
| ------------------------------------------ | ---------- | --------------- | ------- | ------- | ----- | ------------------------------------------------------------------------------- |
| Pottstown Rumble (AVP Grass Tour)          | 2026-06-26 | Pottstown, PA   | grass   | doubles | —     | [link](https://www.pottstownrumble.com/registration)                            |
| AVP America Grass Nationals                | 2026-10-23 | Gainesville, FL | grass   | —       | —     | [link](https://avp.com/avp-america/special-events/avp-america-grass-nationals/) |
| Waupaca Boatride Volleyball Tournament     | 2026-07-09 | Oshkosh, WI     | grass   | —       | —     | [link](https://waupacaboatride.com/)                                            |
| DDD Triples #3 (USA Volleyball Grass Tour) | 2026-06-27 | —               | grass   | triples | —     | [link](https://ddd.volleyballlife.com/event/34821)                              |
| The Luau Grass Volleyball Tournament       | 2026-07-19 | Kailua, HI      | grass   | quads   | —     | [link](https://volleyballlife.com/event/38801)                                  |
| Seaside Beach Volleyball Tournament        | 2026-08-05 | Seaside, OR     | sand    | —       | —     | [link](https://seasidebeachvolleyball.com/)                                     |

## 2. USA Volleyball Beach Tour — Nationals & Qualifiers (16)

_Sanctioned USAV beach (sand) events nationwide — National Championship plus Beach National Qualifiers (BNQ) and Beach Regional Qualifiers (BRQ)._

| Event                                               | Date       | Location              | Surface | Format | Skill | Link                                                                                                         |
| --------------------------------------------------- | ---------- | --------------------- | ------- | ------ | ----- | ------------------------------------------------------------------------------------------------------------ |
| USA Volleyball Beach National Championship          | 2026-07-13 | Virginia Beach, VA    | sand    | —      | —     | [link](https://usavolleyball.org/event/2026-usa-volleyball-beach-national-championship/)                     |
| The Island BNQ Denver (Rocky Mountain BNQ)          | 2026-06-13 | Denver, CO            | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/37009)                                                          |
| 501 Volley Beach National Qualifier (Delta Region)  | 2026-06-13 | North Little Rock, AR | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/37106)                                                          |
| Red, White & Sand Rumble BNQ (Heart of America)     | 2026-06-13 | Shawnee, KS           | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/33742)                                                          |
| Midwest Open BNQ (Iowa Region)                      | 2026-06-13 | Des Moines, IA        | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/37272)                                                          |
| Absolute Beach BNQ (Lone Star Region)               | 2026-06-14 | Webster, TX           | sand    | —      | —     | [link](https://usavolleyball.org/event/2026-usa-volleyball-beach-tour-absolute-beach-lone-star-region-bnq/)  |
| SSOVA Beach National Qualifier                      | 2026-06-28 | Treasure Island, FL   | sand    | —      | —     | [link](https://www.ssova.com)                                                                                |
| Chesapeake Region Summer Beach National Qualifier   | 2026-08-01 | Clear Brook, VA       | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/33325)                                                          |
| AXV Beach #3 Regional Qualifier                     | 2026-06-13 | Amarillo, TX          | sand    | —      | —     | [link](https://www.amarilloxtremevolleyball.com/beach.html)                                                  |
| Bluegrass Beach Bash #2 (Pioneer Region BRQ)        | 2026-06-13 | Bowling Green, KY     | sand    | —      | —     | [link](https://bravobeach.volleyballlife.com/)                                                               |
| Boyd Lee Sand Series 1 (Carolina BRQ)               | 2026-06-13 | Greenville, NC        | sand    | —      | —     | [link](https://volleyballlife.com/event/37148)                                                               |
| Boyd Lee Sand Series 2 (Carolina BRQ)               | 2026-07-11 | Greenville, NC        | sand    | —      | —     | [link](https://volleyballlife.com/event/37149)                                                               |
| June First Wave Chesapeake Beach Regional Qualifier | 2026-06-16 | Dewey Beach, DE       | sand    | —      | —     | [link](https://chesapeake.volleyballlife.com)                                                                |
| Carolina Beach Boogie Regional Qualifier            | 2026-06-20 | Indian Trail, NC      | sand    | —      | —     | [link](https://www.riseevents.us/rise-events/outdoor/)                                                       |
| Gateway Beach Regional Championship                 | 2026-06-20 | Chesterfield, MO      | sand    | —      | —     | [link](https://www.gatewayvb.org/page/show/4709009-gateway-beach-regional-championships-regional-qualifier-) |
| WEVA Beach Regional Qualifier                       | 2026-06-21 | Rochester, NY         | sand    | —      | —     | [link](https://www.novaeventmanagement.com/events/)                                                          |

## 3. CBVA — California adult beach tournaments (45)

_California Beach Volleyball Association sand tournaments (adult divisions: Open/AA/A/B/Unrated, Men's/Women's/Coed). Canonical per-event URLs at cbva.com. Junior-only (12U–18U) and invitation-only events were excluded._

| Event                                                         | Date       | Location             | Surface | Format  | Skill       | Link                                      |
| ------------------------------------------------------------- | ---------- | -------------------- | ------- | ------- | ----------- | ----------------------------------------- |
| CBVA Beach Doubles — Manhattan Pier, Manhattan Beach (Jun 13) | 2026-06-13 | Manhattan Beach, CA  | sand    | doubles | —           | [link](https://cbva.com/tournaments/4642) |
| CBVA Beach Doubles — Mission Beach, San Diego (Jun 13)        | 2026-06-13 | San Diego, CA        | sand    | doubles | competitive | [link](https://cbva.com/tournaments/4643) |
| CBVA Beach Doubles — Main Beach, Santa Cruz (Jun 13)          | 2026-06-13 | Santa Cruz, CA       | sand    | doubles | —           | [link](https://cbva.com/tournaments/4644) |
| CBVA Beach Doubles — Belmont Shore, Long Beach (Jun 14)       | 2026-06-14 | Long Beach, CA       | sand    | doubles | —           | [link](https://cbva.com/tournaments/4890) |
| CBVA Beach Doubles — North Beach, Santa Monica (Jun 14)       | 2026-06-14 | Santa Monica, CA     | sand    | doubles | competitive | [link](https://cbva.com/tournaments/4784) |
| CBVA Beach Doubles — Belmont Shore, Long Beach (Jul 4)        | 2026-07-04 | Long Beach, CA       | sand    | doubles | —           | [link](https://cbva.com/tournaments/4661) |
| CBVA Beach Doubles — Belmont Shore, Long Beach (Jul 5)        | 2026-07-05 | Long Beach, CA       | sand    | doubles | —           | [link](https://cbva.com/tournaments/4663) |
| CBVA Beach Doubles — Manhattan Pier, Manhattan Beach (Jul 11) | 2026-07-11 | Manhattan Beach, CA  | sand    | doubles | —           | [link](https://cbva.com/tournaments/4775) |
| CBVA Beach Doubles — Ocean Beach, San Diego (Jul 11)          | 2026-07-11 | San Diego, CA        | sand    | doubles | —           | [link](https://cbva.com/tournaments/4668) |
| CBVA Beach Doubles — Main Beach, Santa Cruz (Jul 11)          | 2026-07-11 | Santa Cruz, CA       | sand    | doubles | —           | [link](https://cbva.com/tournaments/4671) |
| CBVA Beach Doubles — Beach Blvd, Huntington Beach (Jul 12)    | 2026-07-12 | Huntington Beach, CA | sand    | doubles | —           | [link](https://cbva.com/tournaments/4673) |
| CBVA Beach Doubles — East Beach, Santa Barbara (Jul 12)       | 2026-07-12 | Santa Barbara, CA    | sand    | doubles | competitive | [link](https://cbva.com/tournaments/4662) |
| CBVA Beach Doubles — Waterfront Park, Monterey (Jul 18)       | 2026-07-18 | Monterey, CA         | sand    | doubles | —           | [link](https://cbva.com/tournaments/4791) |
| CBVA Beach Doubles — Ocean Park, Santa Monica (Jul 18)        | 2026-07-18 | Santa Monica, CA     | sand    | doubles | —           | [link](https://cbva.com/tournaments/4680) |
| CBVA Beach Doubles — Ocean Park, Santa Monica (Jul 19)        | 2026-07-19 | Santa Monica, CA     | sand    | doubles | —           | [link](https://cbva.com/tournaments/4681) |
| CBVA Beach Doubles — Manhattan Pier, Manhattan Beach (Jul 25) | 2026-07-25 | Manhattan Beach, CA  | sand    | doubles | competitive | [link](https://cbva.com/tournaments/4691) |
| CBVA Beach Doubles — Ocean Beach, San Diego (Jul 25)          | 2026-07-25 | San Diego, CA        | sand    | doubles | —           | [link](https://cbva.com/tournaments/4689) |
| CBVA Beach Doubles — Main Beach, Santa Cruz (Jul 25)          | 2026-07-25 | Santa Cruz, CA       | sand    | doubles | —           | [link](https://cbva.com/tournaments/4688) |
| CBVA Beach Doubles — Manhattan Pier, Manhattan Beach (Jul 26) | 2026-07-26 | Manhattan Beach, CA  | sand    | doubles | —           | [link](https://cbva.com/tournaments/4693) |
| CBVA Beach Doubles — Waterfront Park, Monterey (Aug 1)        | 2026-08-01 | Monterey, CA         | sand    | doubles | —           | [link](https://cbva.com/tournaments/4792) |
| Michelob Ultra Premier (CBVA Open) — Hermosa Beach            | 2026-08-02 | Hermosa Beach, CA    | sand    | doubles | —           | [link](https://cbva.com/tournaments/4698) |
| CBVA Beach Doubles — Rosecrans, Manhattan Beach (Aug 2)       | 2026-08-02 | Manhattan Beach, CA  | sand    | doubles | —           | [link](https://cbva.com/tournaments/4697) |
| CBVA Beach Doubles — Ocean Beach, San Diego (Aug 8)           | 2026-08-08 | San Diego, CA        | sand    | doubles | —           | [link](https://cbva.com/tournaments/4704) |
| CBVA Beach Doubles — Main Beach, Santa Cruz (Aug 8)           | 2026-08-08 | Santa Cruz, CA       | sand    | doubles | —           | [link](https://cbva.com/tournaments/4705) |
| CBVA Beach Doubles — Ocean Park, Santa Monica (Aug 8)         | 2026-08-08 | Santa Monica, CA     | sand    | doubles | —           | [link](https://cbva.com/tournaments/4703) |
| CBVA Beach Coed 4s — Marine Ave, Manhattan Beach (Aug 9)      | 2026-08-09 | Manhattan Beach, CA  | sand    | quads   | —           | [link](https://cbva.com/tournaments/4708) |
| CBVA Beach Doubles — Ocean Park, Santa Monica (Aug 9)         | 2026-08-09 | Santa Monica, CA     | sand    | doubles | —           | [link](https://cbva.com/tournaments/4707) |
| CBVA Beach Doubles — Ocean Park, Santa Monica (Aug 15)        | 2026-08-15 | Santa Monica, CA     | sand    | doubles | —           | [link](https://cbva.com/tournaments/4729) |
| CBVA Beach Doubles — Ocean Park, Santa Monica (Aug 16)        | 2026-08-16 | Santa Monica, CA     | sand    | doubles | competitive | [link](https://cbva.com/tournaments/4730) |
| CBVA Beach Doubles — Manhattan Pier, Manhattan Beach (Aug 22) | 2026-08-22 | Manhattan Beach, CA  | sand    | doubles | —           | [link](https://cbva.com/tournaments/4711) |
| CBVA Beach Doubles — Ocean Beach, San Diego (Aug 22)          | 2026-08-22 | San Diego, CA        | sand    | doubles | competitive | [link](https://cbva.com/tournaments/4712) |
| CBVA Beach Doubles — Main Beach, Santa Cruz (Aug 22)          | 2026-08-22 | Santa Cruz, CA       | sand    | doubles | —           | [link](https://cbva.com/tournaments/4713) |
| CBVA Beach Doubles — Manhattan Pier, Manhattan Beach (Aug 23) | 2026-08-23 | Manhattan Beach, CA  | sand    | doubles | —           | [link](https://cbva.com/tournaments/4715) |
| CBVA Beach Doubles — Waterfront Park, Monterey (Aug 29)       | 2026-08-29 | Monterey, CA         | sand    | doubles | —           | [link](https://cbva.com/tournaments/4719) |
| CBVA Beach Doubles — Hermosa Pier, Hermosa Beach (Sep 5)      | 2026-09-05 | Hermosa Beach, CA    | sand    | doubles | —           | [link](https://cbva.com/tournaments/4718) |
| CBVA Beach Doubles — Hermosa Pier, Hermosa Beach (Sep 6)      | 2026-09-06 | Hermosa Beach, CA    | sand    | doubles | —           | [link](https://cbva.com/tournaments/4721) |
| CBVA Beach Doubles — Manhattan Pier, Manhattan Beach (Sep 6)  | 2026-09-06 | Manhattan Beach, CA  | sand    | doubles | —           | [link](https://cbva.com/tournaments/4722) |
| CBVA Beach Doubles — Main Beach, Santa Cruz (Sep 12)          | 2026-09-12 | Santa Cruz, CA       | sand    | doubles | —           | [link](https://cbva.com/tournaments/4724) |
| CBVA Beach Doubles — Ocean Park, Santa Monica (Sep 12)        | 2026-09-12 | Santa Monica, CA     | sand    | doubles | —           | [link](https://cbva.com/tournaments/4794) |
| CBVA Beach Doubles — Ocean Park, Santa Monica (Sep 13)        | 2026-09-13 | Santa Monica, CA     | sand    | doubles | —           | [link](https://cbva.com/tournaments/4795) |
| CBVA Beach Doubles — Marine Ave, Manhattan Beach (Sep 19)     | 2026-09-19 | Manhattan Beach, CA  | sand    | doubles | —           | [link](https://cbva.com/tournaments/4736) |
| CBVA Beach Doubles — Waterfront Park, Monterey (Sep 19)       | 2026-09-19 | Monterey, CA         | sand    | doubles | competitive | [link](https://cbva.com/tournaments/4728) |
| CBVA Beach Doubles — Marine Ave, Manhattan Beach (Sep 20)     | 2026-09-20 | Manhattan Beach, CA  | sand    | doubles | —           | [link](https://cbva.com/tournaments/4739) |
| CBVA Beach Doubles — Belmont Shore, Long Beach (Sep 26)       | 2026-09-26 | Long Beach, CA       | sand    | doubles | —           | [link](https://cbva.com/tournaments/4740) |
| CBVA Beach Doubles — Dockweiler, Los Angeles (Sep 26)         | 2026-09-26 | Los Angeles, CA      | sand    | doubles | competitive | [link](https://cbva.com/tournaments/4742) |

## Appendix — found but NOT in the import JSON

These came up in the sweep but were left out of `community-events-public.json` for the reason noted. Pull any into the JSON if you can supply the missing piece.

| Event                                                                                                                             | Date          | Location           | Why excluded                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| The CT DIG (AVP Grass Tour)                                                                                                       | 2026-07-25–26 | South Windsor, CT  | No unique public registration URL found (only the shared AVP Grass schedule page)                       |
| Susquehanna Smash (AVP Grass Tour)                                                                                                | 2026-08-01–02 | Manheim, PA        | No unique public registration URL found                                                                 |
| AXV Beach #4 Regional Qualifier                                                                                                   | 2026-06-27    | Amarillo, TX       | Shares one URL (beach.html) with AXV #3 — included #3 only (importer dedups on URL)                     |
| Bluegrass Beach Bash #3                                                                                                           | 2026-07-11–12 | Bowling Green, KY  | Shares the bravobeach domain URL with Bash #2 — included #2 only                                        |
| June Second Wave Chesapeake BRQ                                                                                                   | 2026-06-23–25 | Dewey Beach, DE    | Shares the chesapeake.volleyballlife.com URL with First Wave — included First Wave only                 |
| Market City Tournament 4 (Carolina)                                                                                               | 2026-07-18    | Asheboro, NC       | Only a Facebook group URL — FB skipped per request                                                      |
| Charlotte Open BNQ (Carolina)                                                                                                     | 2026-06-13–14 | Charlotte, NC (?)  | USAV listing had a conflicting location (showed 'Denver, CO') — excluded to avoid a bad pin             |
| BVCA National Championships                                                                                                       | 2026-07-07–11 | Hermosa Beach, CA  | Junior club (Beach Volleyball Clubs of America) championship — not adult pickup                         |
| USAV Junior Beach National Championships                                                                                          | 2026-07-13–18 | Virginia Beach, VA | Junior event                                                                                            |
| AVP Pro Tour stops (Miami, Las Vegas, Long Beach, Central Park, East Hampton, Dallas, Manhattan Beach Open, Chicago championship) | Jun–Sep 2026  | Nationwide         | Spectator/ticketed pro events, not participatory — say the word and I'll add them as a separate section |

### Other promising sources I couldn't enumerate (JS-rendered / login-walled)

- **The Volleyball Life** (`volleyballlife.com`) — the registration backend for AVP America, Seaside, Pottstown, DDD, the Luau and most USAV beach events. It's a single-page app, so I could only capture individual event URLs surfaced elsewhere, not browse its full nationwide calendar. A logged-in/API pull would unlock a lot more.

- **CBVA detail pages** render client-side, so adult start times/fees aren't fetchable — only the list view (date/venue/divisions/URL) is.

- **Facebook events** (the richest pickup/grass source) — skipped per request; the `facebook-events-import` skill's logged-in scraper is the way to fold those in.
