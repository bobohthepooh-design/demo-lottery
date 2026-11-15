@echo off
title Demo Lottery Server
cd /d C:\Users\win\demo-lottery\server
echo ============================================
echo   Demo Lottery Server - http://localhost:4000
echo   ปิดหน้าต่างนี้ = ปิด server
echo ============================================
"C:\Program Files\nodejs\node.exe" src\index.js
pause
