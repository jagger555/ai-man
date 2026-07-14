@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "PROJECT_ROOT=%ROOT%ai-man"
set "LIVETALKING_ROOT=%ROOT%LiveTalking"

if not exist "%PROJECT_ROOT%\scripts\start-local.ps1" (
  echo [错误] 未找到 ai-man：%PROJECT_ROOT%
  echo 请将 50012832作品.zip 和 50012832源码.zip 解压到同一目录。
  pause
  exit /b 1
)

if not exist "%LIVETALKING_ROOT%\app.py" (
  echo [错误] 未找到 LiveTalking：%LIVETALKING_ROOT%
  echo 请将 50012832作品.zip 和 50012832源码.zip 解压到同一目录。
  pause
  exit /b 1
)

echo 正在启动 LiveTalking、后端和前端，请稍候……
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%\scripts\start-local.ps1" -ProjectRoot "%PROJECT_ROOT%" -LiveTalkingPath "%LIVETALKING_ROOT%" -VisibleWindows %*

if errorlevel 1 (
  echo.
  echo [启动失败] 请根据上方提示检查环境，并查看：
  echo %TEMP%\ai-man-local-run\logs
  pause
  exit /b 1
)

echo.
echo 启动命令已执行。游客端：http://127.0.0.1:5173
pause
