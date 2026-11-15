@echo off
title Demo Lottery Server
cd /d C:\Users\win\demo-lottery\server
echo ============================================
echo   Demo Lottery Server - http://localhost:4000
echo   Server will auto-restart if it crashes.
echo   Close this window to stop the server.
echo ============================================
:loop
"C:\Program Files\nodejs\node.exe" src\index.js
echo.
echo [%date% %time%] Server exited - restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
