@echo off
title Databricks Project Analytics Dashboard
echo ==============================================================
echo   Databricks Project Analytics Platform Launcher
echo ==============================================================
echo.

cd /d "%~dp0"

set "PYTHON_EXE=D:\PY\envs\my_env3\python.exe"
if not exist "%PYTHON_EXE%" (
    echo [!] Custom python env not found at %PYTHON_EXE%
    echo     Falling back to system 'python'
    set "PYTHON_EXE=python"
)

echo Using Python: %PYTHON_EXE%
echo.

echo [1/3] Checking python dependencies...
"%PYTHON_EXE%" -c "import fastapi, uvicorn, pandas" 2>nul
if %errorlevel% neq 0 (
    echo [!] Missing dependencies. Installing via pip...
    "%PYTHON_EXE%" -m pip install fastapi uvicorn pandas
) else (
    echo [✓] All required packages are installed.
)

echo.
echo [2/3] Launching Uvicorn backend server on port 8000...
start /b "" "%PYTHON_EXE%" -m uvicorn main:app --host 127.0.0.1 --port 8000

echo.
echo [3/3] Opening dashboard in your default browser...
ping 127.0.0.1 -n 4 >nul
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
