@echo off
echo Building Calculator APK...
echo.

cd /d "%~dp0"

echo Running flutter pub get...
call flutter pub get
if %errorlevel% neq 0 (
    echo Error: flutter pub get failed
    pause
    exit /b %errorlevel%
)

echo.
echo Building release APK...
call flutter build apk --release
if %errorlevel% neq 0 (
    echo Error: APK build failed
    pause
    exit /b %errorlevel%
)

echo.
echo APK built successfully!
echo Location: build\app\outputs\flutter-apk\app-release.apk
echo.
pause
