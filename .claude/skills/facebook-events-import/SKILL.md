---
name: facebook-events-import
description: Turn Facebook (or Meetup / Eventbrite / Instagram / plain-text) volleyball events into a community-listings JSON file you can upload at pickupvb.com/admin/community-import. Use when asked to "import Facebook events", "pull events into JSON", "generate community listing JSON", "scrape an event for pickupvb", or when handed event URLs/text to turn into listings. Tries to fetch a public event URL, falls back to asking you to paste the event text.
---

# Facebook events → community-listings JSON

Produce a JSON file of community-listing **drafts** that an admin uploads at
`/admin/community-import` on pickupvb.com. The site geocodes the address and
resolves the timezone **server-side at import time**, and an admin reviews and
fixes every row before anything is saved — so this skill's only job is to emit
accurate, conservatively-parsed structured fields. Never fabricate facts.

## Inputs

The user provides one or both:

- **Event URL(s)** — Facebook event links (or Meetup / Eventbrite / etc.).
- **Pasted text** — the copied contents of an event page or a plain blurb. May
  describe one event or several.

## Process

1. **For each URL: try to fetch it with `WebFetch`** with a prompt like
   _"Extract the event title, host/organizer, full date and start/end time,
   venue name and full address, price, format, and any RSVP link."_

2. **Expect Facebook to often fail.** FB event pages are usually login-walled
   and JS-rendered, so `WebFetch` frequently returns a login prompt, a cookie
   wall, or near-empty content. Meetup/Eventbrite public pages fetch more
   reliably. **If the fetched content lacks at least a title and a date/time,
   do not guess** — ask the user to paste that event's text:

   > I couldn't read `<url>` (Facebook blocks automated fetches). Open the event
   > in your browser, select all the page text, and paste it here and I'll parse
   > it.

3. **For pasted text: parse directly.** Split into multiple listings if the text
   clearly describes several distinct events.

4. **Build one draft object per event** following the contract below.

5. **Write the result** to a file (default `community-listings.json` in the
   current directory, or a path the user names) as a **bare JSON array**,
   pretty-printed. Then validate it (see "Self-check") and report a one-line
   summary per event (title — date — city).

6. **Tell the user how to import:** upload the file at
   `https://pickupvb.com/admin/community-import` (platform-admin only); they'll
   review and fix each draft before creating them in bulk. The "…or paste JSON
   directly" disclosure on that page also accepts the array contents.

## Output contract — one object per event

Emit an **array** of objects with exactly these keys. Omit nothing; use `''`
or `null` as specified rather than dropping a key.

| Field              | Type           | Rules                                                                                                                                                                                                          |
| ------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`            | string         | Concise event name, 3–200 chars. **Required.**                                                                                                                                                                 |
| `description`      | string         | Extra detail — format, cost, what to bring, recurring-schedule notes. `''` if none.                                                                                                                            |
| `externalUrl`      | string         | The public RSVP/sign-up URL if present (must start with `https://`). `''` if none — **do not invent one.**                                                                                                     |
| `externalHostName` | string \| null | Hosting club/group/page name if stated, else `null`.                                                                                                                                                           |
| `startsAtLocal`    | string         | Venue-local wall-clock start as `'YYYY-MM-DDTHH:mm'` (24-hour). **No timezone/offset.** If the year is missing, pick the next future occurrence vs. today. `''` only if no date/time can be determined at all. |
| `endsAtLocal`      | string \| null | Same format as `startsAtLocal`, or `null` if no end time is given.                                                                                                                                             |
| `addressLine`      | string \| null | Street line, or `null`.                                                                                                                                                                                        |
| `city`             | string \| null | `null` if unknown.                                                                                                                                                                                             |
| `region`           | string \| null | State/province, or `null`.                                                                                                                                                                                     |
| `postalCode`       | string \| null | `null` if unknown.                                                                                                                                                                                             |
| `country`          | string \| null | Full name like `"United States"`, or `null`. Leave all five address parts `null` if no location is given.                                                                                                      |
| `surface`          | enum \| null   | One of `"indoor"`, `"grass"`, `"sand"`, or `null` if unstated.                                                                                                                                                 |
| `format`           | enum \| null   | One of `"sixes"`, `"quads"`, `"triples"`, `"doubles"`, or `null` if unstated.                                                                                                                                  |
| `skillLevel`       | enum \| null   | One of `"beginner"`, `"intermediate"`, `"advanced"`, `"competitive"`, or `null` if unstated.                                                                                                                   |

**Do not** include `latitude`, `longitude`, or `timeZone` — the server derives
those from the address. **Prefer `null` / `''` over a guess** for location,
enums, and URLs. It is fine to infer the year of a date.

### Example output

```json
[
  {
    "title": "Saturday Morning Beach Volleyball",
    "description": "Quads, $5 drop-in, bring water and sunscreen. Recurring weekly through August.",
    "externalUrl": "https://www.facebook.com/events/1234567890",
    "externalHostName": "Erie Beach Volleyball Club",
    "startsAtLocal": "2026-07-11T09:00",
    "endsAtLocal": "2026-07-11T12:00",
    "addressLine": "123 Lakeshore Dr",
    "city": "Erie",
    "region": "PA",
    "postalCode": "16505",
    "country": "United States",
    "surface": "sand",
    "format": "quads",
    "skillLevel": "intermediate"
  }
]
```

## Self-check before handing off

- Output is a JSON array (`[...]`), valid JSON, one object per event.
- Every object has all 14 keys; each `title` is ≥ 3 chars.
- Every `externalUrl` is `''` or starts with `https://`.
- Every `startsAtLocal` / `endsAtLocal` is `''` / `null` or matches
  `YYYY-MM-DDTHH:mm` (no trailing `Z`, no `+00:00`).
- `surface` / `format` / `skillLevel` are one of the allowed values or `null` —
  never a free-text guess.
- No `latitude` / `longitude` / `timeZone` keys.

Rows that fail validation on the server are reported per-row in the importer, so
the admin can fix and retry just those — but get them right here to save review
time.
