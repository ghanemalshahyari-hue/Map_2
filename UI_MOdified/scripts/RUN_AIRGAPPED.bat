@echo off
setlocal EnableDelayedExpansion
title RMOOZ — Air-gapped launcher
rem Change to the project root (one level up from scripts\)
cd /d "%~dp0.."

echo.
echo  ============================================================
echo    RMOOZ — Tactical map (air-gapped / offline)
echo    Tile server :8080  +  Web + chat :8000
echo  ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo  Node.js was not found in PATH.
    echo  Install Node.js LTS, then run this script again.
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\better-sqlite3\package.json" (
    echo  Installing npm dependencies ^(needs internet once, or copy node_modules^)...
    call npm install --no-fund --no-audit
    if not exist "node_modules\better-sqlite3\package.json" (
        echo  npm install failed. Copy node_modules from a prepared machine or run npm install.
        echo.
        pause
        exit /b 1
    )
)

if not exist "maps" mkdir maps 2>nul

echo  Freeing ports 8080 and 8000 if still in use from a previous run...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":8080 "') do taskkill /PID %%P /F >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":8000 "') do taskkill /PID %%P /F >nul 2>&1

echo.
echo  Starting tile server + web server ^(single window; Ctrl+C stops both^)...
echo  Open: http://localhost:8000
echo  Put .mbtiles files in maps\ and check maps\maps.json
echo.

start "RMOOZ — servers" /D "%~dp0.." cmd /k npm run app

timeout /t 4 /nobreak >nul
start "" "http://localhost:8000"

echo  Browser launched. Keep the server window open while you use the app.
echo.
pause
