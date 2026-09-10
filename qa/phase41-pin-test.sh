#!/bin/bash
# Phase 41 QA: server-side pinned notes end-to-end verification.
set -e
cd /root/vega-crm

# 1. Fresh QA cookie (vega.sterling SUPER_ADMIN)
COOKIE=$(docker run --rm -v /root/vega-crm:/app -w /app \
  -e SESSION_SECRET="$(grep SESSION_SECRET .env | cut -d'"' -f2)" \
  node:22-slim node qa/mint-cookie.mjs \
  fafc63fb-db10-49d4-b3ba-3f7974e464e1 vega.sterling@mdusolutions.com 'Vega Sterling' SUPER_ADMIN)
echo "$COOKIE" > /tmp/qa-cookie.txt

COMPID=cmrxhpibz0h9eccqpcyt2s2ukb653zqzaie3qdhn5z64
CID=cmrxu8he7lbddkwwlg5h73agsmz30obgy9qc07z428bs
TID=cmrxkneb300009nph1q2bem5q

TS=$(date +%s)
NOTE1_ID=$(curl -s -H "Cookie: $COOKIE" -H 'Content-Type: application/json' -X POST https://earth.servers.onl/api/activities \
  -d "{\"type\":\"NOTE\",\"tenantId\":\"$TID\",\"companyId\":\"$COMPID\",\"contactId\":\"$CID\",\"subject\":\"QA pin test A $TS\",\"description\":\"Phase 41 pin QA note A\"}" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
NOTE2_ID=$(curl -s -H "Cookie: $COOKIE" -H 'Content-Type: application/json' -X POST https://earth.servers.onl/api/activities \
  -d "{\"type\":\"NOTE\",\"tenantId\":\"$TID\",\"companyId\":\"$COMPID\",\"contactId\":\"$CID\",\"subject\":\"QA pin test B $TS\",\"description\":\"Phase 41 pin QA note B\"}" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
echo "NOTE1=$NOTE1_ID NOTE2=$NOTE2_ID"

# 2. Pin NOTE1
P1=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -X PUT "https://earth.servers.onl/api/activities/$NOTE1_ID" -d '{"isPinned": true}')
echo "PIN_A_HTTP=$P1"

# 3. Pin NOTE2 — should clear NOTE1's pin (one per record)
P2=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -X PUT "https://earth.servers.onl/api/activities/$NOTE2_ID" -d '{"isPinned": true}')
echo "PIN_B_HTTP=$P2"

# 4. Read back via list API (the endpoint the record pages consume)
LIST=$(curl -s -H "Cookie: $COOKIE" "https://earth.servers.onl/api/activities?contactId=$CID&limit=100")
echo "$LIST" | python3 -c "
import json,sys
d = json.load(sys.stdin)['data']
a1 = next(a for a in d if a['id'] == '$NOTE1_ID')
a2 = next(a for a in d if a['id'] == '$NOTE2_ID')
print('NOTE1_isPinned (expect False):', a1['isPinned'])
print('NOTE2_isPinned (expect True): ', a2['isPinned'])
print('NOTE2_pinnedAt set (expect True):', bool(a2['pinnedAt']))
assert a1['isPinned'] is False, 'FAIL: note A still pinned'
assert a2['isPinned'] is True, 'FAIL: note B not pinned'
assert a2['pinnedAt'], 'FAIL: pinnedAt missing'
print('ONE_PIN_PER_RECORD=PASS')
"

# 5. Unpin NOTE2
U=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -X PUT "https://earth.servers.onl/api/activities/$NOTE2_ID" -d '{"isPinned": false}')
echo "UNPIN_HTTP=$U"
curl -s -H "Cookie: $COOKIE" "https://earth.servers.onl/api/activities?contactId=$CID&limit=100" | python3 -c "
import json,sys
d = json.load(sys.stdin)['data']
a2 = next(a for a in d if a['id'] == '$NOTE2_ID')
assert a2['isPinned'] is False, 'FAIL: still pinned after unpin'
print('UNPIN=PASS')
"

# 6. Pages render (client-fetched APIs already proven above; check page shells)
for p in "/contacts/$CID" "/companies/$COMPID" /dashboard; do
  printf 'PAGE %-45s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: $COOKIE" "https://earth.servers.onl$p")"
done

echo 'PHASE41_QA=PASS'