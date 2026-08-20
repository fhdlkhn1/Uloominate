@echo off
setlocal enabledelayedexpansion
REM Uloominate prototype - publish this folder to a GitHub repository.
REM Run it once to set the repository up, then any time you want to push changes.

cd /d "%~dp0"

echo.
echo   Uloominate prototype - publish to GitHub
echo   ========================================
echo.

where git >nul 2>nul
if not %errorlevel%==0 (
  echo   Git is not installed.
  echo   Get it from https://git-scm.com/download/win, then run this again.
  echo.
  pause
  goto :eof
)

if not exist ".git" (
  echo   Setting this folder up as a Git repository...
  git init -b main >nul || goto :failed
)

git remote get-url origin >nul 2>nul
if not %errorlevel%==0 (
  echo   Paste the HTTPS address of your empty GitHub repository.
  echo   It looks like:  https://github.com/your-name/uloominate-prototype.git
  echo.
  set /p REPOURL="  Repository URL: "
  if "!REPOURL!"=="" (
    echo.
    echo   No URL given. Nothing was pushed.
    echo.
    pause
    goto :eof
  )
  git remote add origin "!REPOURL!" || goto :failed
)

echo.
echo   Staging files...
git add -A || goto :failed

git diff --cached --quiet
if %errorlevel%==0 (
  echo   Nothing has changed since the last publish.
) else (
  set /p MSG="  Describe this update (press Enter for 'Update prototype'): "
  if "!MSG!"=="" set MSG=Update prototype
  git commit -m "!MSG!" || goto :failed
)

echo.
echo   Pushing to GitHub...
git push -u origin main || goto :failed

for /f "delims=" %%u in ('git remote get-url origin') do set ORIGIN=%%u

echo.
echo   Pushed.  %ORIGIN%
echo.
echo   If this is the first push, turn Pages on once:
echo     1. Open the repository on github.com
echo     2. Settings  -^>  Pages
echo     3. Build and deployment  -^>  Source:  GitHub Actions
echo     4. Wait for the green tick on the Actions tab
echo.
echo   Your link then lives at:
echo     https://YOUR-NAME.github.io/YOUR-REPO/
echo.
pause
goto :eof

:failed
echo.
echo   Something went wrong - read the Git message above.
echo   Common causes: the repository URL is wrong, or you are not signed in to
echo   GitHub on this machine.
echo.
pause
