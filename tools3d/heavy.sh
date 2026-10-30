#!/bin/zsh
# Serialize memory-heavy jobs (tsc, full vitest, vite build, browser
# captures, sim sweeps) across every checkout and worktree on this machine.
#   tools3d/heavy.sh npx tsc --noEmit -p .
# Jobs take a ticket and run in the order they asked, like a bakery queue,
# so one job is never starved while later ones go ahead (a bare mkdir race
# left a job waiting over an hour behind five lanes). The lock and the queue
# live in /tmp so all worktrees share them; a holder or a ticket whose
# process has died is reclaimed. A copy of this script without tickets still
# takes the same lock, so old and new checkouts can run side by side.
# Waits for ~2.5 GB of reclaimable memory before starting.
LOCK=${UPLANDIN_HEAVY_LOCK:-/tmp/uplandin-heavy.lock}
QUEUE=${UPLANDIN_HEAVY_QUEUE:-/tmp/uplandin-heavy.queue}
mkdir -p "$QUEUE"
# Ticket names sort by when they were taken, then by process id.
TICKET="$QUEUE/$(date +%s).$(printf %08d $$)"
echo "$*" > "$TICKET"
# Each trap cleans up and then really exits: a zsh trap that only cleans up
# swallows the signal, and the job would run on without its ticket or lock.
trap 'rm -f "$TICKET"' EXIT
trap 'rm -f "$TICKET"; exit 130' INT
trap 'rm -f "$TICKET"; exit 143' TERM
while true; do
  for ticket in "$QUEUE"/*(N); do
    kill -0 $(( 10#${ticket:t:e} )) 2>/dev/null || rm -f "$ticket"
  done
  first=("$QUEUE"/*(N[1]))
  if [[ ${first[1]} == "$TICKET" ]] && mkdir "$LOCK" 2>/dev/null; then break; fi
  if [[ -f "$LOCK/pid" ]] && ! kill -0 "$(cat "$LOCK/pid")" 2>/dev/null; then rm -rf "$LOCK"; continue; fi
  sleep 3
done
rm -f "$TICKET"
echo $$ > "$LOCK/pid"
echo "$*" > "$LOCK/cmd"
trap 'rm -rf "$LOCK"' EXIT
trap 'rm -rf "$LOCK"; exit 130' INT
trap 'rm -rf "$LOCK"; exit 143' TERM
for i in {1..60}; do
  avail=$(vm_stat | awk '/Pages free/ {f=$3} /Pages inactive/ {i=$3} /Pages purgeable/ {p=$3} END {printf "%d", (f+i+p)*16384/1048576}')
  (( avail > 2500 )) && break
  sleep 5
done
"$@"
