#!/usr/bin/env bash
# Runs the Maestro smoke suite in order, toggling airplane mode where a flow
# needs it — Maestro cannot do that itself.
set -euo pipefail

APP_ID="${APP_ID:-com.dananeh.app.staging}"
FLOWS_DIR="$(cd "$(dirname "$0")/.." && pwd)/.maestro"

command -v maestro >/dev/null || { echo "maestro is not installed: https://maestro.mobile.dev" >&2; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "no device: start an emulator or plug one in" >&2; exit 1; }

airplane() { adb shell cmd connectivity airplane-mode "$1" >/dev/null; sleep 3; }
# However the run ends, the device is left online.
trap 'airplane disable || true' EXIT

for flow in "$FLOWS_DIR"/[0-9]*.yaml; do
  name="$(basename "$flow")"
  case "$name" in
    06-*) echo "→ $name (airplane mode)"; airplane enable ;;
    *)    echo "→ $name"; airplane disable ;;
  esac
  maestro test "$flow"
done

echo
echo "Deep link, allowed:"
adb shell am start -a android.intent.action.VIEW -d "dananeh-staging:///seed/seed-anchoring" "$APP_ID"
echo "Deep link, refused (must open nothing new):"
adb shell am start -a android.intent.action.VIEW -d "dananeh-staging:////evil.example/x" "$APP_ID"
