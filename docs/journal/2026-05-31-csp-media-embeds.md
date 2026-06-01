# CSP `frame-src` for media video embeds (2026-05-31)

## Context

User report: YouTube / Twitch embeds on media post feeds (event media
sub-page, profile video grids) weren't rendering. Root cause was the
enforcing Content-Security-Policy shipped in Bundle 27 (2026-05-22): its
`frame-src` directive allowlisted only `challenges.cloudflare.com` and
`vercel.live`, so every third-party media iframe was silently blocked. The
embed-src construction in [video-embed.tsx](../../apps/web/src/components/video-embed.tsx)
and the provider classification in
[external-video-url.ts](../../packages/domain/src/media/external-video-url.ts)
were already correct — only the header allowlist was missing the hosts.

Related: security audit [P2 #3 / #3a](../audits/security.md) (CSP
shipping + enforcement). Remediation log entry:
[2026-05-31 — CSP `frame-src` for media video embeds](../audits/security.md#2026-05-31--csp-frame-src-for-media-video-embeds).

## Decisions

- **Widened `frame-src`, not CORS.** The user framed it as "CORS and CSP."
  These embeds are `<iframe src=…>`, not `fetch()`/XHR, so CORS is not the
  mechanism — the browser was enforcing `frame-src`. No
  `Access-Control-Allow-*` header exists anywhere in the app (no middleware,
  no API-level CORS), and none was added. Chose to fix the actual lever and
  document the CORS non-issue inline so it isn't re-investigated.
- **`frame-src` only — no `img-src` / `connect-src` / `script-src`
  additions.** Once a cross-origin iframe loads, the framed document loads
  its own scripts/images/XHR under _its_ origin, governed by _its_ policies.
  Our CSP only needs to permit the iframe itself. We use a plain static
  iframe `src`, not the YouTube/Twitch JS player API, so there is no
  script/connect surface on our page to allow.
- **Added `www.youtube.com` alongside `www.youtube-nocookie.com`.** We embed
  via the privacy-enhanced nocookie host, but the player can navigate to
  `www.youtube.com` for related/fullscreen surfaces; allowlisting both
  avoids edge-case blocks at no extra exposure.
- **Twitch needs two hosts.** `player.twitch.tv` (VODs + channels) and
  `clips.twitch.tv` (clips) are distinct embed origins — both are in
  `embedSrc()`.
- **No entry for Instagram / TikTok / Facebook / `other`.** Those providers
  render as link cards (no iframe) per the `VideoEmbed` fallback, so they
  need no `frame-src` entry. If a future bundle adds first-party iframes for
  any of them, the embed host(s) get added here at the same time.
- **No test added.** This is a header-config change with no isolated logic;
  there's no test harness around `next.config.mjs`'s `headers()`, and the
  build validates the config. Matches the AGENTS.md "skip the test" guidance
  for config/type tweaks.

## Changes

- [apps/web/next.config.mjs](../../apps/web/next.config.mjs) — `frame-src`
  gains `www.youtube-nocookie.com`, `www.youtube.com`, `player.twitch.tv`,
  `clips.twitch.tv`. Extended the inline CSP-rationale inventory with a
  "Media embeds" bullet explaining the hosts and why no other directive
  changed.
- [docs/audits/security.md](../audits/security.md) — dated status-update
  block at the top + remediation-log entry.

## Patterns observed

- **The enforcing CSP is now the first suspect for any "third-party widget
  doesn't load" report.** Since Bundle 27 promoted CSP from Report-Only to
  enforcing, every new external resource (iframe, script, image, socket)
  must be added to the matching directive in `next.config.mjs` _in the same
  bundle that introduces it_ — otherwise it works in code review and dies in
  the browser. The inventory comment above `headers()` is the canonical
  checklist; keep it in sync when adding a directive entry.
- **iframe ≠ CORS.** Recurring confusion worth stating: framing a third party
  is governed by `frame-src` (and the remote's `X-Frame-Options` /
  `frame-ancestors`), never by CORS. CORS only applies to cross-origin
  `fetch`/XHR initiated by _our_ code.

## Follow-ups

- P2 #3b (nonce-based CSP hardening — drop `'unsafe-inline'` on
  `script-src` / `style-src`) is still open and unaffected by this change.
  See [security audit](../audits/security.md).
- If media posts later gain first-party Instagram / TikTok / Facebook
  embeds, add their iframe hosts to `frame-src` alongside the embed-src
  change in `video-embed.tsx`.
