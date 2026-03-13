@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\restart-live-server.ps1"
