@echo off
rem Change to the project root (one level up from scripts\)
cd /d "%~dp0.."
echo Starting Ops Planner...
echo.

echo [1/2] Starting tile server (port 8080)...
start "Tile Server" cmd /c "cd /d "%~dp0.." && python server\tile-server.py 2>nul || python3 server\tile-server.py 2>nul || (npm install 2>nul && node server\tile-server.js) & pause"

timeout /t 3 /nobreak >nul

echo [2/2] Starting app (port 8000)...
start "App Server" cmd /c "cd /d "%~dp0.." && node server\web-server.js & pause"

timeout /t 4 /nobreak >nul

echo.
echo Opening http://localhost:8000
start http://localhost:8000

echo.
echo Done. Two windows: Tile Server + App Server.
pause
