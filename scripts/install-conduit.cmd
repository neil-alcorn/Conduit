@echo off
REM scripts/install-conduit.cmd
REM Self-contained Windows entry point for the Conduit installer.
REM Exists so a new developer never has to remember -ExecutionPolicy Bypass
REM (conduit-install-experience-v1 D2): double-click this file or run it from
REM any shell and it forwards every argument (e.g. -InPlace) to the real
REM PowerShell installer with the policy flag baked in.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-conduit.ps1" %*
exit /b %ERRORLEVEL%
