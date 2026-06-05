#!/usr/bin/env node
// ============================================================================
// scrape-fb-event.mjs — logged-in Facebook event scraper for the
// facebook-events-import skill.
//
// Facebook event pages are login-walled and JS-rendered, so a plain WebFetch
// returns an empty shell. This script drives a real Chromium window using a
// *dedicated, persistent* browser profile: you log into Facebook once, the
// session is saved under .fb-session/, and every later run reuses it. For each
// event URL it renders the page with your session, expands truncated
// descriptions, and writes the structured signals (og:/event: meta tags,
// JSON-LD, visible text) to a JSON file the skill then parses into listings.
//
// Usage:
//   node scrape-fb-event.mjs <url> [<url> ...] [--urls=<file>] [--out=<path>] [--headless]
//
// Pass event URLs as args and/or point --urls at a text file with one URL per
// line (blank lines and #-comments ignored). URLs from both sources are scraped
// in order, de-duplicated.
//
// First run: a browser window opens. Log into Facebook in it — the script
// detects login automatically (via the c_user cookie) and continues. No
// terminal interaction required. The .fb-session/ profile holds your FB
// cookies and is gitignored — do not commit or share it.
// ============================================================================

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPlaywright() {
  const bases = [
    path.resolve(__dirname, '../../../apps/web') + '/',
    path.resolve(__dirname, '../../../') + '/',
    process.cwd() + '/',
  ];
  for (const base of bases) {
    try {
      return createRequire(base)('@playwright/test');
    } catch {
      /* try next base */
    }
  }
  throw new Error('Could not resolve @playwright/test. Run `pnpm install` at the repo root first.');
}

// ---- args -----------------------------------------------------------------
function readUrlList(file) {
  const resolved = path.resolve(file);
  let text;
  try {
    text = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    console.error(`[scrape-fb-event] Could not read --urls file ${resolved}: ${err.message}`);
    process.exit(1);
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.startsWith('http'));
}

const args = process.argv.slice(2);
const rawUrls = [];
let outPath = path.join(__dirname, 'fb-scrape-output.json');
let headless = false;
let loginTimeoutMin = 20;
for (const a of args) {
  if (a === '--headless') headless = true;
  else if (a.startsWith('--out=')) outPath = path.resolve(a.slice('--out='.length));
  else if (a.startsWith('--urls=')) rawUrls.push(...readUrlList(a.slice('--urls='.length)));
  else if (a.startsWith('--login-timeout=')) {
    const n = Number(a.slice('--login-timeout='.length));
    if (Number.isFinite(n) && n > 0) loginTimeoutMin = n;
  } else if (a.startsWith('http')) rawUrls.push(a);
  else console.error(`[scrape-fb-event] Ignoring unrecognized arg: ${a}`);
}

// De-dupe while preserving order (a URL may appear in both args and the file).
const urls = [...new Set(rawUrls)];

if (urls.length === 0) {
  console.error(
    'Usage: node scrape-fb-event.mjs <event-url> [<event-url> ...] [--urls=<file>] [--out=<path>] [--headless]',
  );
  process.exit(1);
}

const SESSION_DIR = path.join(__dirname, '.fb-session');

// ---- helpers --------------------------------------------------------------
const log = (...m) => console.error('[scrape-fb-event]', ...m);

async function ensureLoggedIn(context, page) {
  const hasCUser = async () =>
    (await context.cookies()).some((c) => c.name === 'c_user' && c.value);

  if (await hasCUser()) {
    log('Existing Facebook session found ✔');
    return;
  }

  await page
    .goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => {});
  await page.bringToFront().catch(() => {});

  log('Not logged in. Please log into Facebook in the Chromium window that opened');
  log('(it may be BEHIND your editor — check your Dock / Mission Control).');
  log(`Waiting for login (up to ${loginTimeoutMin} minutes)…`);

  const deadline = Date.now() + loginTimeoutMin * 60 * 1000;
  let lastPing = 0;
  while (Date.now() < deadline) {
    if (await hasCUser()) {
      log('Login detected ✔');
      return;
    }
    const elapsed = Math.floor((Date.now() - (deadline - loginTimeoutMin * 60 * 1000)) / 1000);
    if (elapsed - lastPing >= 30) {
      lastPing = elapsed;
      log(`…still waiting for login (${elapsed}s elapsed)`);
      await page.bringToFront().catch(() => {});
    }
    await page.waitForTimeout(3000);
  }
  throw new Error(`Timed out waiting for Facebook login (${loginTimeoutMin} min).`);
}

async function expandSeeMore(page) {
  for (let i = 0; i < 6; i++) {
    const clicked = await page
      .evaluate(() => {
        const els = document.querySelectorAll('[role="button"], span, div');
        let did = false;
        for (const el of els) {
          const t = (el.textContent || '').trim();
          if (t === 'See more' || t === 'See More') {
            try {
              el.click();
              did = true;
            } catch {
              /* ignore */
            }
          }
        }
        return did;
      })
      .catch(() => false);
    if (!clicked) break;
    await page.waitForTimeout(400);
  }
}

async function autoScroll(page) {
  await page
    .evaluate(
      () =>
        new Promise((resolve) => {
          let total = 0;
          const step = 700;
          const timer = setInterval(() => {
            window.scrollBy(0, step);
            total += step;
            if (total >= 5000) {
              clearInterval(timer);
              resolve();
            }
          }, 180);
        }),
    )
    .catch(() => {});
}

async function extract(page, requestedUrl) {
  await page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await autoScroll(page);
  await expandSeeMore(page);
  await page.waitForTimeout(500);

  // Facebook's logged-in app shell renders the date *relatively* ("Tomorrow at
  // 9 AM") and emits no event: meta tags, so the absolute date is the hard part.
  // Hovering the relative-time text reveals a tooltip with the full date — grab
  // whatever tooltip(s) appear. Best-effort; never fatal.
  let tooltips = [];
  try {
    const timeEl = page
      .locator('[role="main"]')
      .getByText(/\b\d{1,2}\s?(AM|PM)\b/i)
      .first();
    await timeEl.hover({ timeout: 4000 });
    await page.waitForTimeout(900);
    tooltips = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tooltip"]')]
        .map((t) => (t.innerText || '').trim())
        .filter(Boolean),
    );
  } catch {
    /* hover is best-effort */
  }

  const data = await page.evaluate(() => {
    const metas = {};
    document.querySelectorAll('meta[property], meta[name]').forEach((m) => {
      const k = m.getAttribute('property') || m.getAttribute('name');
      const v = m.getAttribute('content');
      if (k && v) metas[k] = v;
    });
    const jsonLd = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => s.textContent)
      .filter(Boolean);
    const main = document.querySelector('[role="main"]') || document.body;

    // Absolute-date candidates hide in title / aria-label attributes even when
    // the visible text is relative. Collect any that mention a month or a year.
    const monthRe =
      /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)/i;
    const dateCandidates = new Set();
    main.querySelectorAll('[title], [aria-label]').forEach((el) => {
      for (const attr of ['title', 'aria-label']) {
        const v = el.getAttribute(attr);
        if (v && v.length < 120 && (monthRe.test(v) || /\b20\d{2}\b/.test(v))) {
          dateCandidates.add(v.trim());
        }
      }
    });

    return {
      title: document.title,
      metas,
      jsonLd,
      dateCandidates: [...dateCandidates].slice(0, 12),
      text: (main.innerText || '').replace(/\n{3,}/g, '\n\n').slice(0, 25000),
    };
  });

  return {
    requestedUrl,
    finalUrl: page.url(),
    // scrapedAt lets relative dates ("Tomorrow", "Today", a bare weekday) be
    // resolved deterministically instead of guessed from the file mtime.
    scrapedAt: new Date().toISOString(),
    scrapedAtLocal: new Date().toLocaleString('en-US', { timeZoneName: 'short' }),
    tooltips,
    ...data,
  };
}

// ---- main -----------------------------------------------------------------
const { chromium } = loadPlaywright();

const context = await chromium.launchPersistentContext(SESSION_DIR, {
  headless,
  viewport: { width: 1280, height: 1400 },
  args: ['--disable-blink-features=AutomationControlled'],
});

const results = [];
try {
  const page = context.pages()[0] ?? (await context.newPage());
  await ensureLoggedIn(context, page);

  for (const url of urls) {
    log(`Scraping ${url}`);
    try {
      const r = await extract(page, url);
      results.push(r);
      const titleHint = r.metas?.['og:title'] || r.title || '(no title)';
      log(`  → captured "${titleHint}" (${r.text.length} chars text, ${r.jsonLd.length} JSON-LD)`);
    } catch (err) {
      log(`  ! failed: ${err.message}`);
      results.push({ requestedUrl: url, finalUrl: null, error: String(err.message) });
    }
  }
} finally {
  await context.close();
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
log(`Wrote ${results.length} result(s) → ${outPath}`);
