# Соответствие ТЗ v1.1 и границы локальной редакции

Это не акт полной приёмки. «Локально» означает выполнение на альтернативном Node/SQLite-стеке с mock-провайдерами. Live-проверки и инфраструктура исходного ТЗ отсутствуют.

| AC | Реализация / доказательство | Граница |
|---|---|---|
| 01 | Idempotent intake, конфликт изменённого payload; domain/HTTP tests | Contact + Lead + Conversation, Opportunity физически объединена с Lead |
| 02 | Rejected intake, конфликт идентификаторов, обе политики активного Lead, ручное разрешение | Нормализация телефона принимает только явный международный формат; страну не угадывает |
| 03 | Форма, свой чат, webhook invitation, phone-only handoff, измерение первого контакта | Проверены локальные времена; SLA настоящего email не измерен |
| 04 | Один вопрос, несколько полей, отсутствие повторов; mock evaluation | Реальная модель не оценена; mock понимает ограниченные английские фразы |
| 05 | Null, optional skip, initial + максимум два уточнения, required handoff | Проверены перечисленные сценарии, не любые свободные формулировки |
| 06 | Field history, corrections, ручные locks и конфликтующие proposals | UI/бизнес-логика локально |
| 07 | Score factors, версии, независимые состояния, явный пересчёт | Демо-веса, общий бюджетный ориентир, не рыночная оценка |
| 08 | Hard reject service/area; нет автоматического nurture для Nurture/Unqualified | Локальные отрицательные тесты |
| 09 | Handoff context для human request, negative, вне FAQ, banned, LLM failure | Live recall/precision LLM не измерены |
| 10 | Ревизии, Take over во время generation, отдельные Pause/Resume/Return/Consent | Конкуренция процесса и сохранённого состояния проверена; distributed deployment нет |
| 11 | Контактный STOP, отмена pending actions, запрет implicit consent | Уже начатый запрос к внешнему провайдеру нельзя гарантированно отозвать |
| 12 | IANA timezone, DST, расписание, буфер, slot offers | Реальный freeBusy адаптер написан, Google live не вызван |
| 13 | Явный выбор, email/qualification gate, подтверждённый mock event, Booked/summary | Настоящее Google событие не создано |
| 14 | Reservation, stale offers, idempotency, lost-response unknown/reconcile | Локальные / contract tests; внешний редактор Google не атомарен с БД |
| 15 | Отмена/перенос одной встречи, сохранение старого состояния при ошибке | Проверено с mock и адаптерными контрактами, без настоящего Google |
| 16 | Две очереди по три касания, счётчик на Lead, одна активная последовательность | Шаблон письма общий для трёх касаний, не независимый редактор каждого шага |
| 17 | Проверки состояния, рабочего времени, reply cancellation и skipped backlog | SQLite durable scheduler вместо Redis/BullMQ |
| 18 | Hashed scoped tokens, одноразовый POST exchange, expiry, отдельная отписка | Безопасность API тестирована; browser E2E нативной загрузки ещё нужен |
| 19 | Перезапуск SQLite-store, claims/leases и стабильные action/operation keys | PostgreSQL/Redis не используются; локальный диск обязателен |
| 20 | LLM repair + handoff, unknown calendar/email, ошибка БД не превращается в успех | Реальные сбои поставщиков не инъецировались; контролируемые faults в тестах |
| 21 | Conversations / profile / notes / stage / fields / meeting / takeover | DOM smoke через actual HTTP bridge; native browser routing не проверен |
| 22 | Settings, rule versions, attempt log, safe retry / reconcile | Все настройки сведены в компактные endpoints |
| 23 | RBAC, public schemas, CSRF/Origin, escaping, hashed sessions, encrypted payloads, audit triggers | SQLite triggers не PostgreSQL permission model; независимый security review отсутствует |
| 24 | 24 сценария, команды и реальные mock-отчёты | Реальная модель не прогнана; не все метрики §13 реализованы в полном аналитическом виде |
| 25 | Live smoke script и реальные адаптеры поставлены | НЕ ПРОЙДЕНО: нет реальных keys/accounts/доказательств доставки и Google события |
| 26 | Код, schema, seed, ENV examples, инструкции, screenshots, Dockerfile/Compose | НЕ ПОЛНОСТЬЮ: Docker не запускался, нет публичного deployment и видео |

## Дополнительные ограничения

- Vanilla JS/CSS вместо Next.js/TypeScript/Tailwind; Node HTTP вместо NestJS; SQLite вместо PostgreSQL; DB poller вместо BullMQ/Redis. Это осознанно выделенная локальная редакция, не скрытая замена в ТЗ.
- Изменения UI доставляются polling примерно каждые 1.8 секунды, не WebSocket/SSE.
- После обновления услуг/часов/длительности администратор должен согласовать тексты FAQ и вопросов: старый FAQ-текст не переписывается автоматически. Число вопросов/тексты не являются универсальным конструктором схем.
- Email — invitation/follow-up, не входящий канал переписки. Телефонное предпочтение переводит к человеку; SMS и звонков нет.
- Входящие номера принимаются только в международной записи; исправление неверных телефонов по внешнему справочнику не выполняется.
- Нет пользовательского интерфейса регистрации/сброса пароля/управления составом сотрудников. Два начальных аккаунта создаются при пустой базе; последующее изменение ENV-паролей не меняет уже сохранённый hash. Для live используйте новую базу с нужными credentials.
- Нет механизма автоматического обновления схемы будущих несовместимых версий. Перед обновлениями делайте backup и предусмотренную миграцию.
- Отказ от автоматизации не удаляет уже существующую встречу. Автоматическое восстановление старых email-цепочек после отмены встречи не выполняется.
- Local runtime не равно production readiness. До реальных данных нужны live acceptance, инфраструктура, backup/restore test и security review.
