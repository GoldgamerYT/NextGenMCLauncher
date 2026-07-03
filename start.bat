@echo off
title Atlas Craft Launcher - Dev Start
cd /d "%~dp0"

echo ==========================================
echo  Atlas Craft Launcher - Dev Environment
echo ==========================================
echo.

:: ── 1. Build Backend JAR ──────────────────────────────────────────────────
echo [1/3] Building backend JAR...
call gradlew.bat jar --rerun-tasks --quiet
if errorlevel 1 (
    echo.
    echo [ERROR] Gradle build failed! Aborting.
    pause
    exit /b 1
)
echo  Backend built successfully.
echo.

:: ── 2. Start Backend in a new window ──────────────────────────────────────
echo [2/3] Starting backend server...
start "Atlas Craft - Backend" cmd /k "java ^
  --add-opens java.base/java.lang=ALL-UNNAMED ^
  --add-opens java.base/java.util=ALL-UNNAMED ^
  --add-opens java.base/java.lang.reflect=ALL-UNNAMED ^
  --add-opens java.base/java.net=ALL-UNNAMED ^
  --add-opens java.base/java.nio=ALL-UNNAMED ^
  --add-opens java.base/sun.nio.ch=ALL-UNNAMED ^
  --add-opens java.base/java.util.concurrent=ALL-UNNAMED ^
  -jar build\libs\MCLauncher-1.0-SNAPSHOT.jar"

:: Wait a moment for the backend to start up
echo  Waiting for backend to start (3s)...
timeout /t 3 /nobreak >nul
echo.

:: ── 3. Start Electron Dev ─────────────────────────────────────────────────
echo [3/3] Starting Electron frontend...
cd electron-client
start "Atlas Craft - Electron" cmd /k "npm run electron:dev"

echo.
echo ==========================================
echo  All processes started!
echo   Backend : http://localhost:35555
echo   Vite    : http://localhost:5173
echo ==========================================
echo.
echo You can close this window. The backend and
echo Electron windows will continue running.
pause
