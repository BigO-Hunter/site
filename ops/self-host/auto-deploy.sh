#!/usr/bin/env bash
# One tick of the automatic deploy of bigospeedrun.com (phase C draft; not installed).
#
#   /opt/bigospeedrun/ops/auto-deploy.sh
#
# bigospeedrun-autodeploy.timer runs it as root every five minutes. It follows Hosted
# Isomux's auto-deploy.sh (control-plane/deploy/vps/auto-deploy.sh): one lock for the whole
# tick, stopped and hold markers, a failed list, a rollback that checks what runs, and the
# same status.json fields. The difference: there is no build on the VPS. GitHub Actions
# (.github/workflows/site-image.yml) tests, builds and pushes an image to GHCR only when the
# site changes, and moves the `main` tag to it. A tick reads that tag's digest; a new digest
# is the target. It pulls by digest, swaps with compose, checks, and rolls back by itself.
#
# GitHub reads: the registry (ghcr.io) for the tag, which is not the api.github.com rate
# limit; and one conditional api.github.com request per tick (the image workflow's newest
# run, for `waiting`). It sends the last ETag; a 304 answer does not count against the
# shared 60/h unauthenticated limit.
#
# Per-host values come from $env_dir/auto-deploy.env (0600), plain KEY=value, never run:
#   BOS_IMAGE           ghcr.io/bigospeedrun/site
#   BOS_GITHUB_REPO     bigospeedrun/site
#   BOS_IMAGE_WORKFLOW  site-image.yml
#   BOS_TAG             the tag to follow; optional, default main. A rehearsal follows
#                       rehearsal-good or rehearsal-bad (site-image-rehearsal.yml), which
#                       never move main.
# Old images: nothing else removes the images a deploy pulls, and about 30 a day pile up. After a
# SUCCESSFUL deploy (never after a rollback, in a stopped or held tick) the tick removes the old images
# of BOS_IMAGE and of nothing else (a Wall Game or Hosted image never matches the repository name). It
# keeps the running image, the rollback image (previous.env) and the 5 newest, removes at most 25 per
# tick, one at a time, never with -f and never with docker system or image prune, and logs each removal.
#   auto-deploy.sh --prune-images [--apply] [--max N]
# lists what a tick would remove (dry run); --apply removes up to N (default 25) under the deploy lock.
# For a local run and the tests: BOS_ROOT, BOS_ENV_DIR, BOS_UNIT_DIR, BOS_SYSTEMCTL,
# BOS_DOCKER, BOS_REGISTRY (registry base URL), BOS_GITHUB_API, BOS_PROBE (a command that
# prints the running image digest, instead of asking Docker), BOS_SOCKET, BOS_PRUNE_SLEEP.
set -euo pipefail
umask 077

main() {
  env_dir=${BOS_ENV_DIR:-/etc/bigospeedrun}
  root=${BOS_ROOT:-/opt/bigospeedrun}
  unit_dir=${BOS_UNIT_DIR:-/etc/systemd/system}
  systemctl=${BOS_SYSTEMCTL:-systemctl}
  docker=${BOS_DOCKER:-docker}
  registry=${BOS_REGISTRY:-https://ghcr.io}
  api=${BOS_GITHUB_API:-https://api.github.com}
  socket=${BOS_SOCKET:-/run/bigospeedrun/site.sock}
  here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
  state=$root/auto-deploy

  if [[ ${1:-} == --prune-images ]]; then
    prune_command "${@:2}"
    return
  fi

  # The status fields. `result` is this tick's outcome; the attempt fields are the last
  # deploy attempt's, kept across ticks. `deployed` and `target` are commits (the image's
  # org.opencontainers.image.revision label).
  result=error phase=start target="" deployed="" waiting=false units=unchecked
  mkdir -p "$state/attempts"
  trap write_status EXIT

  config || return 0
  deployed=$(deployed_commit) || deployed=""

  exec 9>"$root/deploy.lock"
  if ! flock -n 9; then
    result=locked phase=lock
    return 0
  fi
  converge_units

  if [[ -e $state/stopped ]]; then
    result=stopped phase=marker
    return 0
  fi
  if [[ -e $env_dir/auto-deploy.hold ]]; then
    result=held phase=marker
    return 0
  fi
  # The first install is by hand: release.env names the image that runs.
  if [[ ! -f $root/release.env || ! -f $root/compose.yaml ]]; then
    result=refused phase=install
    return 0
  fi
  deployed=$(deployed_commit) || {
    result=refused phase=current
    return 0
  }

  select_target || return 0
  deploy_target
  if [[ $result == deployed ]]; then
    write_status # the deploy result is visible before the clean-up starts
    prune_images apply "${BOS_PRUNE_MAX:-25}" "$digest" || true
  fi
}

say() { printf '%s auto-deploy: %s\n' "$(date -u +%FT%TZ)" "$*"; }

config() {
  local file=$env_dir/auto-deploy.env line key value
  [[ -d $env_dir && ! -L $env_dir && -O $env_dir && $(stat -c %a "$env_dir") == 700 ]] || {
    phase=config
    say "FAIL $env_dir must be a directory owned by this user, mode 0700"
    return 1
  }
  [[ -f $file && ! -L $file && -O $file && $(stat -c %a "$file") == 600 ]] || {
    phase=config
    say "FAIL $file must be a file owned by this user, mode 0600"
    return 1
  }
  image="" repo="" workflow="" tag=main
  while IFS= read -r line || [[ -n $line ]]; do
    [[ -z $line || $line == \#* ]] && continue
    key=${line%%=*} value=${line#*=}
    case $key in
    BOS_IMAGE) image=$value ;;
    BOS_GITHUB_REPO) repo=$value ;;
    BOS_IMAGE_WORKFLOW) workflow=$value ;;
    BOS_TAG) tag=$value ;;
    esac
  done <"$file"
  [[ $image =~ ^[a-z0-9.-]+(:[0-9]+)?/[a-z0-9._/-]+$ && $repo =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ && $workflow =~ ^[A-Za-z0-9_.-]+\.ya?ml$ && $tag =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || {
    phase=config
    say "FAIL $file must name BOS_IMAGE (registry/path), BOS_GITHUB_REPO (owner/repo) and BOS_IMAGE_WORKFLOW (file name); BOS_TAG must be a tag"
    return 1
  }
  image_path=${image#*/}
}

# The installed units follow this directory's copies, as in Hosted's auto-deploy.sh.
converge_units() {
  local name
  for name in bigospeedrun-autodeploy.service bigospeedrun-autodeploy.timer; do
    if [[ ! -f $unit_dir/$name ]]; then
      units=absent
      return 0
    fi
  done
  for name in bigospeedrun-autodeploy.service bigospeedrun-autodeploy.timer; do
    cmp -s "$here/$name" "$unit_dir/$name" && continue
    : >"$state/units-pending"
    if ! install -m 644 "$here/$name" "$unit_dir/$name"; then
      units=error
      say "FAIL could not install $name"
      return 0
    fi
  done
  if [[ -e $state/units-pending ]]; then
    if ! "$systemctl" daemon-reload || ! "$systemctl" restart bigospeedrun-autodeploy.timer; then
      units=error
      say "FAIL the units did not reload"
      return 0
    fi
    rm -f "$state/units-pending"
    say "units: installed this directory's copies"
  fi
  units=ok
}

release_digest() { sed -n 's/^BOS_SITE_IMAGE=.*@\(sha256:[0-9a-f]\{64\}\)$/\1/p' "$1" 2>/dev/null; }

deployed_commit() {
  local commit
  commit=$(cat "$root/release.commit" 2>/dev/null) || return 1
  [[ $commit =~ ^[0-9a-f]{40}$ && -n $(release_digest "$root/release.env") ]] || return 1
  echo "$commit"
}

tick_error() {
  result=tick_error phase=$1
  [[ -f $state/tick-error-since ]] || date -u +%FT%TZ >"$state/tick-error-since"
  say "FAIL $2"
}

# One conditional request: the newest run of the image workflow on main. A 304 reuses the
# saved body and does not count against the API rate limit. Prints the run's status.
image_run_status() {
  local etag code tmp
  local -a conditional=()
  tmp=$(mktemp "$state/.run.XXXXXX")
  etag=$(cat "$state/github.etag" 2>/dev/null || true)
  # Only reuse the ETag together with the body it belongs to.
  [[ -n $etag && -f $state/github.json ]] && conditional=(-H "If-None-Match: $etag")
  code=$(curl -sS -o "$tmp" -D "$tmp.headers" -w '%{http_code}' --max-time 20 \
    -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' \
    "${conditional[@]}" "$api/repos/$repo/actions/workflows/$workflow/runs?branch=main&per_page=1") || code=000
  case $code in
  200)
    mv "$tmp" "$state/github.json"
    tr -d '\r' <"$tmp.headers" | sed -n 's/^[Ee][Tt][Aa][Gg]: *//p' >"$state/github.etag"
    ;;
  304) rm -f "$tmp" ;;
  *)
    rm -f "$tmp" "$tmp.headers"
    return 1
    ;;
  esac
  rm -f "$tmp.headers"
  python3 -c 'import json,sys; runs=json.load(open(sys.argv[1])).get("workflow_runs") or [{}]; print(runs[0].get("status") or "none")' "$state/github.json"
}

# The digest the followed tag (BOS_TAG, default main) points to (a HEAD request; anonymous
# pull token).
main_digest() {
  local token digest
  token=$(curl -sS --max-time 20 "$registry/token?scope=repository:$image_path:pull" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])') || return 1
  digest=$(curl -sS -I --max-time 20 -H "Authorization: Bearer $token" \
    -H 'Accept: application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json' \
    "$registry/v2/$image_path/manifests/$tag" | tr -d '\r' | sed -n 's/^[Dd]ocker-[Cc]ontent-[Dd]igest: *\(sha256:[0-9a-f]\{64\}\)$/\1/p') || return 1
  [[ -n $digest ]] || return 1
  echo "$digest"
}

select_target() {
  local status attempts
  if ! status=$(image_run_status); then
    tick_error api "the image workflow runs could not be read"
    return 1
  fi
  if ! digest=$(main_digest); then
    tick_error registry "the registry's $tag tag could not be read"
    return 1
  fi
  rm -f "$state/tick-error-since"
  # A run that has not completed may still push a new image.
  if [[ $status != completed && $status != none ]]; then
    waiting=true
    [[ -f $state/waiting-since ]] || date -u +%FT%TZ >"$state/waiting-since"
  else
    rm -f "$state/waiting-since"
  fi
  if [[ $digest == "$(release_digest "$root/release.env")" ]]; then
    if $waiting; then result=waiting phase=image_runs; else result=up_to_date phase=select; fi
    return 1
  fi
  if grep -qx "$digest" "$state/failed" 2>/dev/null; then
    result=failed_target phase=select
    return 1
  fi
  # A pull can fail for a passing reason (network, registry). Two more ticks, then the
  # digest is marked failed.
  if ! "$docker" pull --quiet "$image@$digest" >/dev/null; then
    attempts=$(($(cat "$state/attempts/$digest" 2>/dev/null || echo 0) + 1))
    echo "$attempts" >"$state/attempts/$digest"
    if ((attempts >= 3)); then
      result=failed phase=pull
      echo "$digest" >>"$state/failed"
      rm -f "$state/attempts/$digest"
    else
      result=build_failed phase=pull
    fi
    return 1
  fi
  target=$("$docker" image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image@$digest") || target=""
  if [[ ! $target =~ ^[0-9a-f]{40}$ ]]; then
    result=refused phase=label
    target=""
    say "$digest has no commit label: not deployed"
    return 1
  fi
  return 0
}

compose() { "$docker" compose -p bigospeedrun -f "$root/compose.yaml" --env-file "$root/release.env" "$@"; }

# Which image digest runs healthy now: prints it, or fails.
running_digest() {
  local id health digest
  if [[ -n ${BOS_PROBE:-} ]]; then
    "$BOS_PROBE"
    return
  fi
  id=$(compose ps -q site) || return 1
  [[ -n $id ]] || return 1
  health=$("$docker" inspect --format '{{.State.Health.Status}}' "$id") || return 1
  [[ $health == healthy ]] || return 1
  digest=$("$docker" inspect --format '{{.Config.Image}}' "$id") || return 1
  # What Caddy reaches: the socket answers the home page and robots.txt.
  curl -fsS --max-time 10 --unix-socket "$socket" -o /dev/null http://localhost/ || return 1
  curl -fsS --max-time 10 --unix-socket "$socket" -o /dev/null http://localhost/robots.txt || return 1
  echo "${digest##*@}"
}

deploy_target() {
  local previous_commit=$deployed previous_digest running
  phase=deploy
  previous_digest=$(release_digest "$root/release.env")
  say "deploying $target ($digest) over $deployed"
  date -u +%FT%TZ >"$state/attempt-at"
  echo "$target" >"$state/attempt-target"
  cp "$root/release.env" "$root/previous.env"
  # Keep the other lines (BOS_UID, BOS_GID); replace only the image.
  {
    grep -v '^BOS_SITE_IMAGE=' "$root/release.env" || true
    printf 'BOS_SITE_IMAGE=%s@%s\n' "$image" "$digest"
  } >"$root/release.env.tmp"
  mv "$root/release.env.tmp" "$root/release.env"

  if compose up -d --wait --wait-timeout 120 >/dev/null 2>&1 && running=$(running_digest) && [[ $running == "$digest" ]]; then
    echo "$target" >"$root/release.commit"
    result=deployed phase='done'
    deployed=$target
    rm -f "$state/attempts/$digest"
  else
    say "$target did not run healthy: rolling back to $previous_commit"
    mv "$root/previous.env" "$root/release.env"
    if compose up -d --wait --wait-timeout 120 >/dev/null 2>&1 && running=$(running_digest) && [[ $running == "$previous_digest" ]]; then
      result=rolled_back phase=health
      echo "$digest" >>"$state/failed"
    else
      stop "the rollback to $previous_commit does not run healthy"
    fi
  fi
  echo "$result" >"$state/attempt-result"
}

# Remove the old images of $image. $1 is apply or dry-run, $2 the most to remove, $3 the digest of the deploy
# target (kept even when it is not among the newest: a pending image is never removed before it deploys).
# A failure here is logged and never changes the deploy result.
prune_images() {
  local mode=$1 max=$2 target=${3:-} rows created repo digest keep seen=" " newest=0 kept=0 removed=0 failed=0 left=0 wrap=()
  # previous.env is absent until the first deploy of this install; sed then fails, which is not an error here.
  keep=" $(release_digest "$root/release.env" || true) $(release_digest "$root/previous.env" || true) "
  [[ $target =~ ^sha256:[0-9a-f]{64}$ ]] && keep+="$target "
  command -v nice >/dev/null && wrap+=(nice -n 19)
  command -v ionice >/dev/null && wrap+=(ionice -c 3)
  command -v timeout >/dev/null && wrap+=(timeout 120)
  if ! rows=$("$docker" image ls --no-trunc --digests --format '{{.CreatedAt}}|{{.Repository}}|{{.Digest}}' "$image" 2>/dev/null); then
    say "prune: could not list the images of $image"
    return 1
  fi
  # Newest first, by the time as a number: the text carries a zone that changes with daylight saving time.
  # A time that does not parse counts as the newest, so such an image is kept.
  rows=$(while IFS='|' read -r created repo digest; do
    stamp=$(date -d "${created% *}" +%s 2>/dev/null) || stamp=9999999999
    printf '%s|%s|%s|%s\n' "$stamp" "$created" "$repo" "$digest"
  done <<<"$rows" | sort -t'|' -k1,1nr)
  while IFS='|' read -r stamp created repo digest; do
    # Only this repository, by its exact name, and only a real digest.
    [[ $repo == "$image" && $digest =~ ^sha256:[0-9a-f]{64}$ && $seen != *" $digest "* ]] || continue
    seen+="$digest "
    if [[ $keep == *" $digest "* ]]; then
      kept=$((kept + 1))
      continue
    fi
    if ((newest < 5)); then
      newest=$((newest + 1)); kept=$((kept + 1))
      continue
    fi
    if ((removed + failed >= max)); then
      left=$((left + 1))
      continue
    fi
    if [[ $mode != apply ]]; then
      say "prune: would remove $image@$digest (created $created)"
      removed=$((removed + 1))
      continue
    fi
    if "${wrap[@]}" "$docker" image rm "$image@$digest" >/dev/null 2>&1; then
      removed=$((removed + 1))
      say "prune: removed $image@$digest (created $created)"
    else
      failed=$((failed + 1))
      say "prune: could not remove $image@$digest (in use?)"
    fi
    sleep "${BOS_PRUNE_SLEEP:-1}"
  done <<<"$rows"
  say "prune ($mode): kept $kept, $([[ $mode == apply ]] && echo removed || echo would remove) $removed, failed $failed, left $left"
}

# auto-deploy.sh --prune-images [--apply] [--max N]: the clean-up by hand, under the deploy lock.
prune_command() {
  local mode=dry-run max="" target
  while (($#)); do
    case $1 in
    --apply) mode=apply ;;
    --max) shift; [[ ${1:-} =~ ^[1-9][0-9]{0,3}$ ]] || { echo "usage: auto-deploy.sh --prune-images [--apply] [--max N]" >&2; return 2; }; max=$1 ;;
    *) echo "usage: auto-deploy.sh --prune-images [--apply] [--max N]" >&2; return 2 ;;
    esac
    shift
  done
  # A dry run lists everything; an apply removes at most 25 unless --max says more.
  [[ -n $max ]] || { [[ $mode == apply ]] && max=25 || max=100000; }
  config || return 1
  exec 9>"$root/deploy.lock"
  flock -n 9 || { say "prune: a deploy tick holds the lock; try again"; return 1; }
  # The target is the registry's current tag; if the registry cannot be read, only the other rules apply.
  target=$(main_digest 2>/dev/null) || { target=""; say "prune: the registry's $tag digest could not be read; the target is not pinned"; }
  prune_images "$mode" "$max" "$target"
}

# Nothing unattended runs again until an operator deletes the marker.
stop() {
  result=rollback_failed phase=check
  date -u +%FT%TZ >"$state/stopped"
  say "STOPPED $1; delete $state/stopped once the site is recovered"
}

# The same fields, order and encoding as Hosted Isomux's status.json.
write_status() {
  local tmp
  tmp=$(mktemp "$state/.status.XXXXXX") || return 0
  {
    printf '{"tick_at":"%s",' "$(date -u +%FT%TZ)"
    printf '"deployed":%s,' "$(json_or_null "$deployed")"
    printf '"result":"%s","phase":"%s",' "$result" "$phase"
    printf '"target":%s,' "$(json_or_null "$target")"
    printf '"stopped":%s,' "$([[ -e $state/stopped ]] && echo true || echo false)"
    printf '"held":%s,' "$([[ -e $env_dir/auto-deploy.hold ]] && echo true || echo false)"
    printf '"waiting":%s,' "$waiting"
    printf '"waiting_since":%s,' "$(json_or_null "$($waiting && cat "$state/waiting-since" 2>/dev/null)")"
    printf '"tick_error_since":%s,' "$(json_or_null "$(cat "$state/tick-error-since" 2>/dev/null)")"
    printf '"units":"%s",' "$units"
    printf '"last_attempt":{"at":%s,"target":%s,"result":%s}}\n' \
      "$(json_or_null "$(cat "$state/attempt-at" 2>/dev/null)")" \
      "$(json_or_null "$(cat "$state/attempt-target" 2>/dev/null)")" \
      "$(json_or_null "$(cat "$state/attempt-result" 2>/dev/null)")"
  } >"$tmp"
  mv "$tmp" "$state/status.json"
}

# Every value here is a commit, a timestamp or a fixed word: nothing to escape.
json_or_null() { [[ -n $1 ]] && printf '"%s"' "$1" || printf 'null'; }

main "$@"
