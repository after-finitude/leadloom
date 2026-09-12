# Context7 и документация, использованные при создании

Дата обращения: 10 сентября 2026 года.

## Выполненные запросы Context7

1. `resolve-library-id`: Next.js → `/vercel/next.js`.
   `query-docs`: standalone output и rewrites `/api` в отдельный NestJS backend.
   Документация получена, **но Next.js не вошёл в автономную редакцию** после установления недоступности загрузки npm-пакетов. Этот запрос не выдаётся за аудит или реализацию Next.js.
2. `resolve-library-id`: Node.js → `/websites/nodejs_latest-v22_x_api`.
   `query-docs`: `node:sqlite DatabaseSync`, prepared statements `run/get/all` и `exec` для SQL-транзакций.
   Полученные API реально применены в `src/db.mjs`, `src/schema.sql` и `src/service.mjs`, затем проверены локальным Node.js 22.16.0.

## Первичные источники

- Node SQLite: https://nodejs.org/docs/latest-v22.x/api/sqlite.html
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- Google Calendar events.insert: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Resend idempotency keys: https://resend.com/docs/dashboard/emails/idempotency-keys
- Next.js standalone output, изученный, но не использованный: https://nextjs.org/docs/app/api-reference/config/next-config-js/output

Чтение документации не заменяет выполнение тестов. Локальные тесты подтверждают перечисленные в отчётах сценарии, а не готовность настоящих аккаунтов Google/Resend/OpenAI. Число «0 vulnerabilities» при создании lockfile без зависимостей не является независимым security audit приложения.
