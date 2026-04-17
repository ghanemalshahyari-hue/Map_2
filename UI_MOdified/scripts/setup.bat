@echo off
setlocal EnableDelayedExpansion
title Ops Planner - One-Click Setup
rem Change to the project root (one level up from scripts\)
cd /d "%~dp0.."

echo.
echo  =====================================================
echo    Ops Planner  -  One-Click Setup and Launch
echo  =====================================================
echo.

:: -------------------------------------------------------
:: STEP 1 - Check for Node.js
:: -------------------------------------------------------
echo  [1/4] Checking for Node.js...
call :CHECK_NODE
if "!NODE_READY!"=="1" (
    echo        Found: !NODE_VER!
    goto :CHECK_MBTILES
)

echo        Not found. Downloading Node.js LTS...
echo        (Requires internet connection - about 30 MB)
echo.

set "ARCH=x64"
if "%PROCESSOR_ARCHITECTURE%"=="x86" (
    if not defined PROCESSOR_ARCHITEW6432 set "ARCH=x86"
)

set "NODE_URL=https://nodejs.org/dist/v20.17.0/node-v20.17.0-%ARCH%.msi"
set "NODE_MSI=%TEMP%\node_installer.msi"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Write-Host '  Downloading Node.js...' -NoNewline; " ^
    "try { Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%NODE_MSI%' -UseBasicParsing; Write-Host ' OK' } " ^
    "catch { Write-Host ' FAILED'; exit 1 }"

if %errorlevel% neq 0 (
    echo  ERROR: Download failed. Check your internet connection.
    pause & exit /b 1
)

echo  Installing Node.js (may ask for admin permission)...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "Start-Process msiexec.exe -Wait -Verb RunAs -ArgumentList '/i','\"%NODE_MSI%\"','/quiet','/norestart','ADDLOCAL=ALL'"

for /f "tokens=2*" %%A in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v "Path" 2^>nul') do set "SYS_PATH=%%B"
for /f "tokens=2*" %%A in ('reg query "HKCU\Environment" /v "Path" 2^>nul') do set "USR_PATH=%%B"
set "PATH=!SYS_PATH!;!USR_PATH!"

call :CHECK_NODE
if "!NODE_READY!"=="1" (
    echo  Node.js installed: !NODE_VER!
    goto :CHECK_MBTILES
)

echo.
echo  Node.js installed but requires a restart to take effect.
echo  Please RESTART this computer and run setup.bat again.
echo.
pause & exit /b 1


:: -------------------------------------------------------
:: STEP 2 - Check .mbtiles file is present
:: -------------------------------------------------------
:CHECK_MBTILES
echo.
echo  [2/4] Checking for map file...
set "MBTILES_FOUND=0"
for %%F in ("maps\*.mbtiles") do set "MBTILES_FOUND=1"

if "!MBTILES_FOUND!"=="1" (
    for %%F in ("maps\*.mbtiles") do echo        Found: %%~nxF
) else (
    echo.
    echo  =====================================================
    echo    WARNING: No .mbtiles file found in maps/
    echo  =====================================================
    echo.
    echo  The offline satellite map will not work until you
    echo  copy your .mbtiles file into this folder:
    echo.
    echo    %~dp0..\maps\
    echo.
    echo  The app will still open with the online map.
    echo  Press any key to continue anyway...
    pause >nul
)


:: -------------------------------------------------------
:: STEP 3 - npm install
:: -------------------------------------------------------
echo.
echo  [3/4] Installing app dependencies...

:: Force reinstall if sql.js is missing (new dependency)
if not exist "node_modules\sql.js\package.json" (
    echo        Installing (first time or updated dependencies)...
    if exist "node_modules\better-sqlite3" (
        echo        Removing old dependency...
        rmdir /s /q "node_modules\better-sqlite3" >nul 2>&1
    )
    call npm install --no-fund --no-audit
    if %errorlevel% neq 0 (
        echo  ERROR: npm install failed.
        pause & exit /b 1
    )
    echo        Done.
) else (
    echo        Already installed.
)


:: -------------------------------------------------------
:: STEP 4 - Launch servers and open browser
:: -------------------------------------------------------
:LAUNCH
echo.
echo  [4/4] Starting servers...

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8080 " 2^>nul') do taskkill /PID %%P /F >nul 2>&1
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8000 " 2^>nul') do taskkill /PID %%P /F >nul 2>&1

:: Start tile server - VISIBLE so you can see any errors
echo        Starting tile server  (port 8080)...
start "Ops Planner - Tile Server [keep open]" cmd /k "node server\tile-server.js"

:: Wait for tile server to load the .mbtiles into memory
echo        Loading map data (may take a moment for large files)...
timeout /t 5 /nobreak >nul

:: Start web server - minimized
echo        Starting web server   (port 8000)...
start "Ops Planner - Web Server" /min cmd /k "node server\web-server.js"
timeout /t 2 /nobreak >nul

:: Open browser
start "" "http://localhost:8000"

echo.
echo  =====================================================
echo    Ops Planner is running at http://localhost:8000
echo  =====================================================
echo.
echo  The TILE SERVER window stays visible - if the offline
echo  map isn't working, check that window for errors.
echo.
echo  Next time: double-click setup.bat again to launch.
echo.
pause
goto :eof


:CHECK_NODE
set "NODE_READY=0"
set "NODE_VER="
for %%P in (
    node.exe
    "C:\Program Files\nodejs\node.exe"
    "C:\Program Files (x86)\nodejs\node.exe"
) do (
    %%P --version >"%TEMP%\nv.txt" 2>&1
    if !errorlevel!==0 (
        set /p NODE_VER=<"%TEMP%\nv.txt"
        set "NODE_READY=1"
        goto :eof
    )
)
goto :eof
