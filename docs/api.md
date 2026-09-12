# HTTP API автономной версии

Все маршруты имеют префикс `/api`. Публичный клиент не передаёт доверенные lead/contact IDs, owner или score. Изменения браузера требуют application/json, точного Origin и CSRF для действий существующей сессии. Cookies HttpOnly/SameSite=Strict; Secure включается при HTTPS. Webhook использует Bearer и не требует browser CSRF.

| Метод / путь | Назначение |
|---|---|
| GET /health, /meta | Состояние сервиса и безопасная публичная конфигурация |
| POST /auth/login, /auth/logout; GET /me | Вход, выход и staff CSRF |
| POST /leads/intake | Авторизованный webhook: source, event_key, name?, email?, phone?, service_type?, external_id? |
| POST /public/intake | Форма: event_key, name?, email?, phone?, service_type?; source задаёт сервер |
| GET /public/chat | Только собственные сообщения, доступная встреча и visitor CSRF |
| POST /public/chat/messages | body, key; durable обработка |
| GET /public/chat/availability | Серверные предложения слотов собственного лида |
| POST /public/chat/appointments | offerId, key; явный выбор, ответ о сохранённой операции, не фиктивное подтверждение |
| POST /public/chat/access | token → одноразовый обмен на visitor-session |
| POST /public/chat/request-access | email; нейтральный результат, доверенный канал и лимиты |
| POST /public/unsubscribe | Отдельный scoped token; без staff-логина |
| GET /leads, /conversations, /users, /contacts | Защищённые staff-списки |
| GET/PATCH /leads/:id | Профиль / {fields, locked, unlock?} |
| POST /leads/:id/messages | Ручной ответ {body,key} с Take over |
| POST /leads/:id/notes | Внутренняя заметка {body} |
| POST /leads/:id/takeover, return-to-ai, pause, resume | Независимые действия управления, reason при разрешении review |
| POST /leads/:id/restore-consent | Только admin: reason, confirmed:true |
| POST /leads/:id/stage, assign, recalculate | Стадия / менеджер / явный переход к текущей версии score |
| GET /appointments/:id/availability | Разрешённые интервалы для переноса сотрудником |
| POST /appointments/:id/cancel, reschedule | key и для переноса offerId |
| GET /runs | Сохранённые действия, операции, события intake |
| POST /runs/:id/retry | Только допустимый безопасный повтор |
| POST /operations/:id/reconcile | Сверка неопределённого внешнего результата |
| POST /intake-events/:id/resolve | contactId; ручное решение конфликта идентификаторов |
| GET/PUT /settings | Просмотр сотрудником / admin-only изменение с revision |
| GET/POST /rules | Просмотр / admin-only публикация неизменяемой версии |
| GET /outbox | Только admin в demo; локальные mock-письма |

`GET /leads` и `/conversations` возвращают объект `{items, total, page, pageSize, stats}` вместо массива. Параметры: `q` (поиск подстроки по имени, email, телефону и услуге, до 200 символов), `filter` (`all`, `attention`, `ai`, `human`, `booked`, `waiting`), `page` (от 1), `pageSize` (1–100, по умолчанию 50). `%` и `_` в поиске считаются обычными символами. Результат упорядочен по последнему изменению и ID; страница за пределами результата ограничивается последней доступной.

`total` — число записей после поиска и фильтра; `stats` содержит общие для всей базы `total`, `open`, `ai`, `attention`, `booked`, независимо от страницы и поиска. Например, `/api/leads?q=roofing&filter=ai&page=2&pageSize=50` возвращает вторую страницу подходящих лидов и общие счётчики CRM.

Лимит клиентского чата действует на лид, определённый по проверенной visitor-сессии. Форма, восстановление доступа и другие публичные маршруты сохраняют лимиты по IP; произвольный cookie их не обходит. Настройка доверенных прокси описана в `docs/runbook.md`.

Реальные точные допустимые JSON-ключи определены `allowKeys` в `src/http.mjs`/`service.mjs`; примеры воспроизводимого использования — `tests/http.test.mjs`. Это компактный контракт локальной версии, а не обещание совпадения каждой URL из ТЗ.

Результаты различают rejected (422), conflict (409), forbidden (403), unauthorized (401), accepted/pending (202) и подтверждённый результат. Отдельные команды статуса возвращают данные текущего состояния; клиент не считает 202 фактом созданной встречи.
