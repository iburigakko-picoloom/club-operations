@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" py -3 -m venv .venv
if errorlevel 1 goto fail
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto fail
echo Open http://127.0.0.1:8765 in your browser.
.venv\Scripts\python.exe -m server.app
goto end
:fail
echo Setup failed. Check Python 3.11 or later is installed.
pause
:end
