@echo off
rem Change to the project root (one level up from scripts\)
cd /d "%~dp0.."
echo Starting Ops Planner web server (offline mode)...
echo.
echo Open in your browser: http://localhost:8000
echo Press Ctrl+C to stop the server.
echo.

node server\web-server.js
if %errorlevel% equ 0 goto :eof

echo.
echo Could not start server. Please install Node.js:
echo   - Node.js: https://nodejs.org/
echo.
pause
