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
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --with-content) WITH_CONTENT=1 ;;
    --dry-run)      DRY_RUN=1 ;;
    *) echo "unknown option: $arg" >&2; exit 1 ;;
  esac
done

[ -n "$PROJECT" ] || { echo "Set FIREBASE_PROJECT to the project to deploy to." >&2; exit 1; }
case "$PROJECT" in
  demo-*) echo "\"$PROJECT\" is an emulator project — use \`npm run emulators\`." >&2; exit 1 ;;
  *wisdom-wafers*) echo "\"$PROJECT\" is the pre-rebrand project; the beta uses a clean environment." >&2; exit 1 ;;
esac

cd "$ROOT"

# ---------------------------------------------------------------------- preflight
#
# What this is about to change, before it changes anything.
#
# A deploy script that asks for a project id and then starts writing gives the
# owner one chance to read the target — in the command they just typed. This
# prints the target, the rules and indexes that will replace whatever is there,
# the functions that will be deployed, and whether content will be published,
# and exits without touching the project.
if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run — nothing will be written."
  echo
  echo "  project        $PROJECT"
  echo "  firestore      firestore.rules, firestore.indexes.json"
  echo "  storage        storage.rules"
  echo "  functions      $(grep -c '^export const' functions/src/index.ts) exported, region $(grep -o "region: '[^']*'" functions/src/index.ts | head -1 | cut -d"'" -f2)"
  echo "  content        $([ "$WITH_CONTENT" -eq 1 ] && echo 'yes — staff claims, appConfig/public, launch catalogue through publishSeed' || echo 'no (pass --with-content)')"
  echo
  echo "  Functions that would be deployed:"
  grep -o '^export const [a-zA-Z]*' functions/src/index.ts | sed 's/^export const /    /'
  echo
  echo "  Indexes that would be applied:"
  node -e "const i=require('./firestore.indexes.json');for(const x of i.indexes??[])console.log('    '+x.collectionGroup+': '+x.fields.map(f=>f.fieldPath).join(', '))"
  echo
  echo "  Already deployed there now:"
  firebase functions:list --project "$PROJECT" 2>/dev/null || echo "    (cannot read — not authenticated, or the project does not exist yet)"
  echo
  echo "Re-run without --dry-run to apply."
  exit 0
fi

# Only the real thing needs the CLI; the dry run above writes nothing and is
# useful before anyone has installed or authenticated anything.
command -v firebase >/dev/null || { echo "firebase-tools is not installed: npm i -g firebase-tools" >&2; exit 1; }

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
