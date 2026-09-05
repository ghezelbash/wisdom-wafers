#!/usr/bin/env bash
# The end-to-end suite, in order, with the things Maestro cannot do itself.
#
# Three of those, and each one used to be missing:
#
#  - **A deterministic account.** Flow 05 built an address from a variable that
#    was never set, so it was neither unique nor deterministic and flow 09 had
#    no idea what to delete. One address is minted here, per run, printed, and
#    used by both.
#  - **Airplane mode.** Flow 06 downloads a seed online, then opens it with the
#    radio off. Maestro cannot toggle the radio, so the flow is run in two
#    halves with the toggle between them.
#  - **A record.** Maestro's version, the device model and the Android release
#    go into the report beside the results, because "it passed" without them is
#    not evidence.
#
#   npm run smoke:android
#   APP_ID=com.dananeh.app.staging npm run smoke:android
set -euo pipefail

APP_ID="${APP_ID:-com.dananeh.app.staging}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FLOWS_DIR="$ROOT/.maestro"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT_DIR="${REPORT_DIR:-$ROOT/docs/qa/e2e-$STAMP}"

command -v maestro >/dev/null || { echo "maestro is not installed: https://maestro.mobile.dev" >&2; exit 1; }
command -v adb >/dev/null || { echo "adb is not on PATH: install the Android SDK platform-tools" >&2; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "no device: start an emulator or plug one in" >&2; exit 1; }

# One account per run: unique because of the stamp, deterministic because the
# stamp is printed and both flows read the same value.
export DANANEH_E2E_EMAIL="${DANANEH_E2E_EMAIL:-beta-$STAMP@dananeh-test.example}"
export DANANEH_E2E_PASSWORD="${DANANEH_E2E_PASSWORD:-Dananeh-e2e-$STAMP}"

mkdir -p "$REPORT_DIR"

MAESTRO_VERSION="$(maestro --version 2>/dev/null | head -1)"
DEVICE="$(adb shell getprop ro.product.model | tr -d '\r')"
ANDROID="$(adb shell getprop ro.build.version.release | tr -d '\r')"
SDK="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
INSTALLED="$(adb shell pm list packages "$APP_ID" | tr -d '\r')"

[ -n "$INSTALLED" ] || { echo "$APP_ID is not installed on $DEVICE" >&2; exit 1; }

{
  echo "# Android end-to-end run — $STAMP"
  echo
  echo "| | |"
  echo "|---|---|"
  echo "| App | \`$APP_ID\` |"
  echo "| Device | $DEVICE |"
  echo "| Android | $ANDROID (API $SDK) |"
  echo "| Maestro | $MAESTRO_VERSION |"
  echo "| Account | \`$DANANEH_E2E_EMAIL\` — created by flow 05, deleted by flow 09 |"
  echo
  echo "## Flows"
  echo
} > "$REPORT_DIR/README.md"

airplane() { adb shell cmd connectivity airplane-mode "$1" >/dev/null 2>&1 || true; sleep 3; }
trap 'airplane disable || true' EXIT   # however this ends, the device is online

run() {
  local label="$1"; shift
  echo "→ $label"
  if maestro test --format junit --output "$REPORT_DIR/${label//[^A-Za-z0-9]/-}.xml" "$@"; then
    echo "| $label | ✓ |" >> "$REPORT_DIR/README.md"
  else
    echo "| $label | ✗ |" >> "$REPORT_DIR/README.md"
    return 1
  fi
}

echo "| flow | result |" >> "$REPORT_DIR/README.md"
echo "|---|---|" >> "$REPORT_DIR/README.md"

failed=0

for flow in "$FLOWS_DIR"/[0-9]*.yaml; do
  name="$(basename "$flow")"

  case "$name" in
    06-*)
      # Online half: download a real bundle from Storage and verify it.
      airplane disable
      run "06-offline (online half)" -e HALF=online "$flow" || failed=1
      # Offline half: force-stopped, radio off, opened from the verified copy.
      airplane enable
      run "06-offline (offline half)" -e HALF=offline "$flow" || failed=1
      airplane disable
      ;;
    11-*)
      # Notification delivery needs a debuggable build on Android 11+. Skipped
      # loudly rather than passed quietly.
      if [ "$SDK" -ge 30 ]; then
        run "$name" "$flow" || failed=1
      else
        echo "| $name | skipped — needs API 30+, this device is API $SDK |" >> "$REPORT_DIR/README.md"
        echo "· skipping $name (API $SDK < 30)"
      fi
      ;;
    *)
      airplane disable
      run "$name" "$flow" || failed=1
      ;;
  esac
done

{
  echo
  echo "## Screenshots"
  echo
  echo 'Maestro writes them to `~/.maestro/tests/<run>/`; copy the ones named in'
  echo 'the flows (`after-signup`, `offline-relaunch`, `deep-link-refused-all`,'
  echo '`after-deletion`) next to this file.'
} >> "$REPORT_DIR/README.md"

echo
echo "Report: $REPORT_DIR/README.md"
[ "$failed" -eq 0 ] || { echo "Some flows failed." >&2; exit 1; }
echo "All flows passed."
