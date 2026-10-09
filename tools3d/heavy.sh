#!/bin/zsh
# Serialize memory-heavy jobs (tsc, full vitest, vite build, browser
# captures, sim sweeps) across every checkout and worktree on this machine.
#   tools3d/heavy.sh npx tsc --noEmit -p .
# The lock lives in /tmp so all worktrees share it; a lock whose holder has
# died is reclaimed. Waits for ~2.5 GB of reclaimable memory before starting.
LOCK=/tmp/uplandin-heavy.lock
while ! mkdir "$LOCK" 2>/dev/null; do
  if [[ -f "$LOCK/pid" ]] && ! kill -0 "$(cat "$LOCK/pid")" 2>/dev/null; then rm -rf "$LOCK"; continue; fi
  sleep 3
done
echo $$ > "$LOCK/pid"
echo "$*" > "$LOCK/cmd"
trap 'rm -rf "$LOCK"' EXIT INT TERM
for i in {1..60}; do
  avail=$(vm_stat | awk '/Pages free/ {f=$3} /Pages inactive/ {i=$3} /Pages purgeable/ {p=$3} END {printf "%d", (f+i+p)*16384/1048576}')
  (( avail > 2500 )) && break
  sleep 5
done
"$@"
