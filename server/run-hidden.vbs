' Launch Demo Lottery Server hidden (no console window)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\win\demo-lottery\server"
sh.Run "cmd /c start-server.bat", 0, False
