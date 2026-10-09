#!/bin/zsh
# The fixed postcard set for the four core grounds: five authored review
# views each, on High morning, Lightweight morning and High evening.
#   tools3d/postcards.sh <label> [outdir]
# Every capture runs through tools3d/heavy.sh, one at a time.
# POSTCARD_CONFIGS swaps the quality:hour rows (e.g. "lite:evening").
label=${1:?label}; out=${2:-/tmp/uplandin-campaign/postcards}
cd "${0:A:h}/.."
typeset -A V
V[quail-fields]=truck,creek,burn,overview-south,old-fence
V[sharptail-prairie]=truck,west-draw,swale,return,cover-close
V[pheasant-coverts]=truck,slough-shore,shelterbelt,overview-south,stubble-close
V[chukar-ridge]=truck,talus,guzzler,seep-above,cairn
areas=(${=POSTCARD_AREAS:-quail-fields sharptail-prairie pheasant-coverts chukar-ridge})
for area in $areas; do
  for cfg in ${=POSTCARD_CONFIGS:-high:morning lite:morning high:evening}; do
    q=${cfg%%:*}; t=${cfg##*:}
    tools3d/heavy.sh node tools3d/review-map.mjs --area $area --label $label --quality $q --tod $t \
      --views ${V[$area]} --uncapped --url ${POSTCARD_URL:-http://localhost:4517} --out $out/$area 2>&1 | tail -1
  done
done
