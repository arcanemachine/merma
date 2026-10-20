#!/usr/bin/env bash
# Break the code on purpose and run the tests: a test worth having fails. The file is always put back, however the
# run ends (failure, Ctrl+C, a killed run).
#
#   checks/mutate.sh <file> <exact text> <replacement> [test file...]
#
# The text must occur exactly once in the file. Tests default to all of test/*.test.mjs. Prints the failing tests;
# exits 0 when at least one test failed (the mutation was caught), 1 when none did.
set -euo pipefail
[ $# -ge 3 ] || { sed -n '2,9p' "$0"; exit 2; }
file=$1 from=$2 to=$3
shift 3
backup=$(mktemp)
cp "$file" "$backup"
trap 'cp "$backup" "$file"; rm -f "$backup"' EXIT INT TERM

node -e '
  const fs = require("node:fs");
  const [file, from, to] = process.argv.slice(1);
  const s = fs.readFileSync(file, "utf8");
  const n = s.split(from).length - 1;
  if (n !== 1) { console.error(`mutate.sh: the text occurs ${n} times in ${file}, not once`); process.exit(2); }
  fs.writeFileSync(file, s.replace(from, () => to));
' "$file" "$from" "$to"

out=$(timeout 120 node --test --test-timeout=10000 "${@:-test/*.test.mjs}" 2>&1 || true)
failed=$(grep '^✖' <<<"$out" | grep -vc '^✖ failing tests:' || true)
if [ "$failed" -gt 0 ]; then
  grep '^✖' <<<"$out" | grep -v '^✖ failing tests:' | sort -u
  echo "mutate.sh: caught"
else
  echo "mutate.sh: NOT caught: no test failed"
  exit 1
fi
