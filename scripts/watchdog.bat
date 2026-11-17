@echo off
rem watchdog.bat — รัน uptime-watchdog ค้างไว้ (ไว้ใน Startup folder)
cd /d C:\Users\win\demo-lottery
:loop
node scripts\uptime-watchdog.mjs
echo [watchdog] exited — restart in 10s
ping -n 11 127.0.0.1 >nul
goto loop
