#!/bin/bash
set -e

VERSION=$(grep '"version"' manifest.json | sed 's/.*"\([0-9][0-9.]*\)".*/\1/')
OUTPUT="poke-ai-v${VERSION}.zip"

rm -f "$OUTPUT"

zip -r "$OUTPUT" \
  manifest.json \
  background.js \
  content.js \
  annotation.js \
  popup/ \
  settings/ \
  icons/ \
  -x "*.DS_Store"

echo "✓ Built $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
