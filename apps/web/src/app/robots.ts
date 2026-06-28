import type { MetadataRoute } from 'next';
import { APP_URL, IS_PROD_HOST, PROD_APP_URL } from '@/lib/app-url';

/**
 * robots.txt for crawlers — search engines (Google, Bing) and AI assistants
 * (ChatGPT, Claude, Perplexity, Gemini, …).
 *
 * Allow public pages; block auth-required and admin/tool-room surfaces. We
 * additionally name the major AI-assistant / training crawlers in their own
 * group (`AI_ASSISTANT_BOTS`) so they're *explicitly* welcomed — for the opt-in
 * usage tokens (Google-Extended, Applebot-Extended, anthropic-ai) naming them is
 * the only way to signal "yes, use our public content."
 *
 * On non-production hosts (dev.pickupvb.com, Vercel previews, etc.) we disallow
 * everything so crawlers don't index duplicate content.
 */

// Shared between the wildcard group and each named AI-bot group. A named
// `User-agent` group *fully overrides* the `*` group for that bot — robots.txt
// has no group inheritance — so the disallow list MUST be repeated for the AI
// bots. Otherwise naming GPTBot to "welcome" it would accidentally grant it
// /api, /profile, and the admin surfaces that `*` blocks. Keep the two lists in
// lockstep.
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
  // `/og` route) — a deliberately public, shareable page with a canonical, OG
  // image route, and Twitter card. Google/Bing resolve allow-vs-disallow by
  // *longest match*, so the more-specific `/watch` allow wins and crawlers +
  // OG-unfurl bots reach it while the host/captain workspace stays blocked.
  '/events/*/edit',
  '/events/*/bracket',
  '/groups/new',
  '/groups/*/edit',
  '/groups/*/members',
  '/teams/new',
];

// AI assistant + training crawlers we explicitly welcome. Naming them grants the
// same access as `*` (public pages yes, private surfaces no) and, for the opt-in
// usage tokens, signals consent to use our public content for answers / training.
// The `*-User` agents are user-triggered fetchers (an assistant reading a page
// because someone asked about it) — allowing them lets the assistant cite a live
// event / help / tool page accurately.
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

export default function robots(): MetadataRoute.Robots {
  if (!IS_PROD_HOST) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      host: APP_URL,
    };
  }
  return {
    rules: [
      { userAgent: '*', allow: PUBLIC_ALLOW, disallow: PRIVATE_DISALLOW },
      { userAgent: AI_ASSISTANT_BOTS, allow: PUBLIC_ALLOW, disallow: PRIVATE_DISALLOW },
    ],
    sitemap: `${PROD_APP_URL}/sitemap.xml`,
    host: PROD_APP_URL,
  };
}
