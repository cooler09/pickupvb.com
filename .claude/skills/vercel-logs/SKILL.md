---
name: vercel-logs
description: Look up Vercel deployment logs for pickupvb.com — runtime (function) logs, build/deploy logs, and listing recent deployments. Use when asked to check why a deploy failed, inspect production/preview errors, view build output, debug 500s, or find a deployment URL. Triggers on "vercel logs", "why did the deploy fail", "check the build", "production error", "deployment status", "function logs".
---

# Vercel logs

Look up logs for the `pickupvb.com` Vercel project. The Vercel CLI is installed
(`54.x`) and authenticated. Run everything from the repo root
(`/Users/zachary/Documents/projects/github/pickupvb.com`).

When the CLI detects it's being driven by an agent it defaults to
`--non-interactive`, so commands won't block on prompts.

## ⚠️ Gotcha: the linked project / scope

`.vercel/project.json` points at the team `team_ZIacsnzfQbX5LRXkzk8ezjYX`, but
the currently logged-in CLI account (`vercel whoami` → `cooler09`) **no longer
has access to that team.** Commands print:

> Your Project was either deleted, transferred to a new Team, or you don't have
> access to it anymore.

…and then fall back to the personal scope `cooler09s-projects/pickupvb.com`,
which **does** work. So:

- The fallback resolves correctly — `vercel logs` / `vercel ls` still return
  data for `cooler09s-projects/pickupvb.com`. The warning is noise; proceed.
- Deployment URLs in this scope look like
  `https://pickupvb-<hash>-cooler09s-projects.vercel.app`.
- If a command hard-fails on the link (not just the warning), the fix is
  `vercel link` — **interactive, hand it to the user**, don't attempt it
  non-interactively.
- Don't "fix" `.vercel/project.json` by hand; it's the team's source of truth
  for CI/CD even though this local account can't reach that team.

## ⚠️ Gotcha: Hobby-plan log retention

Runtime logs are **retained only 1 hour** on the Hobby plan. If you're asked
about an error from earlier today, runtime logs are likely already gone — say
so and pivot to build logs (`vercel inspect --logs`, retained with the
deployment) or ask the user to reproduce so fresh logs appear.

## Dev vs. prod — telling the environments apart

The two environments map like this (verified against live log rows):

| Environment | git branch | Vercel `environment` | `domain`           |
| ----------- | ---------- | -------------------- | ------------------ |
| **Prod**    | `main`     | `production`         | `pickupvb.com`     |
| **Dev**     | `develop`  | `preview`            | `dev.pickupvb.com` |

So `dev.pickupvb.com` is a **preview** deployment (the `develop` branch aliased
to a custom domain), not a second production project. Filter accordingly:

```bash
vercel logs --environment production     # PROD (pickupvb.com / main)
vercel logs --branch develop             # DEV  (dev.pickupvb.com / develop)
```

Caveats:

- **`--environment preview` alone is too broad** — it catches _every_ branch's
  preview (every open PR), not just dev. Use `--branch develop` to isolate dev.
- **The `--branch` / `--environment` filters occasionally leak a stray row**
  from the other environment. When it has to be exact, the JSON **`domain`**
  field is ground truth — filter on it:

  ```bash
  # PROD only, errors only
  vercel logs --json | jq 'select(.domain=="pickupvb.com" and .level=="error")'
  # DEV only, errors only
  vercel logs --json --branch develop | jq 'select(.domain=="dev.pickupvb.com" and .level=="error")'
  ```

- Every log line carries `environment`, `branch`, and `domain`, so even in
  mixed `--json` output you can always tell which env a line came from. When
  reporting back, **always say which environment** an error is from — dev noise
  and prod incidents are not the same severity.

## Two log surfaces — pick the right one

Choosing wrong is the #1 mistake here:

| You want…                                                     | Command                       | Notes                                                                                                                                       |
| ------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime / function errors** (deploy is live but app throws) | `vercel logs [url]`           | Serverless/edge function logs — 500s, unhandled rejections, `console.error` from route handlers & server actions. **1h retention (Hobby).** |
| **Build / deploy failure** (deploy didn't go live)            | `vercel inspect <url> --logs` | Compile errors, `pnpm build` output, missing build-time env vars. Retained with the deployment.                                             |

## Runtime logs — `vercel logs`

Works **with or without** a deployment URL. Without a URL it targets the linked
project's recent logs:

```bash
vercel logs                          # recent runtime logs, current git branch
vercel logs --environment production # production functions only
vercel logs <deployment-url>         # a specific deployment
```

Most useful flags (CLI 54):

- `-f, --follow` — **stream live** logs. This blocks. Run it with
  `run_in_background: true` and read the output; don't wait on it interactively.
  Without `--follow`, the command prints recent logs and **exits** (you'll see
  `No new logs found. Stream live logs with --follow` when the window is empty).
- `--level error|warning|info|fatal` — filter by level.
- `--status-code 500` (or `4xx`/`5xx`) — filter by HTTP status.
- `--query 'status:500 error'` — advanced filter syntax.
- `--since 30m --until now` — ISO 8601 or relative (`1h`, `30m`). Narrow the
  window (and respect the 1h Hobby retention).
- `-j, --json` — JSON Lines, pipe to `jq`.
- `-x, --expand` — full message under each request line.
- `--limit N` — max results (use the long form; the short `-n` rejects its arg).
- `--branch <name>` / `--no-branch` — by default it auto-filters to the current
  git branch; `--no-branch` shows all branches.
- `--source serverless|edge-function|edge-middleware|static`,
  `--request-id req_xxx`.

## Build logs — `vercel inspect`

```bash
vercel inspect <deployment-url> --logs        # build output for a deployment
vercel inspect <url> --wait --timeout 90s --logs   # block until build finishes, then dump
vercel inspect <url> --format json            # deployment metadata as JSON
```

Use this when a deploy shows `● Error` in `vercel ls` (it never went live).

## Finding a deployment — `vercel ls`

```bash
vercel ls                              # recent deployments (newest first)
vercel ls --environment production     # production only  (NOTE: not --prod)
vercel ls --status ERROR               # only failed deploys (comma-sep ok: BUILDING,READY)
vercel ls --format json                # machine-readable
```

Columns: Age, Project, Deployment URL, Status (`● Ready` / `● Error` /
`● Building` / `● Queued`), Environment, Duration, Username. Pick the row that
matches what you're debugging (newest `● Error` for a failed deploy; newest
`● Ready` Production for a live-site problem).

## Recipes

**"Why did the last deploy fail?"**

```bash
vercel ls --status ERROR --environment production   # grab the newest ● Error URL
vercel inspect <that-url> --logs
```

**"Production is throwing 500s right now."**

```bash
vercel logs --environment production --status-code 500 --since 30m --json | jq '.message'
```

**"Tail the app while I reproduce a bug."** (streams — background it)

```bash
vercel logs --follow --level error      # run_in_background: true, then read output
```

**"Show the build output for this preview."**

```bash
vercel inspect <preview-url> --logs
```

## Reporting back

- Quote the **specific** error lines (compile error, stack trace, failing
  module) — don't paste the whole dump into chat.
- Map the failure to the codebase: a build error points at a file/line; a
  runtime 500 usually traces to a route handler or server action. Diagnose
  app-layer failures through the repo's typed-`DomainError` conventions
  (a bare `Error` surfacing as a 500 is itself a finding — see AGENTS.md).
- If the deploy failed on something the local verify chain catches
  (`pnpm typecheck && pnpm lint && pnpm test && pnpm build`), say so — that's
  the fastest repro.

## Don't

- Don't deploy (`vercel`, `vercel --prod`, `vercel deploy`) just to read logs —
  that ships code. This skill is read-only.
- Don't run `vercel login` / `vercel link` non-interactively — hand interactive
  auth/linking to the user.
- Don't edit `.vercel/project.json` to silence the stale-link warning.
- Don't surface env-var **values** if a build log echoes them.
