@echo off
setlocal
cd /d "%~dp0"
set LOG=%~dp0scratch\build-apk.log
echo START %DATE% %TIME% > "%LOG%"
if not defined JAVA_HOME (
  if exist "C:\Program Files\Android\openjdk\jdk-21.0.8\bin\java.exe" set "JAVA_HOME=C:\Program Files\Android\openjdk\jdk-21.0.8"
)
if not defined JAVA_HOME (
  if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
)
if not defined JAVA_HOME (
  if exist "%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%LOCALAPPDATA%\Programs\Android Studio\jbr"
)
echo JAVA_HOME=%JAVA_HOME% >> "%LOG%"
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo === npm run build >> "%LOG%"
call npm run build >> "%LOG%" 2>&1
if errorlevel 1 goto fail
echo === cap sync >> "%LOG%"
call npx cap sync android >> "%LOG%" 2>&1
if errorlevel 1 goto fail
echo === gradle >> "%LOG%"
cd android
call gradlew.bat assembleDebug --no-daemon >> "%LOG%" 2>&1
if errorlevel 1 goto fail
cd ..
copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "Spota-latest.apk" >> "%LOG%" 2>&1
echo BUILD_OK %DATE% %TIME% >> "%LOG%"
echo.
echo APK ready: Spota-latest.apk
timeout /t 10
exit /b 0
:fail
echo BUILD_FAILED %DATE% %TIME% >> "%LOG%"
echo Build failed - see scratch\build-apk.log
pause
