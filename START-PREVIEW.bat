@echo off
title Frontage dev server
cd /d "%~dp0server"
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
if not exist data\frontage.db (
  echo Seeding demo data...
  node scripts\dev-seed.js
)
echo.
echo Frontage server starting on http://localhost:5150
echo App preview:   http://localhost:5150/dev/app-preview
echo Landing page:  http://localhost:5150
echo Press Ctrl+C to stop.
echo.
start "" cmd /c "timeout /t 2 >nul & start http://localhost:5150/dev/app-preview"
node src\index.js
pause
