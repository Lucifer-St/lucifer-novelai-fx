@echo off
setlocal
set "NODE_OPTIONS="
set "NODE_PATH="
"%~dp0runtime\node.exe" "%~dp0app\scripts\fx.mjs" %*
exit /b %errorlevel%
