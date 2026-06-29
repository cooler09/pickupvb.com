import { APP_URL, IS_PROD_HOST, PROD_APP_URL } from '@/lib/app-url';

/**
 * robots.txt — search engines (Google, Bing) and AI assistants (ChatGPT,
 * Claude, Perplexity, Gemini, …).
 *
 * This is a hand-authored route handler rather than Next's `robots.ts` metadata
 * convention because we emit a `Content-Signal` line (contentsignals.org), and
 * the typed `MetadataRoute.Robots` serializer only knows allow/disallow/sitemap/
 * host — it has no escape hatch for custom directives. The folder is literally
 * named `robots.txt`, so Next serves this handler at `/robots.txt`.
 *
 * Two things express our AI posture:
 *   1. We `Allow` the major AI crawlers (the `*` group already covers them, but
 *      we also name them so opt-in usage tokens like Google-Extended /
 *      Applebot-Extended / anthropic-ai have a group to read).
 *   2. `Content-Signal` declares how content may be USED once crawled — we
 *      permit all three uses (search, ai-input, ai-train).
 *
 * On non-production hosts (dev.pickupvb.com, Vercel previews, etc.) we disallow
 * everything so crawlers don't index duplicate content.
 */
export const dynamic = 'force-static';

// Content Signals (contentsignals.org) declare how content may be *used* after
// it's crawled — orthogonal to Allow/Disallow, which gate *access*. We permit
// all three uses, consistent with naming the AI training crawlers below:
//   search   — build a search index, show links / short snippets
//   ai-input — use our content to generate AI answers (RAG, grounding, search)
//   ai-train — train or fine-tune AI models
const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes';

// Shared between the wildcard group and the named AI-bot group. A named
// `User-agent` group *fully overrides* the `*` group for that bot — robots.txt
// has no group inheritance — so the disallow list MUST be repeated for the AI
// bots, else naming GPTBot to "welcome" it would accidentally grant it /api,
// /profile, and the admin surfaces. Keep the two groups in lockstep.
const PUBLIC_ALLOW = ['/', '/events/*/bracket/watch'];

const PRIVATE_DISALLOW = [
  '/api/',
  '/auth/',
  '/profile/',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/claim',
  '/claim/',
  // Ephemeral tool rooms (random 4-char codes, no useful content to index) —
  // but the tool index (/tools) and the tool landing pages (/tools/scoreboard,
  // /tools/timer, /tools/rotation, /tools/standings) stay allowed so search
  // engines surface the free utilities.
  '/tools/scoreboard/*',
  '/tools/timer/*',
  '/tools/rotation/*',
  '/tools/standings/*',
  '/s/',
  '/sentry-test',
  '/events/new',
  // Edit pages and bracket admin are per-event subroutes. The public spectator
  // subpath `/events/*/bracket/watch` is re-allowed via PUBLIC_ALLOW: a
  // `Disallow` is a prefix match that would otherwise shadow `/watch` (+ its
  // `/og` route) — a deliberately public, shareable page. Google/Bing resolve
  // allow-vs-disallow by *longest match*, so the more-specific `/watch` allow
  // wins and crawlers + OG-unfurl bots reach it while the workspace stays blocked.
  '/events/*/edit',
  '/events/*/bracket',
  '/groups/new',
  '/groups/*/edit',
  '/groups/*/members',
  '/teams/new',
];

// AI assistant + training crawlers we explicitly welcome. Naming them grants the
// same access as `*` (public pages yes, private surfaces no) and gives the
// opt-in usage tokens a group to read. The `*-User` agents are user-triggered
// fetchers (an assistant reading a page because someone asked about it).
const AI_ASSISTANT_BOTS = [
  'GPTBot', // OpenAI — ChatGPT training / index
  'OAI-SearchBot', // OpenAI — ChatGPT search
  'ChatGPT-User', // OpenAI — user-triggered browsing
  'Google-Extended', // Google — Gemini / Vertex AI (opt-in token)
  'Applebot-Extended', // Apple Intelligence (opt-in token)
  'anthropic-ai', // Anthropic — training (opt-in token)
  'ClaudeBot', // Anthropic — crawler
  'Claude-User', // Anthropic — user-triggered fetch
  'Claude-SearchBot', // Anthropic — search
  'PerplexityBot', // Perplexity — index
  'Perplexity-User', // Perplexity — user-triggered fetch
  'CCBot', // Common Crawl (feeds many open LLMs)
  'DuckAssistBot', // DuckDuckGo AI
  'Amazonbot', // Amazon
];

const TXT = 'text/plain; charset=utf-8';

/** One robots.txt group: the User-agent line(s), the Content-Signal, then rules. */
function group(userAgents: string[]): string {
  const lines = userAgents.map((ua) => `User-agent: ${ua}`);
  lines.push(`Content-Signal: ${CONTENT_SIGNAL}`);
  for (const path of PUBLIC_ALLOW) lines.push(`Allow: ${path}`);
  for (const path of PRIVATE_DISALLOW) lines.push(`Disallow: ${path}`);
  return lines.join('\n');
}

const PREAMBLE = `# robots.txt — search engines and AI assistants welcome.
#
# Content-Signal (contentsignals.org) declares how our content may be USED after
# it is crawled. We permit all three uses:
#   search   = build a search index and show links / short snippets
#   ai-input = use our content to generate AI answers (RAG, grounding, search)
#   ai-train = train or fine-tune AI models`;

export function GET(): Response {
  if (!IS_PROD_HOST) {
    return new Response(`User-agent: *\nDisallow: /\nHost: ${APP_URL}\n`, {
      headers: { 'content-type': TXT },
    });
  }
  const body =
    [
      PREAMBLE,
      group(['*']),
      group(AI_ASSISTANT_BOTS),
      `Sitemap: ${PROD_APP_URL}/sitemap.xml`,
      `Host: ${PROD_APP_URL}`,
    ].join('\n\n') + '\n';
  return new Response(body, { headers: { 'content-type': TXT } });
}
