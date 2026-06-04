#!/usr/bin/env bash
#
# Run the Playwright e2e suite with the test env loaded from apps/web/.env.local.
#
# Why this exists: Playwright does NOT auto-load .env.local, and a plain
# `source .env.local` chokes on a special-char value in that file. This loads
# only the e2e vars (robust against odd values) and forwards every argument to
# `playwright test`, so all the package `e2e*` scripts share one entry point.
#
#   pnpm e2e:ui                                          # UI mode (no args → safe)
#
# To pass args (a spec, --grep, --headed), call this script DIRECTLY — going
# through `pnpm e2e -- <args>` double-wraps the args and Playwright reports
# "No tests found":
#   ./scripts/e2e.sh persona-marcus-buyer --grep "buys a ticket" --headed
#   ./scripts/e2e.sh persona-mark-pro-host --ui
#   ./scripts/e2e.sh --workers=1
#
# In CI (no .env.local) it skips the load and behaves like a bare
# `playwright test`, so the CI-provided env wins.
set -euo pipefail
cd "$(dirname "$0")/.." # apps/web

# The Supabase Realtime cleanup client throws on Node 20; the suite needs 22.
node_major="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
if [ "${node_major:-0}" -lt 22 ]; then
  echo "⚠️  Node ${node_major} detected — e2e needs Node 22 (run 'nvm use' first)." >&2
fi

if [ -f .env.local ]; then
  while IFS='=' read -r k v; do
    case "$k" in
      TEST_*|PLAYWRIGHT_BASE_URL|E2E_CLEANUP_SUPABASE_URL|E2E_CLEANUP_SUPABASE_SECRET_KEY)
        export "$k=$v"
        ;;
    esac
  done < <(grep -E '^(TEST_[A-Z_]+|PLAYWRIGHT_BASE_URL|E2E_CLEANUP_SUPABASE_[A-Z_]+)=' .env.local || true)
fi

# Call the local Playwright binary directly — pnpm puts node_modules/.bin on
# PATH for this script, and a nested `pnpm exec` double-wraps args ("No tests
# found"). Fall back to npx if it isn't on PATH (script run outside pnpm).
if command -v playwright >/dev/null 2>&1; then
  exec playwright test "$@"
else
  exec npx --no-install playwright test "$@"
fi
