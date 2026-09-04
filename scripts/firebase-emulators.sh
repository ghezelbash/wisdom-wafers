#!/usr/bin/env bash
# Runs the Firebase CLI with a JDK on PATH.
#
# The emulators need Java, and Homebrew's openjdk is keg-only — not on PATH by
# default. This keeps that detail out of every npm script and out of the
# developer's shell profile.
set -euo pipefail

# macOS ships a `java` stub that exists but fails, so test that it actually
# runs rather than that the binary is on PATH.
has_java() { java -version > /dev/null 2>&1; }

if ! has_java; then
  for candidate in /opt/homebrew/opt/openjdk/bin /usr/local/opt/openjdk/bin; do
    if [ -x "$candidate/java" ]; then
      export PATH="$candidate:$PATH"
      break
    fi
  done
fi

if ! has_java; then
  echo "The Firebase emulators need a JDK. Install one with: brew install openjdk" >&2
  exit 1
fi

# `demo-` project ids are never backed by a real project, so a stray write in a
# test can't reach production.
exec npx firebase --project "${FIREBASE_PROJECT:-demo-dananeh}" "$@"
