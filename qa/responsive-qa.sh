#!/bin/bash
# ============================================================================
# Nightly QA (2026-09-21) — Responsive hardening verification.
# Verifies the core routes render (200) after the responsive CSS/TSX changes,
# plus one record page per entity (company / contact / deal).
# / is expected to 307-redirect to /login when unauthenticated.
# Run ON earth:  bash /root/vega-crm/qa/responsive-qa.sh
# ============================================================================
set -u
cd /root/vega-crm

BASE="https://earth.servers.onl"
PASS=0
FAIL=0

# 1. Mint a fresh QA session cookie (vega.sterling SUPER_ADMIN)
COOKIE=$(docker run --rm -v /root/vega-crm:/app -w /app \
  -e SESSION_SECRET="$(grep SESSION_SECRET .env | cut -d'"' -f2)" \
  node:22-slim node qa/mint-cookie.mjs \
  fafc63fb-db10-49d4-b3ba-3f7974e464e1 vega.sterling@mdusolutions.com 'Vega Sterling' SUPER_ADMIN)
if [[ "$COOKIE" != vega_crm_session=* ]]; then
  echo "FATAL: could not mint QA cookie"
  exit 1
fi

# 2. Pick one real record id per entity from the APIs the pages consume
COMPID=$(curl -s -H "Cookie: $COOKIE" "$BASE/api/companies?limit=1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"][0]["id"])')
CID=$(curl -s -H "Cookie: $COOKIE" "$BASE/api/contacts?limit=1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"][0]["id"])')
DID=$(curl -s -H "Cookie: $COOKIE" "$BASE/api/deals?limit=1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["deals"][0]["id"])')

check() {
  # check <path> <expected-codes>  e.g. check /dashboard 200  OR  check / 200 307
  local path="$1"; shift
  local code follow hit=1
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: $COOKIE" "$BASE$path")
  follow=$(curl -s -o /dev/null -w '%{redirect_url}' -H "Cookie: $COOKIE" "$BASE$path")
  for exp in "$@"; do
    [[ "$code" == "$exp" ]] && hit=0
  done
  if [[ $hit -eq 0 ]]; then
    printf 'PASS  %-45s %s\n' "$path" "$code"
    PASS=$((PASS+1))
  else
    printf 'FAIL  %-45s %s (expected %s) redirect=%s\n' "$path" "$code" "$*" "$follow"
    FAIL=$((FAIL+1))
  fi
}

# 3. Public + authenticated page shells
# "/" 307-redirects to /login when anonymous; with a session cookie it may
# also legitimately serve 200 (redirect target depends on auth state).
check "/" 200 307
check "/login" "200"
check "/dashboard" "200"
check "/companies" "200"
check "/contacts" "200"
check "/deals" "200"
check "/tasks" "200"
check "/inbox" "200"
check "/quotes" "200"
check "/activities" "200"

# 4. One record page per entity (3-column record layout pages)
check "/companies/$COMPID" "200"
check "/contacts/$CID" "200"
check "/deals/$DID" "200"

# 5. Static sanity: the new responsive CSS shipped in the served stylesheet.
#    Prod builds minify CSS and strip comments, so verify by a durable rule:
#    the .quotes-table mobile card selector + .task-status-select override.
css_check() {
  local html css
  # Collect every CSS href referenced by the login page (authenticated pages
  # share the same global stylesheet)
  html=$(curl -s -H "Cookie: $COOKIE" "$BASE/login")
  CSS_HREFS=$(echo "$html" | grep -oE '/_next/static/(css|chunks)/[^"]*\.css' | sort -u)
  if [[ -z "$CSS_HREFS" ]]; then
    # Fallback: try the dashboard page (auth'd shell may inline differently)
    CSS_HREFS=$(curl -s -H "Cookie: $COOKIE" "$BASE/dashboard" | grep -oE '/_next/static/(css|chunks)/[^"]*\.css' | sort -u)
  fi
  local found=0
  for href in $CSS_HREFS; do
    css=$(curl -s "$BASE$href")
    if echo "$css" | grep -q "quotes-table" && echo "$css" | grep -q "task-status-select"; then
      found=1
      echo "PASS  new responsive CSS rules present in served stylesheet ($href)"
      break
    fi
  done
  if [[ $found -eq 0 ]]; then
    echo "FAIL  new responsive CSS rules not found in any served stylesheet: $CSS_HREFS"
    FAIL=$((FAIL+1))
  else
    PASS=$((PASS+1))
  fi
}
css_check

echo "----------------------------------------"
echo "QA RESULT: PASS=$PASS FAIL=$FAIL"
[[ $FAIL -eq 0 ]] && echo "NIGHTLY_RESPONSIVE_QA=PASS" || echo "NIGHTLY_RESPONSIVE_QA=FAIL"
exit $FAIL