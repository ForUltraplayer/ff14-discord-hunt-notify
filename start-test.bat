@echo off
setlocal
if exist "%~dp0ff14-discord-hunt-notify.exe" (
  "%~dp0ff14-discord-hunt-notify.exe" --test
) else (
  powershell -ExecutionPolicy Bypass -File "%~dp0scripts\restart-local-server.ps1"
)
