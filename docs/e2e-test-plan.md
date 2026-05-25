# E2E Test Plan — PickupVB

Manual test guide for every critical user-facing flow. Work through each section in order — earlier sections establish state that later ones depend on (e.g., you need an account before you can host an event). Each test lists steps, expected result, and edge cases worth checking.

**Environments:** Run against dev first (`dev.pickupvb.com`), then repeat the critical-path sections against prod after a deploy.

---

## 0. Test Accounts

Before starting, prepare the following accounts in dev:

| Role        | Email                  | Notes                                   |
| ----------- | ---------------------- | --------------------------------------- |
| Free host   | `free-host@test.com`   | No Stripe, no Pro                       |
| Pro host    | `pro-host@test.com`    | Active Pro subscription                 |
| Stripe host | `stripe-host@test.com` | Stripe Connect `charges_enabled = true` |
| Attendee A  | `attendee-a@test.com`  | Regular user                            |
| Attendee B  | `attendee-b@test.com`  | Regular user                            |
| Admin       | _(your admin account)_ | Platform admin flag set                 |

---

## 1. Authentication

### 1.1 Sign Up (new account)

1. Go to `/login`, switch to "Sign up" mode.
2. Enter a fresh email + strong password. Submit.
3. **Expected:** redirected to check-email or profile page; email arrives.
4. Click the confirmation link.
5. **Expected:** account confirmed, signed in, redirected to profile or intended page.

**Edge cases:**

- Duplicate email → should show "already registered" error, not a crash.
- Weak/short password → inline validation error before submit.
- Invalid email format → field error.

---

### 1.2 Sign In (existing account)

1. Go to `/login`. Enter valid credentials.
2. **Expected:** redirect to `/profile` or the `?next=` path if present.
3. Try wrong password.
4. **Expected:** error message, stays on login page.

---

### 1.3 Forgot Password

1. Go to `/forgot-password`. Submit a registered email.
2. **Expected:** success message, email arrives within ~1 min.
3. Click reset link → `/reset-password`.
4. Enter and confirm new password. Submit.
5. **Expected:** confirmation message; sign in with new password works.

**Edge cases:**

- Unregistered email → should NOT reveal whether it exists (neutral message).
- Expired reset link → "link expired" page, not a crash.

---

### 1.4 Anonymous / Guest Session

1. Visit any event page while signed out. Click "Join" or "RSVP".
2. **Expected:** prompted to create account OR a guest join flow starts.
3. If a guest session is created, go to `/claim`.
4. Enter email + password.
5. **Expected:** account is promoted; existing RSVP/data is preserved.
6. Confirm via email, sign back in.
7. **Expected:** profile shows correct data, no duplicate records.

---

### 1.5 Sign Out

1. Sign in, then sign out via the header menu.
2. **Expected:** redirected to home or login; auth cookies cleared.
3. Try visiting `/profile` directly.
4. **Expected:** redirect to `/login?next=/profile`.

---

## 2. Profile

### 2.1 Edit Profile

1. Sign in as Attendee A. Go to `/profile`.
2. Open the "Edit profile" section.
3. Update: display name, home city, primary position, Instagram handle, website URL.
4. Submit.
5. **Expected:** changes persist on page reload; public profile (`/players/<handle>`) reflects them.

**Edge cases:**

- Very long display name (> 80 chars) → should be capped or rejected.
- Invalid website URL → field error.

---

### 2.2 Handle (Username) Change

1. On `/profile`, change handle via the handle editor.
2. **Expected:** success; profile URL changes to `/players/<new-handle>`.
3. Old URL → should 404 or redirect.
4. Try a handle already in use.
5. **Expected:** conflict error, handle not changed.

---

### 2.3 Hero Image — Profile

1. On `/profile`, click "Add banner image".
2. Upload a JPEG over 8 MB.
3. **Expected:** "Image must be under 8 MB" error, no upload.
4. Upload a valid JPEG under 8 MB.
5. **Expected:** preview updates; banner appears on `/players/<handle>`.
6. Click "Change image", upload a different file.
7. **Expected:** new image replaces the old one immediately.
8. Click "Remove".
9. **Expected:** banner removed; public profile shows gradient fallback.

---

### 2.4 Notification Preferences

1. Go to `/profile/notifications`.
2. Toggle email notifications off and save.
3. **Expected:** preference saved; toggle stays off on reload.
4. Enable SMS; enter a valid phone number and verify it.
5. **Expected:** SMS verification code arrives; after entry, SMS enabled.
6. Enter an invalid phone number.
7. **Expected:** validation error, no code sent.

---

### 2.5 Receipts

1. Sign in as an account that has made payments (paid event attendee).
2. Go to `/profile/receipts`.
3. **Expected:** list of transactions with correct amounts.
4. Click an individual receipt.
5. **Expected:** detail page with event name, date, amount, itemized fees.
6. Fill in business info (company name, address) and save.
7. **Expected:** saved; appears on reload; receipt is printable.

---

## 3. Event Creation

### 3.1 Create Free Open-Play Event

1. Sign in as Free host. Go to `/events/new`.
2. Select "Open play / pickup" type.
3. Fill: title, date+time (future), location (use autocomplete), skill tier BB, unlimited capacity, no fee.
4. Click "Create event".
5. **Expected:** redirect to `/events/<id>`; all fields display correctly.

---

### 3.2 Create Paid Event — Stripe Required

1. Still as Free host (no Stripe). Select a paid ticket price.
2. **Expected:** payment fields hidden or a banner explaining Stripe setup is required. Cannot create paid event without Stripe.
3. Sign in as Stripe host. Repeat step 2 with a $10 ticket price.
4. **Expected:** event created; `/events/<id>` shows "Join · $10" button.

---

### 3.3 Create Tournament Event with Divisions

1. Sign in as Stripe host. Go to `/events/new`, select "Tournament".
2. Add two divisions: "Open" (AA) and "BB". Set different capacities and fees.
3. Create event.
4. **Expected:** event page shows two division tabs/sections; each has the correct capacity and price.

---

### 3.4 Create Event with External Registration

1. Select "Open play", enable "External registration", enter a valid external URL.
2. Create event.
3. **Expected:** event page shows "Register externally →" link pointing to the entered URL, no on-platform RSVP button.

---

### 3.5 Template Save and Apply (Pro)

1. Sign in as Pro host. Go to `/events/new`.
2. Fill out the form with a distinct title and settings.
3. In the "Saved templates" card, type a template name and click "Save template".
4. **Expected:** "Template saved." banner; the template appears in the dropdown.
5. Navigate to `/events/new` fresh (clear the form).
6. Select the saved template and click "Apply".
7. **Expected:** form pre-fills with the saved values.
8. Click "Remove" next to the template.
9. **Expected:** template disappears from dropdown; redirect to `/events/new`.

**Edge cases:**

- Click "Save template" with an empty name → inline "Enter a name first." error; no save.
- Non-Pro user → sees only the "Save and reuse event templates with Pro" note; no template card.

---

### 3.6 Template Save Blocked for Non-Pro

1. Sign in as Free host. Visit `/events/new`.
2. **Expected:** "Saved templates" card not visible; footer has only "Cancel" and "Create event".

---

## 4. Event Management (Host)

### 4.1 Edit Event

1. Sign in as host of an event. Go to `/events/<id>/edit`.
2. Change title, update description, change capacity.
3. Submit.
4. **Expected:** changes appear on event detail page immediately.

---

### 4.2 Hero Image — Event

1. On `/events/<id>/edit`, scroll to the Hero Image panel.
2. Upload a banner image.
3. **Expected:** image appears at the top of `/events/<id>`.
4. Remove the image.
5. **Expected:** gradient fallback shown.

---

### 4.3 Sponsor Slot

1. On `/events/<id>/edit` (Pro host or host with sponsor add-on), fill in sponsor name, URL, logo URL, optional discount code.
2. Click "Save sponsor".
3. **Expected:** sponsor panel shows on event detail page.
4. Click "Remove sponsor".
5. **Expected:** sponsor section disappears.

---

### 4.4 Co-Host Management

1. On `/events/<id>`, as host, open the co-host section.
2. Search for and add Attendee A as co-host.
3. **Expected:** Attendee A appears in co-host list; Attendee A can now see host controls on the event page.
4. Remove Attendee A as co-host.
5. **Expected:** Attendee A loses host controls.

---

### 4.5 Broadcast to Attendees

1. Have at least two attendees RSVPed to an event.
2. As host, open the broadcast section and send a message.
3. **Expected:** attendees receive the broadcast (email or in-app notification).

---

### 4.6 Cancel Event

1. On `/events/<id>/edit`, use the cancel event action.
2. **Expected:** event status changes to cancelled; attendees notified; event removed from browse list; RSVP buttons gone.

---

### 4.7 Manage Payments (Paid Event)

1. As host of a paid event with attendees, go to `/events/<id>` host panel.
2. Find a paid attendee. Issue a refund.
3. **Expected:** attendee is refunded in Stripe; payment status updates on the event page.

---

## 5. Event Attendance

### 5.1 RSVP — Free Event

1. Sign in as Attendee A. Open a free open-play event.
2. Click "Join".
3. **Expected:** attendee added to roster; "Leave" button appears.
4. Click "Leave".
5. **Expected:** removed from roster; "Join" button returns.

---

### 5.2 RSVP with Position

1. On an event that allows position selection, click "Join".
2. Select a position (e.g., Setter).
3. **Expected:** roster shows Attendee A in the Setter slot.

---

### 5.3 RSVP — Paid Event (Stripe Checkout)

1. Sign in as Attendee A. Open a paid event ($10 ticket).
2. Click "Join · $10".
3. **Expected:** redirected to Stripe Checkout with correct amount.
4. Complete checkout with Stripe test card `4242 4242 4242 4242`.
5. **Expected:** redirected back to event page; Attendee A on roster; host sees payment in manage-payments panel.

**Edge cases:**

- Use declined card `4000 0000 0000 0002` → Stripe shows decline; attendee NOT added.
- Leave Stripe Checkout without paying → return to event; attendee NOT added.

---

### 5.4 Leave Paid Event / Refund

1. Attendee A on a paid event within the refund window.
2. Click "Leave" (or refund-eligible leave).
3. **Expected:** attendee removed from roster; refund initiated in Stripe; attendee notified.
4. Repeat outside the refund window.
5. **Expected:** leave allowed but no refund; or leave blocked with error per event's refund policy.

---

### 5.5 Event Full (Capacity Limit)

1. Create an event with capacity = 1. Join as Attendee A.
2. Sign in as Attendee B, try to join.
3. **Expected:** "Event is full" message; Attendee B not added.

---

### 5.6 Tip Jar

1. On a paid event page (with tip jar enabled by host), click "Leave a tip".
2. Enter an amount, complete Stripe Checkout.
3. **Expected:** tip recorded; host sees tip in earnings/manage-payments.

---

## 6. Tournament Features

### 6.1 Ad-Hoc Teams — Create and Join

1. On a tournament event with ad-hoc team registration open, click "Register team".
2. Enter a team name.
3. **Expected:** team appears on event page; creator is captain.
4. Add Attendee A to the team (from the captain view).
5. **Expected:** Attendee A appears on the team roster on the event page.
6. As Attendee A, remove yourself from the team.
7. **Expected:** removed from roster.
8. As captain, rename the team.
9. **Expected:** updated name shows everywhere on the event page.
10. As captain, withdraw the team.
11. **Expected:** team disappears from event.

---

### 6.2 Pre-Rostered Team Registration

1. Sign in as a team captain. Create a tournament team at `/teams/new`.
2. Add Attendee A and Attendee B to the team; both accept the invite.
3. On a tournament event accepting pre-rostered teams, register the team.
4. **Expected:** team appears in event's team list with full roster.
5. Withdraw the team.
6. **Expected:** team removed from event.

---

### 6.3 Paid Team Registration (Stripe)

1. On a tournament event with a team registration fee, register a team as captain.
2. **Expected:** redirected to Stripe Checkout for the team fee.
3. Complete checkout.
4. **Expected:** team registered and marked as paid.

---

### 6.4 Free Agent Signup

1. On a tournament event with free-agent mode enabled, sign up as a free agent.
2. **Expected:** listed in the free-agents section.
3. Host assigns a free agent to a team.
4. **Expected:** free agent appears on the assigned team.

---

### 6.5 Bracket — Generate and Record Results

1. As host of a tournament event, go to `/events/<id>/bracket`.
2. Set seeding order, click "Randomize", then "Save seeding".
3. Click "Generate bracket".
4. **Expected:** bracket renders with all teams; correct seeding.
5. Find the first match; record a result (winner).
6. **Expected:** winner advances in bracket; next match updates.
7. Record all matches through to the final.
8. **Expected:** champion displayed; bracket fully resolved.

---

### 6.6 Bracket — Reset Match

1. After recording a result, click "Reset" on a match.
2. **Expected:** match reverts to unplayed; any downstream results that depended on it are cleared.

---

### 6.7 Division Winner

1. After bracket resolution, record the division winner.
2. **Expected:** winner recorded; displayed on event page.

---

## 7. Groups

### 7.1 Create Group

1. Sign in. Go to `/groups/new`.
2. Enter name, a unique slug, description, home city.
3. Submit.
4. **Expected:** group created; redirect to `/groups/<slug>`.

**Edge cases:**

- Duplicate slug → conflict error; group not created.
- Invalid slug format (spaces, special chars) → validation error.

---

### 7.2 Edit Group

1. As group owner, go to `/groups/<slug>/edit`.
2. Change description and home city.
3. Submit.
4. **Expected:** changes reflected on group profile page.

---

### 7.3 Hero Image — Group

1. On group edit page, upload a hero image.
2. **Expected:** banner appears at the top of `/groups/<slug>`.
3. Remove it.
4. **Expected:** gradient fallback.

---

### 7.4 Manage Members

1. As owner/admin, go to `/groups/<slug>/members`.
2. Add Attendee A (search by handle or email).
3. **Expected:** Attendee A appears in member list as "member".
4. Promote Attendee A to admin.
5. **Expected:** role updated.
6. Remove Attendee A.
7. **Expected:** Attendee A removed; no longer sees member controls.

---

### 7.5 Follow / Unfollow Group

1. As Attendee A (not a member), view `/groups/<slug>`.
2. Click "Follow".
3. **Expected:** following count increments; "Following" state shows.
4. Click "Unfollow".
5. **Expected:** unfollowed.

---

### 7.6 Host Event as Group

1. As group owner, create a new event, selecting the group as the hosting entity.
2. **Expected:** event appears in the group's "Upcoming events" list on `/groups/<slug>`.

---

## 8. Teams (Tournament Rosters)

### 8.1 Create Team

1. Go to `/teams/new`. Enter team name and format.
2. Submit.
3. **Expected:** team created; redirect to `/teams/<slug>`.

---

### 8.2 Invite and Accept Members

1. As team captain, add Attendee A by handle.
2. **Expected:** Attendee A receives invite; pending invite shown on their `/profile`.
3. Sign in as Attendee A, accept the invite.
4. **Expected:** Attendee A on team roster; invite removed from profile.
5. Decline a different invite.
6. **Expected:** invite dismissed; player not on team.

---

### 8.3 Remove Member

1. As captain, remove Attendee A from the team.
2. **Expected:** removed from roster immediately.

---

### 8.4 Team Broadcast

1. With multiple team members, send a broadcast from `/teams/<id>`.
2. **Expected:** all members receive notification.

---

## 9. Player Profiles & Social

### 9.1 Public Profile

1. Visit `/players/<handle>` while signed out.
2. **Expected:** name, positions, social links, home city, hosted events visible. No private data (email, etc.) shown.

---

### 9.2 Follow / Unfollow Player

1. Sign in as Attendee A. Visit Attendee B's profile.
2. Click "Follow".
3. **Expected:** Attendee B appears in Attendee A's friends list (`/friends`).
4. Click "Unfollow".
5. **Expected:** removed from friends list.

---

### 9.3 Mutual Follow Display

1. Attendee A follows Attendee B. Attendee B follows Attendee A.
2. As Attendee A, go to `/friends`.
3. **Expected:** Attendee B shows as "Mutual" follow.

---

## 10. Community Listings

### 10.1 Submit Listing

1. Go to `/community/new`. Fill title, description, external URL (Facebook or Meetup), surface, format, skill level.
2. Submit (CAPTCHA if present).
3. **Expected:** listing appears in `/community` directory.

**Edge cases:**

- Invalid URL → field error.
- 5 submissions in a day → rate-limit error on the 6th.

---

### 10.2 Edit and Delete Listing

1. Visit your submitted listing. Click "Edit".
2. Change the title. Save.
3. **Expected:** title updated.
4. Delete the listing.
5. **Expected:** listing removed from directory.

---

### 10.3 Report Listing

1. Visit another user's listing. Click "Report".
2. **Expected:** confirmation; listing may be hidden depending on threshold.

---

## 11. Pro Subscription

### 11.1 Subscribe to Pro

1. Sign in as Free host. Go to `/pricing` or `/profile/billing/pro`.
2. Select a plan (monthly or yearly). Click subscribe.
3. **Expected:** redirect to Stripe Billing checkout.
4. Complete with test card `4242 4242 4242 4242`.
5. **Expected:** redirect back; Pro badge appears on profile; Pro features unlocked (templates, analytics, etc.).

---

### 11.2 Pro Features Visible

After subscribing as Pro host:

1. Go to `/events/new` → Saved templates card is visible.
2. Go to `/profile/billing/analytics` → Analytics dashboard loads.
3. Create a paid event → higher limits visible (confirm per pricing page).

---

### 11.3 Manage / Cancel Subscription

1. Go to `/profile/billing/pro` → click "Manage subscription" (Stripe Portal).
2. **Expected:** Stripe Billing Portal opens; can cancel or change plan.
3. Cancel subscription.
4. **Expected:** Pro access removed at end of billing period (or immediately per plan).

---

## 12. Stripe Connect (Host Payouts)

### 12.1 Onboard Stripe Connect

1. Sign in as Free host. Go to `/profile/billing`.
2. Click "Connect with Stripe".
3. **Expected:** redirect to Stripe Connect onboarding.
4. Complete onboarding with test identity info.
5. **Expected:** redirect back; `charges_enabled = true`; onboarding checklist shows complete.

---

### 12.2 Stripe Dashboard

1. As a Stripe-connected host, go to `/profile/billing`.
2. Click "Open Stripe Dashboard".
3. **Expected:** redirect to Stripe's express dashboard (opens in new tab).

---

### 12.3 Earnings Statement

1. As a host with processed payments, go to `/profile/billing/earnings`.
2. **Expected:** list of transactions with event, date, gross, fee, net. Totals correct.

---

## 13. Notifications

### 13.1 In-App Notification Bell

1. As Attendee A, have Attendee B take an action that triggers a notification (e.g., follow Attendee A, join an event Attendee A hosts).
2. Check the notification bell in the header.
3. **Expected:** unread count badge; notification in dropdown.
4. Click the notification.
5. **Expected:** navigates to the relevant page; notification marked read.

---

### 13.2 Email Notification

1. As host, have a user RSVP to your event.
2. **Expected:** host receives "New RSVP" email.
3. Disable email notifications in `/profile/notifications`.
4. Have another user RSVP.
5. **Expected:** no email sent.

---

## 14. Navigation & Discovery

### 14.1 Event Browse and Filter

1. Go to `/events` while signed out.
2. **Expected:** page loads with events list; no auth required.
3. Filter by surface (e.g., "Indoor").
4. **Expected:** only indoor events shown.
5. Filter by skill level (BB).
6. **Expected:** filtered correctly.
7. Filter by "Near me" (grant location permission).
8. **Expected:** events sorted/filtered by proximity.
9. Paginate to next page.
10. **Expected:** next set of events loads; URL updates.

---

### 14.2 Player Directory

1. Go to `/players`. Search for a known handle.
2. **Expected:** matching player appears.
3. Filter by city.
4. **Expected:** players filtered by home city.

---

### 14.3 Groups Directory

1. Go to `/groups`. Search for a group name.
2. **Expected:** matching group appears.
3. Click through to group page.
4. **Expected:** correct group profile loads.

---

### 14.4 Short URL Redirect

1. Navigate to `/e/<code>` for a known short code.
2. **Expected:** 308 redirect to `/events/<uuid>`; correct event page loads.

---

### 14.5 External Link Interstitial

1. Click a community listing link that routes through `/leaving?url=...`.
2. **Expected:** interstitial page warns "you're leaving pickupvb.com"; click confirms and navigates to external URL.

---

## 15. Host Analytics (Pro)

### 15.1 Analytics Dashboard

1. Sign in as Pro host with past paid events. Go to `/profile/billing/analytics`.
2. **Expected:** charts load — fill rate, GMV trend, repeat attendees, monthly aggregations.
3. **Expected:** no 403 or empty state if data exists.

---

### 15.2 Analytics Blocked for Non-Pro

1. Sign in as Free host. Navigate to `/profile/billing/analytics`.
2. **Expected:** upgrade prompt or 403; no raw data exposed.

---

## 16. Theme

### 16.1 Dark / Light Toggle

1. Click the theme toggle in the header.
2. **Expected:** theme switches instantly; persists on page reload.
3. Switch back.
4. **Expected:** returns to original theme.

---

## 17. Admin (Platform Admin Account)

### 17.1 Admin Badge Visible

1. Sign in as admin. Go to `/profile`.
2. **Expected:** admin badge shows next to display name.

---

### 17.2 Community Listing Moderation

1. As admin, view a reported community listing.
2. Hide it.
3. **Expected:** listing hidden from public directory; admin can still see it.
4. Unhide it.
5. **Expected:** listing restored.

---

### 17.3 Approve/Reject Listing Claim

1. As a non-owner user, claim a community listing.
2. As admin, approve the claim.
3. **Expected:** listing now shows the claiming user as owner with edit/delete permissions.

---

## 18. Cross-Cutting Concerns

### 18.1 Unauthenticated Access

Verify these pages load without sign-in:

- `/` (home)
- `/events` (browse)
- `/events/<id>` (event detail — public event)
- `/groups` (directory)
- `/groups/<id>` (group profile)
- `/players/<id>` (player profile)
- `/community`
- `/pricing`
- `/about/numbers`
- `/legal/*`

Verify these redirect to login:

- `/profile`
- `/events/new`
- `/profile/billing`

---

### 18.2 Authorization Checks

1. As Attendee A, try to access `/events/<id>/edit` for an event you don't own.
2. **Expected:** redirect or 404, not an editable form.
3. Try to access `/groups/<slug>/members` for a group you're not in.
4. **Expected:** redirect or access denied.
5. Try to access `/profile/billing/analytics` as a non-Pro user.
6. **Expected:** upgrade prompt or 403.

---

### 18.3 Mobile Layout

On a mobile viewport (375px wide) or physical device, verify:

- Site header collapses to mobile menu; menu opens/closes.
- Event form is scrollable; sticky footer CTA ("Create event") is reachable.
- Event detail page is readable; RSVP button is accessible.
- Bracket page is at minimum navigable (complex layout — verify it doesn't overflow unrecoverably).

---

### 18.4 Keyboard Navigation (508 / WCAG)

1. Tab through the sign-in form without a mouse — every field and button must receive a visible focus ring.
2. Tab through the event creation form — all sections reachable.
3. Tab through the hero image upload widget — "Add banner image", "Change image", "Remove" all receive focus rings.
4. Open the mobile menu via keyboard; close via Escape key.

---

### 18.5 ISR / Cache Behavior

1. As a host, edit event title.
2. Visit the event detail page in an incognito window within 5–10 seconds.
3. **Expected:** updated title visible (ISR revalidates within 60s for event pages).
4. Visit the group page after a member joins.
5. **Expected:** member list updates within the revalidation window (60s).

---

### 18.6 og:image / Social Preview

1. Paste a public event URL into a social card preview tool (e.g., opengraph.xyz or Twitter card validator).
2. **Expected:** title, description, and brand card image render correctly.

---

## 19. Regression Checklist (Run After Any Deploy)

Quick smoke test — run in < 15 minutes:

- [ ] Home page loads (signed out)
- [ ] Sign in works
- [ ] Create a free open-play event
- [ ] RSVP to the event as a second user
- [ ] Host can see the attendee on the event page
- [ ] Hero image upload works (event or profile)
- [ ] Template save (Pro) — name input, save, appears in dropdown
- [ ] Event edit — change title, confirm update on detail page
- [ ] Group page loads with hero image if set
- [ ] Player profile page loads with hero image if set
- [ ] Sign out works; `/profile` redirects to login
- [ ] Theme toggle persists across navigation

---

## Appendix: Stripe Test Cards

| Scenario            | Card Number           | Exp / CVC        |
| ------------------- | --------------------- | ---------------- |
| Success             | `4242 4242 4242 4242` | Any future / any |
| Decline             | `4000 0000 0000 0002` | Any future / any |
| Auth required (3DS) | `4000 0025 0000 3155` | Any future / any |
| Insufficient funds  | `4000 0000 0000 9995` | Any future / any |

Use any valid future expiry and any 3-digit CVC for all test cards.
