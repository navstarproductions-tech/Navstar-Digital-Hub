# Navstar Digital Hub — Baseline Feature Register

Baseline inspected from `main` commit `565c1df736aaf308d8a3a0c21a87db29deada6dc`. This is a repository inventory, not proof that every endpoint is currently deployed or operational.

## Frontend route inventory

Routes registered in `src/App.tsx`:
- `/` Home
- `/courses`, `/services`, `/donations`
- `/portals`, `/portals/:role`, `/portals/notifications`
- `/login`, `/account`
- `/campus-life`, `/admissions-letters`, `/analytics`
- `/forum`, `/music`
- `/change-password`, `/setup`, `/admin-reset`
- `/enroll/:id`, `/admin`, `/admin/receipts`, `/payment-receipt/:id`
- Unknown paths currently fall back to Home.

Existing portals shown in the portal UI: student, tutor, admissions, principal, admin and customer service desk. Finance is recognized in authentication code. School-level roles are separately defined in migration 0007.

## API route inventory observed in repository

### Public/core
- `GET /api/health`
- `GET /api/assistant`, `POST /api/assistant`
- `GET /api/courses`, `/api/courses/:id`
- `GET /api/services`, `/api/services/:id`
- `/api/enrollments`
- `/api/donations`
- `/api/service-requests`
- `GET /api/downloads`, `/api/downloads/:id`
- `GET /api/gallery`
- `/api/site-settings`

### Authentication and customer
- `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, `/api/auth/change-password`
- `/api/customer/register`, `/api/customer/login`, `/api/customer/me`, `/api/customer/logout`, `/api/customer/cart`

### Admin
- `/api/admin/bootstrap`
- `/api/admin/cashouts`, `/api/admin/cashouts/:id`
- `/api/admin/downloads`, `/api/admin/downloads/:id`
- `/api/admin/media`
- `/api/admin/notifications`
- `/api/admin/overview`
- `/api/admin/payments`
- `/api/admin/reset-password`
- `/api/admin/service-requests`, `/api/admin/service-requests/:id`
- `/api/admin/settings`
- `/api/admin/users`

### Payments and community
- `/api/payments/stk-push`, `/api/payments/callback`, `/api/payments/receipt`
- `/api/forum/posts`, `/api/forum/comments`, `/api/forum/reactions`

The route list must be reconciled with the complete function tree and deployed runtime before release. Some methods are GET-only or POST-only; inspect individual handlers before calling them.

## Database migration inventory

Migrations present in `db/migrations`:
1. `0001_initial.sql` — core users/sessions, courses, enrolments, donations, notifications, payments, services, cashout requests, media metadata and audit logs.
2. `0002_display_references_and_payment_receipts.sql` — human-readable references and receipt-related fields/sequences.
3. `0003_navstar_course_catalog.sql` — Navstar course catalogue additions.
4. `0004_customer_messages_and_downloads.sql` — customer messages and downloads.
5. `0005_full_services_catalogue.sql` — expanded services catalogue.
6. `0006_customer_accounts_and_forum.sql` — separate customer accounts/sessions, customer carts/cart items, forum posts/comments/reactions.
7. `0007_school_erp_core.sql` — schools, memberships, academic years/terms, classes, learners, guardians, staff profiles, subjects, fee structures/items, invoices/items, payments/allocations, receipt sequences and school audit logs.
8. `0008_payment_document_receipts.sql` — internal printable payment receipt numbering.
9. `0009_user_profiles_and_enrollment_policy.sql` — user profiles/staff IDs and enrollment/profile policy settings.

**Important:** migration files existing in Git do not prove that the same versions are applied in production. Confirm the D1 migration history before planning any additional migration. Never rerun or modify existing migrations against production as a shortcut.

## Feature status snapshot

| Area | Repository evidence | Status pending full runtime verification |
|---|---|---|
| Public website | Home, Courses, Services and other public routes | Existing |
| Course catalogue/enrolment | Courses page, enrolment page, API and tables | Existing foundation |
| Learner/staff portals | Portal UI, auth roles and sessions | Existing foundation |
| Admin management | Admin UI and protected endpoints | Existing foundation |
| M-Pesa | Daraja STK/callback and payment/receipt records | Existing foundation; test end-to-end |
| Customer accounts | Customer registration/login/session | Existing foundation |
| Customer cart | Cart tables and customer cart API | Existing foundation; item types currently service/course |
| Forum | Posts/comments/reactions UI, APIs and tables | Existing foundation |
| School ERP | Extensive school schema migration 0007 | Schema foundation; full APIs, authorization and UI require verification |
| Downloads/gallery | Download and media endpoints, R2 bindings | Existing foundation; verify access policies |
| AI assistant | Widget and Pages Function | Known production POST HTTP 502; unresolved |
| Physical/digital product store | No verified complete product catalogue/order/inventory domain | Planned / audit required |
| Full LMS | No verified complete module/lesson/assignment/exam domain | Planned / audit required |
| Digital library | No verified library domain | Planned |
| Online examination centre | No verified examination domain | Planned |
| Jobs and scholarships | No verified listings/application domain | Planned |
| Appointment booking | Service request foundation exists; no verified scheduling workflow | Planned / audit required |
| Certificate verification | No verified certificate award/verification workflow | Planned |
| PWA/mobile app | No verified PWA/Android deliverable in this audit | Planned |

## Next audit checks
- Read every migration 0001–0009 and inspect the D1 migration history before designing schema changes.
- Inspect every function handler for supported methods, role checks, tenant scoping, input validation and audit logging.
- Inspect all frontend navigation and portal sections, including admin tabs and customer cart/order screens.
- Run the repository's configured checks on this feature branch: `npm ci`, `npm run build:pages`, `npm run check:functions`, and `npm run typecheck` where the available environment supports them.
- Build smoke tests for existing journeys before implementing new modules.
