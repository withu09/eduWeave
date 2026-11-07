@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
docker compose --env-file ".env.bailian" down --remove-orphans
if errorlevel 1 (
  powershell -NoProfile -Command "Write-Host '停止时发生错误，请查看上方提示。' -ForegroundColor Red"
) else (
  powershell -NoProfile -Command "Write-Host '已停止项目，数据库数据已安全保留。' -ForegroundColor Green"
)
pause
