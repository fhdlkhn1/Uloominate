@echo off
REM Uloominate prototype - double-click this file to run the prototype.
REM It starts a small local web server in this folder and opens the start page.

cd /d "%~dp0"

set PORT=8000
set URL=http://localhost:%PORT%/

where python >nul 2>nul
if %errorlevel%==0 goto :serve

where py >nul 2>nul
if %errorlevel%==0 (
  echo Uloominate prototype
  echo Serving this folder at http://localhost:%PORT%
  echo Leave this window open while you use the prototype.
  echo Press Ctrl+C here to stop.
  echo.
  start "" "%URL%"
  py -m http.server %PORT%
  goto :eof
)

echo No Python found.
echo Install Python 3 from https://www.python.org/downloads/ and run this again.
echo Make sure you tick "Add Python to PATH" during installation.
echo.
pause
goto :eof

:serve
echo Uloominate prototype
echo Serving this folder at http://localhost:%PORT%
echo Leave this window open while you use the prototype.
echo Press Ctrl+C here to stop.
echo.
start "" "%URL%"
python -m http.server %PORT%
