# Community events — public-source scrape (running tally)

> **Scraped:** 2026-06-12 · **Scope:** nationwide US, upcoming only · **869 import-ready events across 41 states.** Sources: the **Volleyball Life API** (the bulk — see §1) plus curated hand-scraped organizers (AVP, USA Volleyball, CBVA, Chicago/Atlanta/Dallas/Houston/SLC series). Facebook **pages can't be scraped** (login wall), but a FB URL is fine as a link when a public source surfaces it.

## How to use this file

- **869 events** live in [`community-events-public.json`](community-events-public.json). Upload at `https://pickupvb.com/admin/community-import` (platform-admin only). The importer reviews each row, resolves timezone, and is **idempotent on `(externalUrl, date)`** so re-uploads don't duplicate.

- **That's a lot for the row-by-row review UI.** Pre-split copies (≤150 each) are in [`community-events-import/`](community-events-import/) — upload `part-01.json` … `part-06.json` one at a time if the full file is sluggish.

- Separate from [`community-listings.json`](community-listings.json) (49 Facebook listings, mostly past) — kept apart so importing one doesn't touch the other.

### ⚠️ Data caveats (review before import)

- **Every row is all-day (`allDay: true`) — no invented start times.** Sources publish a date, not a clock time, so each listing carries the accurate date and the site renders it as "time TBD." Uncheck "All day" on a row during review if you learn the real time.

- **VBL events carry EXACT venue coordinates** (lat/lng straight from the API → precise map pins, no geocoding). The hand-scraped rows are **city-level** (geocoded from the city). Both are fine; VBL pins are just sharper.

- **`format`/`skillLevel` are conservative** — blank when an event spans multiple formats/divisions rather than guessing.

- **Shared series/landing-page links** (e.g. CT DIG + Susquehanna on the AVP Grass page; weekly Chicago series) are intentional — the importer keys on **(URL + date)** so they don't collapse.

## 1. Volleyball Life — national API feed (765)

_Pulled from the public Volleyball Life API (`api-v8.volleyballlife.com/tournament/summaries?filter=upcoming`) — single-venue, adult, upcoming tournaments. Each has exact coords + host + divisions, and links to `volleyballlife.com/event/<id>`. Too many to table here — the full rows are in the JSON; summary below._

- **Surfaces:** sand 523, grass 232, indoor 9, None 1

- **Top states:** TX 74, CA 64, CO 63, FL 62, NJ 45, NC 36, CT 34, NY 31, UT 28, TN 28, GA 26, MA 26, MO 25, WA 22, PA 19

- **By month:** 2026-06 254, 2026-07 219, 2026-08 151, 2026-09 80, 2026-10 43, 2026-11 10, 2026-12 6, 2027-02 1, 2027-09 1

## 2. Marquee national grass & sand tournaments (2)

_Hand-scraped events **not** on Volleyball Life (or recovered before the API pull)._

| Event                              | Date       | Location        | Surface | Format | Skill | Link                                                                            |
| ---------------------------------- | ---------- | --------------- | ------- | ------ | ----- | ------------------------------------------------------------------------------- |
| AVP America Grass Nationals        | 2026-10-23 | Gainesville, FL | grass   | —      | —     | [link](https://avp.com/avp-america/special-events/avp-america-grass-nationals/) |
| Susquehanna Smash (AVP Grass Tour) | 2026-08-01 | Manheim, PA     | grass   | —      | —     | [link](https://avp.com/avp-grass/schedule/)                                     |

## 3. USA Volleyball Beach Tour — qualifiers not on VBL (10)

_USAV BNQ/BRQ events whose registration lives on a regional site rather than VBL (Amarillo, RISE, WEVA, Bravo, Chesapeake, …)._

| Event                                                | Date       | Location           | Surface | Format | Skill | Link                                                                                     |
| ---------------------------------------------------- | ---------- | ------------------ | ------- | ------ | ----- | ---------------------------------------------------------------------------------------- |
| USA Volleyball Beach National Championship           | 2026-07-13 | Virginia Beach, VA | sand    | —      | —     | [link](https://usavolleyball.org/event/2026-usa-volleyball-beach-national-championship/) |
| AXV Beach #3 Regional Qualifier                      | 2026-06-13 | Amarillo, TX       | sand    | —      | —     | [link](https://www.amarilloxtremevolleyball.com/beach.html)                              |
| AXV Beach #4 Regional Qualifier                      | 2026-06-27 | Amarillo, TX       | sand    | —      | —     | [link](https://www.amarilloxtremevolleyball.com/beach.html)                              |
| Market City Tournament 4 (Carolina Region)           | 2026-07-18 | Asheboro, NC       | sand    | —      | —     | [link](https://www.facebook.com/groups/477816120593645)                                  |
| Bluegrass Beach Bash #2 (Pioneer Region BRQ)         | 2026-06-13 | Bowling Green, KY  | sand    | —      | —     | [link](https://bravobeach.volleyballlife.com/)                                           |
| Bluegrass Beach Bash #3 (Pioneer Region BRQ)         | 2026-07-11 | Bowling Green, KY  | sand    | —      | —     | [link](https://bravobeach.volleyballlife.com/)                                           |
| June First Wave Chesapeake Beach Regional Qualifier  | 2026-06-16 | Dewey Beach, DE    | sand    | —      | —     | [link](https://chesapeake.volleyballlife.com)                                            |
| June Second Wave Chesapeake Beach Regional Qualifier | 2026-06-23 | Dewey Beach, DE    | sand    | —      | —     | [link](https://chesapeake.volleyballlife.com)                                            |
| Carolina Beach Boogie Regional Qualifier             | 2026-06-20 | Indian Trail, NC   | sand    | —      | —     | [link](https://www.riseevents.us/rise-events/outdoor/)                                   |
| WEVA Beach Regional Qualifier                        | 2026-06-21 | Rochester, NY      | sand    | —      | —     | [link](https://www.novaeventmanagement.com/events/)                                      |

## 4. CBVA — California adult beach tournaments (45)

_California Beach Volleyball Association sand tournaments; canonical per-event URLs at cbva.com. Not on Volleyball Life._

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

## 5. Regional series & metro tournaments (47)

_Adult outdoor series from organizers not on VBL — **Chicago** (Players Sport & Social; Chicago Sport & Social), **Atlanta** (Angry Dragon), **Dallas** (Spikefest), **Aspen** (MotherLode), **Houston** (Sports & Social), **Salt Lake City** (SandBar)._

| Event                                                          | Date       | Location            | Surface | Format  | Skill | Link                                                                               |
| -------------------------------------------------------------- | ---------- | ------------------- | ------- | ------- | ----- | ---------------------------------------------------------------------------------- |
| Players Beach Series — Montrose Beach, Chicago (Jun 27)        | 2026-06-27 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/players-beach-series)                    |
| Players Beach Series — North Avenue Beach, Chicago (Jul 3)     | 2026-07-03 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/players-beach-series)                    |
| Players Beach Series — North Avenue Beach, Chicago (Jul 12)    | 2026-07-12 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/players-beach-series)                    |
| Players Beach Series — North Avenue Beach, Chicago (Aug 2)     | 2026-08-02 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/players-beach-series)                    |
| Players Beach Series — Montrose Beach, Chicago (Aug 15)        | 2026-08-15 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/players-beach-series)                    |
| Players Beach Series — Montrose Beach, Chicago (Aug 29)        | 2026-08-29 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/players-beach-series)                    |
| Players Beach Series — North Avenue Beach, Chicago (Sep 7)     | 2026-09-07 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/players-beach-series)                    |
| Players Beach Series — North Avenue Beach, Chicago (Sep 19)    | 2026-09-19 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/players-beach-series)                    |
| Players Beach Series — North Avenue Beach, Chicago (Oct 3)     | 2026-10-03 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/players-beach-series)                    |
| Players Friday Night 4s — North Avenue Beach, Chicago (Jun 19) | 2026-06-19 | Chicago, IL         | sand    | quads   | —     | [link](https://www.playerssports.net/page/friday-night-4s)                         |
| Players Friday Night 4s — North Avenue Beach, Chicago (Jul 10) | 2026-07-10 | Chicago, IL         | sand    | quads   | —     | [link](https://www.playerssports.net/page/friday-night-4s)                         |
| Players Friday Night 4s — North Avenue Beach, Chicago (Jul 31) | 2026-07-31 | Chicago, IL         | sand    | quads   | —     | [link](https://www.playerssports.net/page/friday-night-4s)                         |
| Players Friday Night 4s — North Avenue Beach, Chicago (Aug 7)  | 2026-08-07 | Chicago, IL         | sand    | quads   | —     | [link](https://www.playerssports.net/page/friday-night-4s)                         |
| Players Friday Night 4s — North Avenue Beach, Chicago (Aug 21) | 2026-08-21 | Chicago, IL         | sand    | quads   | —     | [link](https://www.playerssports.net/page/friday-night-4s)                         |
| Players Friday Night 4s — North Avenue Beach, Chicago (Aug 28) | 2026-08-28 | Chicago, IL         | sand    | quads   | —     | [link](https://www.playerssports.net/page/friday-night-4s)                         |
| Players Friday Night 4s — North Avenue Beach, Chicago (Sep 11) | 2026-09-11 | Chicago, IL         | sand    | quads   | —     | [link](https://www.playerssports.net/page/friday-night-4s)                         |
| Players Grass Series — Montrose, Chicago (Jun 20)              | 2026-06-20 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/players-grass-series)                    |
| Players Grass Series — Montrose, Chicago (Jul 5)               | 2026-07-05 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/players-grass-series)                    |
| Players Grass Series — Montrose, Chicago (Jul 19)              | 2026-07-19 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/players-grass-series)                    |
| Players Grass Series — Montrose, Chicago (Aug 8)               | 2026-08-08 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/players-grass-series)                    |
| Players Grass Series — Montrose, Chicago (Aug 23)              | 2026-08-23 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/players-grass-series)                    |
| Players Grass Series — Montrose, Chicago (Sep 26)              | 2026-09-26 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/players-grass-series)                    |
| Players Grass Series — Montrose, Chicago (Oct 10)              | 2026-10-10 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/players-grass-series)                    |
| Players Grass Series — Montrose, Chicago (Oct 24)              | 2026-10-24 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/players-grass-series)                    |
| Players Grass Series — Montrose, Chicago (Nov 14)              | 2026-11-14 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/players-grass-series)                    |
| Players Grass Series — Montrose, Chicago (Nov 28)              | 2026-11-28 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/players-grass-series)                    |
| Players Beach Slap Party & Tournament                          | 2026-06-13 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/beach-slap)                              |
| Players Big Dig Party & Tournament                             | 2026-07-25 | Chicago, IL         | sand    | —       | —     | [link](https://www.playerssports.net/page/bigdig)                                  |
| Players Luau Volleyball Weekend                                | 2026-09-11 | Chicago, IL         | grass   | —       | —     | [link](https://www.playerssports.net/page/Luau)                                    |
| Six Pack Beach Volleyball Tournament                           | 2026-06-27 | Chicago, IL         | sand    | —       | —     | [link](https://chicagosocial.com/cssc_tournaments/6-pack-volleyball/)              |
| Volleywood Beach Volleyball Tournament                         | 2026-07-18 | Chicago, IL         | sand    | —       | —     | [link](https://chicagosocial.com/cssc_tournaments/volleywood-beach-tournament/)    |
| Angry Dragon DragonSlayer (Grass 2s)                           | 2026-06-13 | Doraville, GA       | grass   | doubles | —     | [link](https://www.angrydragonvolleyball.com/tournaments/dragonslayer-saturday26)  |
| Angry Dragon DragonSlayer (Reverse Coed 3s)                    | 2026-06-14 | Doraville, GA       | grass   | triples | —     | [link](https://www.angrydragonvolleyball.com/tournaments/dragonslayer-sunday26)    |
| Angry Dragon Tripocalypse (Grass 2s)                           | 2026-08-22 | Doraville, GA       | grass   | doubles | —     | [link](https://www.angrydragonvolleyball.com/tournaments/tripocalypse-saturday-26) |
| Angry Dragon Tripocalypse (Coed 3s)                            | 2026-08-23 | Doraville, GA       | grass   | triples | —     | [link](https://www.angrydragonvolleyball.com/tournaments/tripocalypse-sunday-2026) |
| Angry Dragon Volloween (Reverse Coed 4s)                       | 2026-10-10 | Doraville, GA       | grass   | quads   | —     | [link](https://www.angrydragonvolleyball.com/tournaments/volloween-2026-2)         |
| Spikefest (Dallas) — Sand 3s                                   | 2026-07-18 | Allen, TX           | sand    | triples | —     | [link](https://spikefest.com/)                                                     |
| MotherLode Volleyball Classic                                  | 2026-09-05 | Aspen, CO           | sand    | doubles | —     | [link](https://www.motherlodevolleyball.com/)                                      |
| Houston SSC — King/Queen of the Court (Sand 2s)                | 2026-06-13 | Houston, TX         | sand    | doubles | —     | [link](https://www.houstonssc.com/league/101861/details)                           |
| Houston SSC — Playin' for Pride Charity (Sand 4s)              | 2026-06-20 | Houston, TX         | sand    | quads   | —     | [link](https://www.houstonssc.com/league/102190/details)                           |
| Houston SSC — Playin' for Camp Safety Charity (Sand 4s)        | 2026-06-27 | Houston, TX         | sand    | quads   | —     | [link](https://www.houstonssc.com/league/101862/details)                           |
| SandBar SLC — Coed 4s (Jun 20)                                 | 2026-06-20 | North Salt Lake, UT | sand    | quads   | —     | [link](https://sandbarslc.com/tournaments/)                                        |
| SandBar SLC — Coed 2s (AA/A/BB) (Jun 27)                       | 2026-06-27 | North Salt Lake, UT | sand    | doubles | —     | [link](https://sandbarslc.com/tournaments/)                                        |
| SandBar SLC — Men's/Women's 3s (Jul 25)                        | 2026-07-25 | North Salt Lake, UT | sand    | triples | —     | [link](https://sandbarslc.com/tournaments/)                                        |
| SandBar SLC — Coed 2s — Real Estate Summer Slam (Aug 1)        | 2026-08-01 | North Salt Lake, UT | sand    | doubles | —     | [link](https://sandbarslc.com/tournaments/)                                        |
| SandBar South — Men's/Women's 2s (Jul 11)                      | 2026-07-11 | Bluffdale, UT       | sand    | doubles | —     | [link](https://sandbarbluffdale.com/tournaments/)                                  |
| SandBar South — Men's/Women's 2s (Jul 18)                      | 2026-07-18 | Bluffdale, UT       | sand    | doubles | —     | [link](https://sandbarbluffdale.com/tournaments/)                                  |

## Appendix — found but NOT in the import JSON

| Event                                    | Date          | Location           | Why excluded                                                                      |
| ---------------------------------------- | ------------- | ------------------ | --------------------------------------------------------------------------------- |
| BVCA National Championships              | 2026-07-07–11 | Hermosa Beach, CA  | Junior club championship — not adult pickup                                       |
| USAV Junior Beach National Championships | 2026-07-13–18 | Virginia Beach, VA | Junior event                                                                      |
| AVP Pro Tour stops                       | Jun–Sep 2026  | Nationwide         | Spectator/ticketed pro events, not participatory — ask to add as a marked section |

### Source notes

- **Volleyball Life API is now the primary source** (was a SPA wall; the public JSON endpoint cracked it). Full recipe + the filter/mapping in [`docs/community-events-scrape.md`](docs/community-events-scrape.md).

- **Facebook** — FB _pages_ can't be auto-fetched; use the `facebook-events-import` skill's logged-in scraper to pull FB event _data_. A FB _link_ is fine as an `externalUrl`.

- **SSOVA (Florida)** — schedule is an image; still needs its `bracketpal` JSON.
