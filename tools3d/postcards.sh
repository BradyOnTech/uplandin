#!/bin/zsh
# The fixed postcard set for the four core grounds: five authored review
# views each plus a long view found from the landform (a high-ground vista,
# and Sharptail's crest), on High morning, Lightweight morning and High
# evening.
#   tools3d/postcards.sh <label> [outdir]
# Every capture runs through tools3d/heavy.sh, one at a time.
# POSTCARD_CONFIGS swaps the quality:hour rows (e.g. "lite:evening").
# POSTCARD_QUERY adds review switches to the page (e.g. "cover=legacy").
# The set is one fixed day, a clear October morning: staged visits otherwise
# roll their own weather from the seed (POSTCARD_DAY="weather=snow&month=jan").
day=${POSTCARD_DAY:-weather=mild&month=oct}
label=${1:?label}; out=${2:-/tmp/uplandin-campaign/postcards}
cd "${0:A:h}/.."
typeset -A V
V[quail-fields]=truck,creek,burn,overview-south,old-fence,vista
V[sharptail-prairie]=truck,west-draw,swale,return,cover-close,crest,vista
V[pheasant-coverts]=truck,slough-shore,shelterbelt,overview-south,stubble-close,vista
V[chukar-ridge]=truck,talus,guzzler,seep-above,cairn,vista
areas=(${=POSTCARD_AREAS:-quail-fields sharptail-prairie pheasant-coverts chukar-ridge})
for area in $areas; do
  for cfg in ${=POSTCARD_CONFIGS:-high:morning lite:morning high:evening}; do
    q=${cfg%%:*}; t=${cfg##*:}
    tools3d/heavy.sh node tools3d/review-map.mjs --area $area --label $label --quality $q --tod $t \
      --views ${V[$area]} --uncapped --url ${POSTCARD_URL:-http://localhost:4517} --query "$day${POSTCARD_QUERY:+&$POSTCARD_QUERY}" --out $out/$area 2>&1 | tail -1
  done
done
