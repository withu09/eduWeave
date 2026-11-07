@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist ".env.bailian" copy "bailian.env.example" ".env.bailian" >nul
docker info >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Write-Host '请先打开 Docker Desktop，等待右下角鲸鱼图标就绪后再双击本文件。' -ForegroundColor Yellow"
  pause
  exit /b 1
)
powershell -NoProfile -Command "Write-Host '正在启动织星 AI (EduWeave) 容器服务，请稍候...' -ForegroundColor Cyan"
docker compose --env-file ".env.bailian" up -d --build --remove-orphans
if errorlevel 1 (
  powershell -NoProfile -Command "Write-Host '启动失败，请保留上方错误信息。' -ForegroundColor Red"
  pause
  exit /b 1
)
start "" "http://localhost:5173"
powershell -NoProfile -Command "Write-Host '已成功启动！浏览器已打开 http://localhost:5173' -ForegroundColor Green"
pause
