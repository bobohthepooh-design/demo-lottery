@echo off
rem รอ Docker Desktop พร้อม แล้ว start compose (เผื่อ container ไม่ขึ้นเอง)
cd /d C:\Users\win\demo-lottery
set /a n=0
:waitdocker
docker info >nul 2>&1
if %errorlevel%==0 goto up
set /a n+=1
if %n% gtr 60 goto end
ping -n 6 127.0.0.1 >nul
goto waitdocker
:up
docker compose up -d
:end
