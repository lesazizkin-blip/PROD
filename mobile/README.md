# MoverMate для Android

`MoverMate.apk` — готовое приложение (debug-подпись, Android 6+). Установка: скачать APK на телефон, разрешить установку из этого источника, открыть.

Приложение — оболочка Capacitor над живым сайтом: тот же API, вход (`demo` / `demo-pereezd`), данные и сканер QR (камера запрашивается при первом скане). Без сети показывает экран «Нет связи с сервером» с кнопкой «Повторить». Адрес сервера — `server.url` в `capacitor.config.json`.

Сборка (нужны JDK 21 и Android SDK 35):
```bash
cd mobile && npm ci
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=~/Library/Android/sdk npm run apk   # → mobile/MoverMate.apk
```
