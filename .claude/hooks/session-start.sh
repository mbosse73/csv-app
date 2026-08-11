#!/bin/bash
# SessionStart-Hook: stellt sicher, dass die Browser-Tests sofort lauffähig sind.
# Die App selbst braucht nichts davon — index.html bleibt abhängigkeitsfrei.
set -euo pipefail

# Lokal (Laptop/CLI) nichts tun; dort entscheidet der Entwickler selbst.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# Chromium ist im Remote-Image vorinstalliert; kein erneuter Download.
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
echo 'export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1' >> "${CLAUDE_ENV_FILE:-/dev/null}"

if [ -d node_modules/playwright ]; then
  echo "Playwright bereits installiert."
else
  echo "Installiere Playwright (nur für die Tests) …"
  npm install --no-audit --no-fund --loglevel=error
fi

echo "Bereit: 'npm test' reproduziert die Befunde aus ANALYSE.md, 'npm run shot' macht einen Screenshot."
