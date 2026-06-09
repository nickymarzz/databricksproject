@echo off
title Databricks Project Analytics Dashboard
echo ==============================================================
echo   Databricks Project Analytics Platform Launcher
echo ==============================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking python dependencies...
python -c "import fastapi, uvicorn, pandas" 2>nul
if %errorlevel% neq 0 (
    echo [!] Missing dependencies. Installing via pip...
    pip install fastapi uvicorn pandas
) else (
    echo [✓] All required packages (FastAPI, Uvicorn, Pandas) are installed.
)

echo.
echo [2/3] Launching Uvicorn backend server on port 8000...
start /b python -m uvicorn main:app --host 127.0.0.1 --port 8000

echo.
echo [3/3] Opening dashboard in your default browser...
timeout /t 3 >nul
start http://127.0.0.1:8000

echo.
echo ==============================================================
echo   The server is running in the background!
echo   To stop the server:
echo     - Close this Command Prompt window, OR
echo     - Run taskkill /f /im python.exe in another window
echo ==============================================================
echo.
pause
