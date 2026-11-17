@echo off
rem backup-daily.bat — pg_dump ผ่าน docker postgres + ลบ dump เก่า >14 วัน
rem สำหรับ Task Scheduler (รายวัน)
cd /d C:\Users\win\demo-lottery
if not exist backups mkdir backups
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set TS=%%i
set OUT=backups\lottery-%TS%.dump
docker exec demo-lottery-postgres-1 pg_dump -U lottery -d lottery -Fc > "%OUT%"
if errorlevel 1 (
  echo [backup-daily] ERROR pg_dump failed %date% %time%
  exit /b 1
)
echo [backup-daily] %OUT% %date% %time%
rem ลบไฟล์เก่ากว่า 14 วัน
forfiles /p backups /m lottery-*.dump /d -14 /c "cmd /c del @path" 2>nul
