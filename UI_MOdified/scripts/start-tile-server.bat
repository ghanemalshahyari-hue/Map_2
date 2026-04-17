@echo off
rem Change to the project root (one level up from scripts\)
cd /d "%~dp0.."
echo Starting MBTiles tile server...
echo.

rem Try Python first (no install needed)
python server\tile-server.py 2>nul
if %errorlevel% equ 0 goto :eof

python3 server\tile-server.py 2>nul
if %errorlevel% equ 0 goto :eof

rem Fallback: Node.js
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install 2>nul
)
node server\tile-server.js 2>nul
if %errorlevel% equ 0 goto :eof

echo.
echo Python or Node.js required. Install Python from https://python.org
echo.
pause
