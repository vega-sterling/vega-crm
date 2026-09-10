#!/bin/bash
# Nightly builder write-path QA: mint cookie, POST a NOTE activity, read it back on the contact page.
set -e
cd /root/vega-crm
COOKIE=$(docker run --rm -v /root/vega-crm:/app -w /app \
  -e SESSION_SECRET="$(grep SESSION_SECRET .env | cut -d'"' -f2)" \
  node:22-slim node qa/mint-cookie.mjs \
  fafc63fb-db10-49d4-b3ba-3f7974e464e1 vega.sterling@mdusolutions.com 'Vega Sterling' SUPER_ADMIN)
echo "$COOKIE" > /tmp/qa-cookie.txt

COMPID=cmrxhpibz0h9eccqpcyt2s2ukb653zqzaie3qdhn5z64
CID=cmrxu8he7lbddkwwlg5h73agsmz30obgy9qc07z428bs
TID=$(docker exec vega-crm-db psql -U vega_crm -d vega_crm -t -A -c "SELECT \"tenantId\" FROM companies WHERE id='$COMPID'")
echo "TENANT=$TID"

BODY="{\"type\":\"NOTE\",\"tenantId\":\"$TID\",\"companyId\":\"$COMPID\",\"contactId\":\"$CID\",\"subject\":\"QA smoke test\",\"description\":\"Vega nightly builder write-path QA note (safe to keep)\"}"
RES=$(curl -s -H "Cookie: $COOKIE" -H 'Content-Type: application/json' -X POST https://earth.servers.onl/api/activities -d "$BODY")
echo "POST RESULT: $(echo "$RES" | head -c 300)"

NOTEID=$(echo "$RES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "NOTE_ID=$NOTEID"

if [ -z "$NOTEID" ]; then
  echo "FAIL: no activity id returned"
  exit 1
fi

echo "--- verify note visible on contact page ---"
COUNT=$(curl -s -H "Cookie: $COOKIE" "https://earth.servers.onl/contacts/$CID" | grep -c 'QA smoke test')
echo "CONTACT_PAGE_MATCHES=$COUNT"

echo "--- verify via GET list API ---"
curl -s -H "Cookie: $COOKIE" "https://earth.servers.onl/api/activities?contactId=$CID" | grep -o 'QA smoke test' | head -1

if [ "$COUNT" -gt 0 ]; then echo "WRITE_PATH_QA=PASS"; else echo "WRITE_PATH_QA=FAIL"; exit 1; fi