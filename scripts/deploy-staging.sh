#!/usr/bin/env bash
# Everything that has to be deployed for the app to work, in the order it has
# to happen.
#
# Idempotent: run it again after a partial failure, a rules change or a new
# function, and it converges. It deploys **rules before functions** and content
# last, so a window where the functions are live and the rules are not cannot
# exist.
#
#   FIREBASE_PROJECT=dananeh-staging ./scripts/deploy-staging.sh
#   FIREBASE_PROJECT=dananeh-staging ./scripts/deploy-staging.sh --with-content
#
# Requires `firebase login` (or a service account in GOOGLE_APPLICATION_
# CREDENTIALS). It never prints a credential.
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WITH_CONTENT=0
[[ "${1:-}" == "--with-content" ]] && WITH_CONTENT=1

[ -n "$PROJECT" ] || { echo "Set FIREBASE_PROJECT to the project to deploy to." >&2; exit 1; }
case "$PROJECT" in
  demo-*) echo "\"$PROJECT\" is an emulator project — use \`npm run emulators\`." >&2; exit 1 ;;
  *wisdom-wafers*) echo "\"$PROJECT\" is the pre-rebrand project; the beta uses a clean environment." >&2; exit 1 ;;
esac

command -v firebase >/dev/null || { echo "firebase-tools is not installed: npm i -g firebase-tools" >&2; exit 1; }

cd "$ROOT"

echo
echo "→ Deploying to $PROJECT"
echo

# The schema package and the functions are compiled first: Cloud Functions runs
# Node, so `@dananeh/content-schema` has to exist as JavaScript before a deploy
# can carry it.
echo "· building functions"
npm run build:functions >/dev/null

# Rules and indexes before functions. A function that writes a shape the rules
# refuse is a bad deploy; a function that is live while the rules are still open
# is a worse one.
echo "· firestore rules and indexes"
firebase deploy --project "$PROJECT" --only firestore:rules,firestore:indexes --non-interactive

echo "· storage rules"
firebase deploy --project "$PROJECT" --only storage --non-interactive

echo "· functions"
firebase deploy --project "$PROJECT" --only functions --non-interactive

echo
echo "· deployed functions"
firebase functions:list --project "$PROJECT" || true

if [ "$WITH_CONTENT" -eq 1 ]; then
  echo
  echo "· staff, app config and the launch catalogue, through the real pipeline"
  FIREBASE_PROJECT="$PROJECT" npm run bootstrap:project -- --confirm
fi

echo
echo "Deployed. Verify with:"
echo "  APP_VARIANT=staging npm run verify:env"
