#!/bin/bash
# macOS/Linux: double-click or run to start the dev server and open the app preview.
cd "$(dirname "$0")/server"
[ -d node_modules ] || npm install --no-audit --no-fund
[ -f data/frontage.db ] || node scripts/dev-seed.js
(sleep 2; open http://localhost:5150/dev/app-preview 2>/dev/null || xdg-open http://localhost:5150/dev/app-preview) &
node src/index.js
