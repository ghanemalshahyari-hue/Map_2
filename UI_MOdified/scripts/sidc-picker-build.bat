@echo off
REM Rebuild vendor/sidc-picker from vendor/sidc-picker-source after editing translations.
REM Run THIS file from scripts\ — do not run "npm run build" in scripts\ (no package.json here).
REM Uses modern package-lock.json (v3). If install ever hangs for 30+ min, delete node_modules only and run again.
echo Building SIDC picker from vendor\sidc-picker-source ...
setlocal
cd /d "%~dp0..\vendor\sidc-picker-source"
call npm install --no-audit --no-fund
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1
xcopy /Y /I /Q "dist\js\*" "..\sidc-picker\js\"
xcopy /Y /I /Q "dist\css\*" "..\sidc-picker\css\"
if exist "dist\favicon.ico" copy /Y "dist\favicon.ico" "..\sidc-picker\favicon.ico"
echo.
echo Done. If dist\index.html uses different script names than vendor\sidc-picker\index.html, merge script hrefs from dist\index.html into vendor\sidc-picker\index.html (keep bridge.js and custom.css).
