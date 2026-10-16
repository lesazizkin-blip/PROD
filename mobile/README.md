# MoverMate — мобильное приложение

React Native + Expo (SDK 58, TypeScript), навигация `expo-router`, UI — React Native Paper (Material 3).
Контракт API — `../docs/API.md`; типы — `src/api/types.ts`, клиент — `src/api/client.ts` и `src/api/endpoints.ts`.

## Быстрый старт в iOS-симуляторе

Нужны Xcode (с принятой лицензией и установленной iOS-платформой), Node и Python-окружение бэкенда (`make backend-setup`).

```bash
make mobile-setup   # один раз: зависимости приложения
make dev            # терминал 1: миграции, демо-данные и бэкенд на :8000
make ios            # терминал 2: Expo и симулятор iPhone (Expo Go ставится сам)
```

Симулятор видит бэкенд по `http://localhost:8000`. В приложении нажмите «Открыть демо-проект» (готовые задачи и 14 коробок) или создайте свой.

## Запуск

```bash
cd mobile
npm install
cp .env.example .env      # укажите EXPO_PUBLIC_API_URL
npx expo start            # QR в терминале: открыть в Expo Go на телефоне
```

Проверки: `npm run typecheck`, `npx expo-doctor`.

## Структура

| Путь | Что |
|---|---|
| `src/app/(tabs)/` | 4 экрана: План, Коробки, Этикетки, Прогресс |
| `src/app/projects/[pid]/boxes/[n].tsx` | карточка коробки; сюда ведёт QR `movermate://projects/{pid}/boxes/{n}` |
| `src/api/` | типы, HTTP-клиент с таймаутом и единым форматом ошибок, функции по эндпоинтам |
| `src/ui/` | общие компоненты: `StateView` (загрузка / ошибка / пусто), `NoProject`, `HealthBadge` |
| `src/state/` | `ProjectContext` (проекты на устройстве, AsyncStorage), `useAsync` |
| `src/storage/` | чтение и запись списка проектов |

## Сборка APK

```bash
npx eas-cli login
npx eas-cli build -p android --profile preview   # готовый .apk скачать и положить в releases/
```

Требования: HTTPS-адрес сервера (Android блокирует обычный HTTP); аккаунт Expo; iOS-сборка не поддерживается (нужен Apple Developer).
