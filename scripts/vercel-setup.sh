#!/usr/bin/env bash
#
# Stand up the Vercel side of stride2palette: create the project, link it to the
# GitHub repo, and set every environment variable. Deploying is left to git,
# because merging to main is what deploys in this collection and a non-git
# deployment into a linked project detaches from the commit.
#
# Idempotent: safe to re-run. An existing project is reused, and an existing
# environment variable is replaced rather than duplicated.
#
# Needs, from the environment (never from arguments — arguments show up in shell
# history and process listings):
#
#   VERCEL_TOKEN                a Vercel access token
#   SUPABASE_SERVICE_ROLE_KEY   the service role key, server-only
#
# Optional; generated and printed if absent:
#
#   PALETTE_SECRET              what session cookies are signed with
#   PALETTE_BOOTSTRAP_KEY       creates the first account, then stops working
#
# Adapted from stride2do's copy of this script. Differences are this app's:
# there is no APP_PIN, because PINs live in the users table rather than in the
# environment, and no INGEST_API_KEY, because v1 has no ingest endpoint.
#
# Usage:  bash scripts/vercel-setup.sh

set -euo pipefail

PROJECT="${PROJECT:-stride2palette}"
REPO="${REPO:-Adirdan1/stride2palette}"
SCOPE="${VERCEL_SCOPE:-adirdanans-projects}"
SUPABASE_URL="${SUPABASE_URL:-https://niyfawkpjlkrspyutjmx.supabase.co}"

die() { printf '\n%s\n' "$1" >&2; exit 1; }

for required in VERCEL_TOKEN SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!required:-}" ]; then
    die "$required is not set. See the Deploy section of .claude/skills/ship-stride-app/SKILL.md."
  fi
done

# Generated rather than asked for: these are just random strings and there is no
# reason a person should have to invent them.
if [ -z "${PALETTE_SECRET:-}" ]; then
  PALETTE_SECRET="$(od -An -N48 -tx1 /dev/urandom | tr -d ' \n')"
  GENERATED_SECRET=1
fi
if [ -z "${PALETTE_BOOTSTRAP_KEY:-}" ]; then
  PALETTE_BOOTSTRAP_KEY="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
  GENERATED_BOOTSTRAP=1
fi

VC="npx --yes vercel@latest"
COMMON=(--token "$VERCEL_TOKEN" --scope "$SCOPE" --yes)

echo "==> Vercel CLI"
$VC --version >/dev/null || die "could not run the Vercel CLI"

echo "==> Project $PROJECT"
if $VC project ls "${COMMON[@]}" 2>/dev/null | grep -qE "(^|[[:space:]])$PROJECT([[:space:]]|$)"; then
  echo "    exists, reusing"
else
  $VC project add "$PROJECT" "${COMMON[@]}"
  echo "    created"
fi

echo "==> Linking this directory"
$VC link --project "$PROJECT" "${COMMON[@]}"

echo "==> Connecting the GitHub repo"
# An unlinked project cannot deploy on push, so it dies the moment someone stops
# deploying it by hand. This is the step the abandoned projects never got.
$VC git connect "https://github.com/$REPO" "${COMMON[@]}" || \
  echo "    already connected, or connect it once in the dashboard"

echo "==> Environment variables"
set_env() {
  local name="$1" value="$2"
  for target in production preview; do
    # Remove first so a re-run replaces rather than stacking a second value.
    $VC env rm "$name" "$target" "${COMMON[@]}" >/dev/null 2>&1 || true
    printf '%s' "$value" | $VC env add "$name" "$target" "${COMMON[@]}" >/dev/null
  done
  echo "    $name set (production, preview)"
}

# None of these may ever carry a NEXT_PUBLIC_ prefix: that ships them to the
# browser. They are all server-only.
set_env SUPABASE_URL "$SUPABASE_URL"
set_env SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
set_env PALETTE_SECRET "$PALETTE_SECRET"
set_env PALETTE_BOOTSTRAP_KEY "$PALETTE_BOOTSTRAP_KEY"
set_env PALETTE_TIMEZONE "${PALETTE_TIMEZONE:-Asia/Jerusalem}"

echo
echo "Vercel is ready. Push to main to deploy."
echo
if [ "${GENERATED_SECRET:-0}" = "1" ]; then
  echo "  PALETTE_SECRET         generated. Nobody types it; rotating it signs everyone out."
fi
if [ "${GENERATED_BOOTSTRAP:-0}" = "1" ]; then
  echo "  PALETTE_BOOTSTRAP_KEY  $PALETTE_BOOTSTRAP_KEY"
  echo "                         ^ type this once, on /unlock, to make the first account."
  echo "                           It stops working the moment that account exists."
fi
