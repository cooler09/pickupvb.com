# Community events — public-source scrape (running tally)

> **Scraped:** 2026-06-12 (+ 2026-06-12 deeper sweep) · **Scope:** nationwide US, upcoming events only · **Sources:** public/no-login pages — AVP schedules, USA Volleyball events, CBVA, and regional organizers (Players Sport & Social / Chicago, Angry Dragon / Atlanta, Spikefest / Dallas, MotherLode / Aspen, …). Facebook **pages can't be scraped** (login wall), but a Facebook URL is fine as an event's link when a public source surfaces it.

## How to use this file

- **121 import-ready events** live in [`community-events-public.json`](community-events-public.json) (the community-listing draft contract). Upload that file at `https://pickupvb.com/admin/community-import` (platform-admin only). The importer geocodes each address, resolves the timezone, and lets you review/fix every row before saving — now with a progress bar and chunked uploads so a large file won't time out. It's **idempotent on `(externalUrl, date)`**, so re-uploading after edits won't create duplicates.

- This is **separate** from the existing [`community-listings.json`](community-listings.json) (49 Facebook-sourced PA/OH/KY listings, mostly past). These are kept apart on purpose so importing one doesn't touch the other.

### ⚠️ Data caveats (review before import)

- **Every row is all-day (`allDay: true`) — no invented start times.** These sources publish a date, not a clock time (real start times live on the JS/login-walled registration pages). Rather than guess, each listing carries the accurate calendar date with the time deliberately omitted; the site renders just the date and labels it "time TBD." If you later learn an event's real start time, uncheck "All day" on that row during review and set it.

- **Multi-day events** show only the first day; the full date span is in each listing's `description`. `endsAtLocal` is left null.

- **Locations are city-level** (venue/beach name is in the description, not a street address) — the geocoder will place an approximate point; refine if you want exact pins.

- **`format`/`skillLevel` are conservative** — left blank when an event spans multiple formats or divisions rather than guessing a single value.

- **Some events share a series/landing-page link** (e.g. CT DIG + Susquehanna Smash both point at the AVP Grass schedule page; the AXV, Bluegrass, and Chesapeake series each share one URL across two dates). That's intentional — not every event has its own registration page, and players still get a real page for more info. The importer keys on **(URL + date)** so these don't collapse into one listing.

## 1. Marquee national grass & sand tournaments (8)

| Event                                      | Date       | Location          | Surface | Format  | Skill | Link                                                                            |
| ------------------------------------------ | ---------- | ----------------- | ------- | ------- | ----- | ------------------------------------------------------------------------------- |
| Pottstown Rumble (AVP Grass Tour)          | 2026-06-26 | Pottstown, PA     | grass   | doubles | —     | [link](https://www.pottstownrumble.com/registration)                            |
| AVP America Grass Nationals                | 2026-10-23 | Gainesville, FL   | grass   | —       | —     | [link](https://avp.com/avp-america/special-events/avp-america-grass-nationals/) |
| The CT DIG (AVP Grass Tour)                | 2026-07-25 | South Windsor, CT | grass   | —       | —     | [link](https://avp.com/avp-grass/schedule/)                                     |
| Susquehanna Smash (AVP Grass Tour)         | 2026-08-01 | Manheim, PA       | grass   | —       | —     | [link](https://avp.com/avp-grass/schedule/)                                     |
| Waupaca Boatride Volleyball Tournament     | 2026-07-09 | Oshkosh, WI       | grass   | —       | —     | [link](https://waupacaboatride.com/)                                            |
| DDD Triples #3 (USA Volleyball Grass Tour) | 2026-06-27 | —                 | grass   | triples | —     | [link](https://ddd.volleyballlife.com/event/34821)                              |
| The Luau Grass Volleyball Tournament       | 2026-07-19 | Kailua, HI        | grass   | quads   | —     | [link](https://volleyballlife.com/event/38801)                                  |
| Seaside Beach Volleyball Tournament        | 2026-08-05 | Seaside, OR       | sand    | —       | —     | [link](https://seasidebeachvolleyball.com/)                                     |

## 2. USA Volleyball Beach Tour — Nationals & Qualifiers (21)

_Sanctioned USAV beach (sand) events nationwide — National Championship plus Beach National Qualifiers (BNQ) and Beach Regional Qualifiers (BRQ)._

| Event                                                | Date       | Location              | Surface | Format | Skill | Link                                                                                                         |
| ---------------------------------------------------- | ---------- | --------------------- | ------- | ------ | ----- | ------------------------------------------------------------------------------------------------------------ |
| USA Volleyball Beach National Championship           | 2026-07-13 | Virginia Beach, VA    | sand    | —      | —     | [link](https://usavolleyball.org/event/2026-usa-volleyball-beach-national-championship/)                     |
| The Island BNQ Denver (Rocky Mountain BNQ)           | 2026-06-13 | Denver, CO            | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/37009)                                                          |
| 501 Volley Beach National Qualifier (Delta Region)   | 2026-06-13 | North Little Rock, AR | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/37106)                                                          |
| Red, White & Sand Rumble BNQ (Heart of America)      | 2026-06-13 | Shawnee, KS           | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/33742)                                                          |
| Midwest Open BNQ (Iowa Region)                       | 2026-06-13 | Des Moines, IA        | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/37272)                                                          |
| Absolute Beach BNQ (Lone Star Region)                | 2026-06-14 | Webster, TX           | sand    | —      | —     | [link](https://usavolleyball.org/event/2026-usa-volleyball-beach-tour-absolute-beach-lone-star-region-bnq/)  |
| SSOVA Beach National Qualifier                       | 2026-06-28 | Treasure Island, FL   | sand    | —      | —     | [link](https://www.ssova.com)                                                                                |
| Chesapeake Region Summer Beach National Qualifier    | 2026-08-01 | Clear Brook, VA       | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/33325)                                                          |
| AXV Beach #3 Regional Qualifier                      | 2026-06-13 | Amarillo, TX          | sand    | —      | —     | [link](https://www.amarilloxtremevolleyball.com/beach.html)                                                  |
| AXV Beach #4 Regional Qualifier                      | 2026-06-27 | Amarillo, TX          | sand    | —      | —     | [link](https://www.amarilloxtremevolleyball.com/beach.html)                                                  |
| Charlotte Open Beach National Qualifier (Carolina)   | 2026-06-13 | Charlotte, NC         | sand    | —      | —     | [link](https://usav.volleyballlife.com/event/37087)                                                          |
| Market City Tournament 4 (Carolina Region)           | 2026-07-18 | Asheboro, NC          | sand    | —      | —     | [link](https://www.facebook.com/groups/477816120593645)                                                      |
| Bluegrass Beach Bash #2 (Pioneer Region BRQ)         | 2026-06-13 | Bowling Green, KY     | sand    | —      | —     | [link](https://bravobeach.volleyballlife.com/)                                                               |
| Bluegrass Beach Bash #3 (Pioneer Region BRQ)         | 2026-07-11 | Bowling Green, KY     | sand    | —      | —     | [link](https://bravobeach.volleyballlife.com/)                                                               |
| Boyd Lee Sand Series 1 (Carolina BRQ)                | 2026-06-13 | Greenville, NC        | sand    | —      | —     | [link](https://volleyballlife.com/event/37148)                                                               |
| Boyd Lee Sand Series 2 (Carolina BRQ)                | 2026-07-11 | Greenville, NC        | sand    | —      | —     | [link](https://volleyballlife.com/event/37149)                                                               |
| June First Wave Chesapeake Beach Regional Qualifier  | 2026-06-16 | Dewey Beach, DE       | sand    | —      | —     | [link](https://chesapeake.volleyballlife.com)                                                                |
| June Second Wave Chesapeake Beach Regional Qualifier | 2026-06-23 | Dewey Beach, DE       | sand    | —      | —     | [link](https://chesapeake.volleyballlife.com)                                                                |
| Carolina Beach Boogie Regional Qualifier             | 2026-06-20 | Indian Trail, NC      | sand    | —      | —     | [link](https://www.riseevents.us/rise-events/outdoor/)                                                       |
| Gateway Beach Regional Championship                  | 2026-06-20 | Chesterfield, MO      | sand    | —      | —     | [link](https://www.gatewayvb.org/page/show/4709009-gateway-beach-regional-championships-regional-qualifier-) |
| WEVA Beach Regional Qualifier                        | 2026-06-21 | Rochester, NY         | sand    | —      | —     | [link](https://www.novaeventmanagement.com/events/)                                                          |

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

## 4. Regional series & metro tournaments (47)

_Adult outdoor series from regional organizers — **Chicago** (Players Sport & Social: full sand + grass season; Chicago Sport & Social), **Atlanta** (Angry Dragon grass), **Dallas** (Spikefest), **Aspen** (MotherLode), **Houston** (Sports & Social), and **Salt Lake City** (SandBar). The weekly series share one landing URL per series/venue across dates (handled by the URL+date key)._

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

These came up in the sweep but were left out of `community-events-public.json` for the reason noted. Pull any into the JSON if you can supply the missing piece.

_Shared series/landing-page links are now **included** (CT DIG, Susquehanna, AXV #4, Bluegrass #3, 2nd Wave Chesapeake, Charlotte Open were all recovered). What's left out:_

| Event                                                                                                                             | Date          | Location           | Why excluded                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| BVCA National Championships                                                                                                       | 2026-07-07–11 | Hermosa Beach, CA  | Junior club (Beach Volleyball Clubs of America) championship — not adult pickup                         |
| USAV Junior Beach National Championships                                                                                          | 2026-07-13–18 | Virginia Beach, VA | Junior event                                                                                            |
| AVP Pro Tour stops (Miami, Las Vegas, Long Beach, Central Park, East Hampton, Dallas, Manhattan Beach Open, Chicago championship) | Jun–Sep 2026  | Nationwide         | Spectator/ticketed pro events, not participatory — say the word and I'll add them as a separate section |

### Other promising sources I couldn't enumerate (JS-rendered / login-walled)

- **The Volleyball Life** (`volleyballlife.com`) — the registration backend for AVP America, Seaside, Pottstown, DDD, the Luau and most USAV beach events. It's a single-page app, so I could only capture individual event URLs surfaced elsewhere, not browse its full nationwide calendar. A logged-in/API pull would unlock a lot more.

- **CBVA detail pages** render client-side, so adult start times/fees aren't fetchable — only the list view (date/venue/divisions/URL) is.

- **Facebook events** (the richest pickup/grass source) — FB _pages_ can't be auto-fetched (login wall), so to pull event **data** out of FB use the `facebook-events-import` skill's logged-in scraper. A FB _link_ is perfectly fine as an event's `externalUrl` when a public source gives it to us (e.g. the Market City listing in section 2 links to its FB group).
