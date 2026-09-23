#!/usr/bin/env bash
# Regenerates docs/api-examples/*.json from a running API (default localhost:3001) using the demo user.
# Usage: pnpm db:seed:demo && pnpm --filter @kollektor/api dev & ; bash scripts/capture-api-examples.sh
set -euo pipefail
API=${API:-http://localhost:3001/api}
OUT=$(dirname "$0")/../docs/api-examples
mkdir -p "$OUT"
TOKEN=$(curl -s -X POST "$API/auth/sign-in/email" -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"email":"demo@kollektor.app","password":"vinilos-demo"}' -D - -o /dev/null | grep -i '^set-auth-token' | cut -d' ' -f2 | tr -d '\r')
get() { curl -s "$API$1" -H "authorization: Bearer $TOKEN" | python3 -m json.tool --no-ensure-ascii > "$OUT/$2.json"; }
get /me/profile profile
get /dashboard dashboard
get "/collection?pageSize=3&sort=value_desc" collection-list
get /collection/facets collection-facets
ITEM=$(python3 -c "import json,sys;print(json.load(open('$OUT/collection-list.json'))['items'][0]['id'])")
get "/collection/$ITEM" collection-item
get "/search?q=love" search-love
get /wishlist wishlist
get /stats/timeline stats-timeline
get /stats/breakdowns stats-breakdowns
get /achievements achievements
get /discover discover
TRACK=$(python3 -c "import json;print(json.load(open('$OUT/collection-item.json'))['release']['tracks'][0]['id'])")
get "/catalog/tracks/$TRACK/links" track-links
curl -s -X POST "$API/collection" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"purchasePrice":10}' | python3 -m json.tool --no-ensure-ascii > "$OUT/error-validation.json"
rm -f "$OUT/error-not-found.json"
echo "Saved to $OUT"
