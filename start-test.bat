@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\restart-local-server.ps1"
