@echo off
REM Starts the Spota web dev server (npm run dev). Close this window to stop it.
cd /d "%~dp0"
echo Starting Spota dev server...
call npm run dev
pause
