#!/bin/bash
# Run every Maestro flow one at a time, retrying each once — the Windows
# emulator's adb link drops under sustained load, and a whole-suite run turns
# one hiccup into a page of false failures. Exit code decides pass/fail;
# `maestro test <dir>` output formatting does not.
# Pass flow files as arguments to run a subset: `bash scripts/e2e-retry.sh .maestro/spots.yaml`.
cd "$(dirname "$0")/.." || exit 1
flows=("$@")
[ ${#flows[@]} -eq 0 ] && flows=(.maestro/*.yaml)
pass=0; fail=0; failed=()
for f in "${flows[@]}"; do
  name=$(basename "$f")
  if maestro test "$f" >/tmp/e2e-last.log 2>&1; then
    echo "PASS $name"; pass=$((pass+1)); continue
  fi
  echo "RETRY $name"
  adb devices >/dev/null 2>&1
  sleep 5
  if maestro test "$f" >/tmp/e2e-last.log 2>&1; then
    echo "PASS(retry) $name"; pass=$((pass+1))
  else
    echo "FAIL $name :: $(sed 's/\x1b\[[0-9;]*m//g' /tmp/e2e-last.log | grep -E "Assertion|Element not|not found|FAILED" | head -2 | tr '\n' ' ')"
    fail=$((fail+1)); failed+=("$name")
  fi
done
echo "e2e: $pass passed, $fail failed${failed:+ (${failed[*]})}"
exit $fail
