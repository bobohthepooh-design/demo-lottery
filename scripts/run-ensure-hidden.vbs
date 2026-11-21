' Launch ensure-docker.bat hidden at logon
Set sh = CreateObject("WScript.Shell")
sh.Run "cmd /c C:\Users\win\demo-lottery\scripts\ensure-docker.bat", 0, False
