@echo off
setlocal
rem Change to the project root (one level up from scripts\)
cd /d "%~dp0.."

echo Starting Ops Planner...
echo.

rem --- 1. Check Node is on PATH ---
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not on PATH.
    echo Install it from https://nodejs.org/ then rerun this script.
    pause
    exit /b 1
)

rem --- 2. Detect a broken better-sqlite3 install (e.g. previously rebuilt for Electron) ---
set NEED_INSTALL=0
if not exist "node_modules\express\package.json"           set NEED_INSTALL=1
if not exist "node_modules\better-sqlite3\package.json"    set NEED_INSTALL=1
if "%NEED_INSTALL%"=="0" (
    node -e "new (require('better-sqlite3'))(':memory:').close()" >nul 2>&1
    if errorlevel 1 (
        echo Detected broken better-sqlite3 binary, reinstalling...
        echo.
        rmdir /s /q node_modules 2>nul
        del /f /q package-lock.json 2>nul
        set NEED_INSTALL=1
    )
)

rem --- 3. Install npm deps (skip postinstall so the prebuilt Node binary survives) ---
if "%NEED_INSTALL%"=="1" (
    echo First-time setup: installing npm dependencies. This can take a few minutes...
    call npm install --ignore-scripts --no-audit --no-fund
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed. See messages above.
        pause
        exit /b 1
    )
    echo Dependencies installed.
    echo.
    echo Fetching prebuilt better-sqlite3 binary for Node...
    call npm rebuild better-sqlite3 --update-binary
    if errorlevel 1 (
        echo.
        echo WARNING: better-sqlite3 rebuild had issues. Trying prebuild-install directly...
        pushd node_modules\better-sqlite3
        call node ..\prebuild-install\bin.js -r napi
        popd
    )
    echo.
)

rem --- 4. Final sanity check ---
node -e "new (require('better-sqlite3'))(':memory:').close()" >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: better-sqlite3 still cannot load.
    echo Run manually:  cd /d "%~dp0.." ^&^& npm rebuild better-sqlite3 --update-binary
    echo If that fails, install Visual Studio Build Tools and try:  npm install better-sqlite3 --build-from-source
    echo.
    pause
)

rem --- 5. Start the tile server (port 8080) ---
rem (Outer batch is already cd'd to project root; child windows inherit it.)
rem Free port 8080 in case a stale tile server is still bound from a previous run.
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":8080 "') do taskkill /PID %%P /F >nul 2>&1

echo [1/2] Starting tile server (port 8080)...
rem Prefer the Node tile server: it's the canonical implementation and the
rem rest of the app already requires Node + better-sqlite3. Python is a
rem fallback for environments without Node (rare here) and some Windows
rem boxes ship a "python" shim that opens the Microsoft Store instead of
rem running anything, which silently broke the offline launch.
if exist "node_modules\better-sqlite3\package.json" (
    start "Tile Server" cmd /k node server\tile-server.js
    goto tile_started
)
where python3 >nul 2>&1
if not errorlevel 1 (
    start "Tile Server" cmd /k python3 server\tile-server.py
    goto tile_started
)
where python >nul 2>&1
if not errorlevel 1 (
    start "Tile Server" cmd /k python server\tile-server.py
    goto tile_started
)
start "Tile Server" cmd /k node server\tile-server.js
:tile_started

timeout /t 3 /nobreak >nul

rem --- 6. Start the app server (port 8000) ---
echo [2/2] Starting app server (port 8000)...
start "App Server" cmd /k node server\web-server.js

timeout /t 4 /nobreak >nul

echo.
echo Opening http://localhost:8000
start http://localhost:8000

echo.
echo Done. Two windows are now open: Tile Server + App Server.
echo Close those windows to stop the servers.
pause
endlocal
