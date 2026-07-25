@echo off
setlocal EnableExtensions

set "PROJECT_ROOT="
set "START_ARGS=%*"

rem 1. An explicitly configured project root takes priority.
if defined AI_GUIDE_PROJECT_ROOT set "PROJECT_ROOT=%AI_GUIDE_PROJECT_ROOT%"

rem 2. When this script is inside the source package, use its own folder.
if not defined PROJECT_ROOT if exist "%~dp0scripts\start-local.ps1" set "PROJECT_ROOT=%~dp0"

rem 3. When the source folder is dragged onto this script, use that folder.
if not defined PROJECT_ROOT if not "%~1"=="" if exist "%~f1\scripts\start-local.ps1" (
    set "PROJECT_ROOT=%~f1"
    set "START_ARGS="
)

rem 4. If the script is stored elsewhere, ask the user for the extracted source folder.
if not defined PROJECT_ROOT (
    echo.
    echo Select the extracted source package folder.
    set /p "PROJECT_ROOT=Source project folder path: "
)

if not exist "%PROJECT_ROOT%\scripts\start-local.ps1" (
    echo.
    echo ERROR: scripts\start-local.ps1 was not found.
    echo Choose the extracted source package folder that contains backend, frontend, LiveTalking and scripts.
    echo.
    pause
    exit /b 1
)

echo.
echo Starting AI Digital Human Scenic Guide...
rem `%~dp0` ends in a backslash.  A backslash immediately before a closing
rem quote escapes that quote for PowerShell's native command-line parser,
rem causing later options to be absorbed into ProjectRoot.  Appending `.`
rem keeps the directory path equivalent while making the closing quote safe.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%\scripts\start-local.ps1" -ProjectRoot "%PROJECT_ROOT%." -LiveTalkingPath "%PROJECT_ROOT%.\LiveTalking" %START_ARGS%

echo.
pause
