# 0006. Event divisions, tournament series, and external registration

- **Status:** Accepted
- **Date:** 2026-05-18

## Context

The original `events` aggregate models one row as one _playable thing_:
single `format`, `gender`, `skill_level`, `price_cents`, `capacity_kind`,
`max_spots`. That fits pickup play and small single-division tournaments
fine. It does not fit how real volleyball tournaments are advertised and
run today.

A representative sample of 18 real-world listings is in
[`docs/example-events.md`](../example-events.md). The patterns we hit
constantly:

- **Multiple divisions per event.** "AA / A / BB" or "B / BB / BB3" or
  "Open / AA / BB". Different prizes, sometimes different prices, often
  different capacities. (Examples 2, 3, 7, 10, 11, 12, 13, 16, 17, 18.)
- **Multiple formats / genders in one event.** Same time, same place,
  shared host: "Men's 6s **and** Women's 4s", "Coed 4s **and** Coed 6s",
  "Sand 4s + Indoor 4s". (Examples 7, 8, 9, 11, 18.)
- **Multi-day tournaments.** Day 1 doubles, Day 2 quads + coeds.
  (Example 18.)
- **Tournament series.** "Grass Masters Event 2 of 10", "Summer Doubles
  Series #2". Season-long point standings. (Examples 2, 4, 6.)
- **Age divisions** alongside skill divisions: 18U, 16U, 14U, high
  school (grades 10–12), junior high (grades 7–9). (Examples 3, 5, 18.)
- **NAGVA divisions.** B, BB, BB3 (BB with up to 3 A-rated players),
  Open. (Examples 16, 17.)
- **Off-platform registration.** "Message Level Up Volleyball",
  "Venmo @scotthphillips", external NAGVA registration URLs. (Most of
  the sample.)
- **Pair-draw formats.** Sign up as a pair, get drawn into a 4 or 6.
  Distinct from "bring your full team" and from "individual signup".
  (Examples 1, 10, 11, 12, 13.)
- **Themed / fundraiser tournaments.** Christmas in July, True
  American, school fundraisers. (Examples 3, 5, 7, 8.)
- **Skill-tier mismatch.** Our enum
  (`beginner / intermediate / advanced / competitive`) doesn't map to
  the ladder hosts actually use (`C / B / BB / BB3 / A / AA / Open`).

The current workaround — one `events` row per division-format-gender
combination — fragments the host's view, splits the attendees, breaks
the bracket, duplicates payouts, and floods search.

## Decision

Introduce **`Division`** as a child entity of `VolleyballEvent`. An event
is the _container_ (when, where, who hosts, what's the vibe). A division
is the _playable bracket_ (format × gender × skill × age × capacity ×
price × prize). The vast majority of pickup events stay one-division
under this model; tournaments get the multi-division expressiveness they
actually need.

Alongside the divisions refactor, add a small set of additive
event-level fields that every real listing needs (venue name,
registration deadline, series label, fundraiser flag, theme tags,
external-registration mode, payment instructions, sanctioning body) and
a richer skill tier ladder.

### Data model

```
events  (the container — one per advertised tournament)
  id, host_id, host_group_id, title, description, rules,
  venue_name, address_line, city, region, postal_code, country, geo,
  starts_at, ends_at, time_zone, registration_closes_at,
  status, visibility,
  series_name, series_position, series_size,
  is_fundraiser, fundraiser_beneficiary,
  theme_tags text[],
  sanctioning_body,
  registration_mode ('platform' | 'external'),
    external_registration_url, external_registration_instructions,
    payment_instructions,
  -- legacy single-division columns retained for back-compat, mirror the
  -- single (or "primary") division during the transition period.
  surface, format, gender, skill_level, type,
  capacity_kind, max_spots, position_roster,
  price_cents, host_absorbs_fee, refund_window_hours,
  created_at, updated_at

event_divisions  (the playable bracket — N per event, ≥ 1)
  id, event_id, sort_order, label,           -- "AA", "BB3", "18U Boys"
  surface, format, gender,
  skill_tier, age_group, tier_label,         -- structured + free-form override
  team_composition,                           -- solo | team | pair_draw | partner_required
  team_size,                                  -- nullable; min/max players per team
  capacity_kind, max_spots,                   -- per-division capacity
  price_cents, price_unit,                    -- per_player | per_team; nullable -> inherit event
  prize_text, prize_purse_cents,              -- prize advertisement
  starts_at, ends_at,                         -- nullable; override event window for multi-day
  created_at, updated_at

event_attendees   add division_id (nullable during migration)
event_teams       add division_id (nullable during migration)
event_free_agents add division_id (nullable during migration)
tournament_brackets  one row per division (FK switched event_id -> division_id in a later migration)
```

### New enums

```
skill_tier         ('c', 'b', 'bb', 'bb3', 'a', 'aa', 'open')
age_group          ('adult', 'hs', '18u', '16u', '14u', 'jr_high')
team_composition   ('solo', 'team', 'pair_draw', 'partner_required')
price_unit         ('per_player', 'per_team')
registration_mode  ('platform', 'external')
```

### Skill ladder migration

The legacy `skill_level` enum stays on `events` for back-compat; new
code reads `skill_tier` on the division. Backfill map:

| legacy `skill_level` | new `skill_tier` |
| -------------------- | ---------------- |
| `beginner`           | `b`              |
| `intermediate`       | `bb`             |
| `advanced`           | `a`              |
| `competitive`        | `open`           |

Search filtering groups tiers into bands so UX stays simple:

| Band         | Tiers        |
| ------------ | ------------ |
| Beginner     | `c`, `b`     |
| Intermediate | `bb`, `bb3`  |
| Advanced     | `a`          |
| Competitive  | `aa`, `open` |

Badges always render the precise tier label.

### Off-platform registration

Many real hosts don't use on-platform Stripe; they direct attendees to
Venmo, a NAGVA URL, or "DM us on Facebook". When
`events.registration_mode = 'external'`:

- All on-platform RSVP / team / free-agent / checkout panels are hidden.
- A single "How to register" card renders the
  `external_registration_url` (if any), `external_registration_instructions`,
  and `payment_instructions`.
- Divisions still drive search facets, badges, and the public event
  detail layout.

`payment_instructions` is also surfaced on platform-mode events as an
optional supplement (e.g. "Venmo @scotthphillips if Stripe checkout
fails").

### Series

Cheap version first. Two text/integer columns (`series_name`,
`series_position`, `series_size`) let the badge render "Grass Masters
Series · Event 2 of 10" and let search group events by series name. A
real `event_series` aggregate with point standings is deferred to a
later ADR.

### Multi-day tournaments

Handled by letting each division optionally override `starts_at` /
`ends_at`. The event window is the union. Multiple physical venues per
event are out of scope.

## Consequences

### Easier

- One event row per advertised tournament. Hosts manage one timeline,
  one venue, one host roster, one tip jar, one bracket page that
  contains divisional sub-brackets.
- Search returns one card per tournament with division badges, not
  six near-duplicates.
- Per-division pricing, capacity, and prizes are first-class.
- Off-platform tournaments are usable on the platform (badge, search,
  hosts, share link, social handles) without forcing Stripe.
- The skill ladder matches how hosts actually classify play, so
  cross-host division comparisons (and series standings) become
  tractable.

### Harder

- Existing pages that read `events.format / gender / skill_level / price_cents
/ capacity_kind / max_spots` must learn to prefer the division values
  when present.
- `tournament_brackets` migrates from `event_id` to `division_id`. We
  keep the legacy column populated until UI is converted, then drop it.
- The `events_view` and search RPC need division-aware aggregations
  (e.g. summarise divisions into a comma-separated badge list, sum
  capacity, take min/max price).
- Domain code grows a `Division` value object and `VolleyballEvent`
  exposes `divisions: ReadonlyArray<Division>`. The aggregate boundary
  is unchanged (event still owns its divisions).

### Out of scope (this ADR)

- True `event_series` aggregate with point-scoring rules.
- Multi-venue tournaments.
- Per-court / per-rink configuration.
- Sponsor / vendor tracking.
- Refund reason fields.

## Phased rollout

1. **Schema, additive.** Add new event columns + enums + `event_divisions`
   table; backfill one division per existing event; add nullable
   `division_id` to child tables. Existing reads keep working.
2. **Domain.** `Division` entity, `VolleyballEvent.divisions` getter,
   `skillTierBand()` helper, `Division.create()` invariants. Pure /
   tested.
3. **Infrastructure.** `SupabaseEventRepository` loads / saves
   divisions. `events_view` rebuilt with division aggregations. Search
   RPC reads bands instead of legacy `skill_level`.
4. **Create / edit form.** Single-division mode by default; "Add
   another division" reveals the multi-division UI. New panels for
   external registration and series.
5. **Event detail page.** Division tabs / sections; one RSVP / team /
   free-agent / checkout panel per division; external-registration
   card.
6. **Search filters.** Tier bands + age group + team-composition +
   series name. Card renders division summary.
7. **Bracket page.** One bracket per division behind a tab strip.
8. **Backfill cleanup.** Drop legacy `events.format / gender / skill_level
/ price_cents / capacity_kind / max_spots / position_roster` once
   all reads are routed through the division.

Each phase ships independently and is observable in production before
the next phase starts.

## Alternatives considered

- **Keep one event row per division.** What we have. Causes the
  fragmentation problems above and prevents shared host / shared
  bracket / shared tip jar features.
- **Make divisions a separate aggregate.** Rejected — divisions don't
  exist independently of an event, and bracket / capacity invariants
  are easier to enforce when the event owns its divisions.
- **Free-form `divisions jsonb` column.** Rejected — loses
  query-ability for search facets, and we already know the shape.
- **One-event-per-tournament with all variability in `description`.**
  Rejected as the current de-facto state on every other volleyball
  platform; it's exactly what hosts complain about.
