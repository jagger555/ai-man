@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "STOP_SCRIPT=%ROOT%ai-man\scripts\stop-local.ps1"

if not exist "%STOP_SCRIPT%" (
  echo [错误] 未找到停止脚本：%STOP_SCRIPT%
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%STOP_SCRIPT%"
echo.
echo 系统服务已停止。
pause
