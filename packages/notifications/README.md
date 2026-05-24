# @pickupvb/notifications

The **notification registry + template renderers** for PickupVB. Pure
TypeScript — no email/SMS/web-push transport lives here. Transports are
wired in `apps/web` and call into this package for the rendered payload.

> Agents: read [AGENTS.md](../../AGENTS.md) at the repo root first.

## What lives here

```
src/
├── kinds.ts         # NotificationKind registry + payload map per kind
│                    # + KIND_CATEGORY (preference grouping)
│                    # + KIND_DEFAULT_CHANNELS (email / sms / in-app / push)
├── templates.ts     # render(kind, payload) → RenderedEmail | RenderedSms | RenderedInApp
└── index.ts
```

Notification kinds use the form `<category>.<event>[.<state>]`
(e.g. `event.signup.confirmed`, `event.waitlist.promoted`). The category
prefix maps to user-facing preference categories so users can opt in/out
at a coarser grain than per-kind.

## Adding a new notification

1. Add the literal to `NotificationKind` in [src/kinds.ts](src/kinds.ts).
2. Add a `NotificationPayloadMap` entry with the data the template needs.
3. Add a template render in [src/templates.ts](src/templates.ts).
4. Optionally extend `KIND_CATEGORY` if a new category is needed.
5. Set the default channels in `KIND_DEFAULT_CHANNELS`.

## Rules of the layer

- **Framework-free.** No React/JSX, no email vendor SDK, no `next/...`.
  Templates render plain HTML strings.
- **Vendor-agnostic output shapes.** `RenderedEmail`, `RenderedSms`,
  `RenderedInApp` are small value objects the transport layer adapts.
  Switching email vendors is a single-file change in `apps/web`.
- **No I/O.** Don't import this package thinking you can "send" anything
  from it — it only renders.
