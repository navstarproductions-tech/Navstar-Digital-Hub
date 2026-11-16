# Navstar Digital Hub — Complete Ecosystem Implementation Plan

**Identity:** Navstar Digital Hub | **Motto:** HOME OF TECHNOCRATS | **Colours:** Blue, green and gold  
**Audience:** Public visitors, learners, customers, staff, partner schools, institutions and businesses  
**Working branch:** `navstar-ecosystem-phase-1`  
**Baseline:** `main` at `565c1df736aaf308d8a3a0c21a87db29deada6dc`

## Mission
Evolve the existing website into an integrated digital ecosystem for learning, institutional administration, commerce, business operations, customer services, AI productivity and community opportunities. Keep public pages and authenticated portals distinct while sharing identity, permissions, notifications and verified payment workflows where appropriate.

## Non-negotiable preservation rules
1. Preserve all existing public routes, navigation tabs, footer links, content and working journeys.
2. Preserve all existing accounts, password hashes, sessions, enrolments, applications, payment records, receipts, notifications, media and audit history.
3. Never reset, truncate, drop or bulk-rewrite production D1 data for a feature release.
4. Keep Cloudflare Pages, D1, R2 and Daraja bindings intact unless a reviewed additive migration requires change.
5. Never expose secrets in browser code, logs, commits, screenshots or user-facing errors.
6. Enforce permissions and institution-level data isolation on the server. Hiding UI controls is not authorization.
7. Use additive migrations with backup and rollback plans.
8. Work on this feature branch first. Do not merge to `main` or release to production until tests pass and release approval is given.
9. Preserve the existing blue/green/gold identity and responsive design.
10. Mark incomplete features as planned or in progress, never live.

## Baseline audit — observed in repository
- React, TypeScript and Vite frontend; Cloudflare Pages Functions in `functions/api`.
- D1 binding `DB`; R2 bindings `DOCS` and `MEDIA`.
- Existing routes include Home, Courses, Services, Donations, Portals, Login, Customer Account, Campus Life, Admissions Letters, Analytics, Forum, Music, password management, setup, Admin, receipts and enrolment.
- Roles observed in authentication code: student, tutor, admissions, principal, admin and finance.
- Migrations 0001–0009 exist. The initial migration includes users, sessions, login attempts, rate limits, system state, media assets, courses, enrolments, donations, notifications, payments, services, cashout requests and audit logs. Later migrations add display references/receipts, catalog changes, customer accounts/carts/forum, a substantial multi-school ERP schema, payment document receipts, and user profiles/enrolment policy.
- Existing UI/API work includes course catalogue/enrolment, portal sign-in, admin management, customer account, forum, payment receipts, downloads and Daraja STK/callback processing.
- AI chat and `/api/assistant` exist, but its production POST request is currently returning Cloudflare HTTP 502. This remains unresolved and is a separate reliability task.
- Migration 0007 already provides a substantial multi-school schema: schools, school memberships, academic years/terms, classes, learners, guardians, staff profiles, subjects, fee structures, invoices, payments, allocations and school audit logs. However, the Analytics page still says school account validation is not enabled, and complete operational school APIs, tenant-scoped authorization and UI workflows must be audited and completed. Do not duplicate these existing tables.
- Migration 0006 already provides customer accounts and carts (currently cart item types are service/course), and the customer API has cart routes. The Admin UI has a customer orders section. A full physical/digital product catalogue, stock ledger, checkout/order lifecycle and fulfilment still require verification/completion; extend the existing cart/order design rather than creating duplicate tables.
- Course catalogue and enrolment exist; structured modules, lessons, submissions, grading, exam scheduling and progress tracking require implementation.
- Library, examination centre, jobs, scholarships, booking and public certificate verification require audits before being described as operational.
- Start mobile delivery with an accessible installable PWA; consider a separate Android app after APIs and mobile workflows stabilize.

## Phased delivery

### Phase 1 — Foundation, audit and architecture
Inventory routes, portals, API endpoints, migrations/tables, integrations and scheduled processes. Classify each feature as live, partial, placeholder or absent. Define identity, tenant boundaries, roles/permissions, audit, backups, rollback, test coverage, feature register and release gates.
**Exit:** route/API/schema inventory verified; baseline build/type/function checks pass; no destructive production operation.

### Phase 2 — Learning management system
Course programmes, intakes, cohorts, modules, lessons, resources, learner memberships, tutor authoring, assignments, submissions, rubrics, marking, CATs, question banks, exams, controlled results, progress, completion and certificate eligibility.

### Phase 3 — Multi-institution school ERP
Institution registration/approval and isolated workspaces; school admins, principals, teachers, learners, guardians and finance roles; academic years, terms, classes, streams, subjects, timetables, admissions, attendance, staff, fee structures, invoices, balances, receipts, reconciliations, exams, marks, report cards, analytics and parent portal. Enforce tenant isolation in every API and background operation.

### Phase 4 — Commerce and business management
Product catalogue, categories, variants, pricing, images, cart, checkout, orders, fulfilment, stock locations/movements/adjustments, low-stock alerts, cashier/POS, sales, receipts, refunds, supervisor approvals, suppliers/purchases where needed, expenses, cash reconciliation and reports. Reuse Daraja only through validated payment intents and callbacks.

### Phase 5 — AI and productivity
Reliable AI service, health checks, safe errors, timeouts and usage limits; validated document upload; document explanation, analysis and summarisation; user-approved DOCX/PDF generation; file conversion. Do not send private account, payment or student data to AI without an authorized, purpose-limited workflow.

### Phase 6 — Library, examinations and opportunities
Searchable digital library with access rules and downloads; controlled online exams and marking; moderated job, internship and attachment listings; scholarship eligibility and applications; community profiles, discussions, reports, moderation and notifications.

### Phase 7 — Booking and customer services
Service catalogue, requests, quotations, appointment calendar, staff availability, confirmations/rescheduling, support tickets and status history, customer portal for orders/invoices/receipts. Public certificate verification uses non-guessable codes/QR and exposes minimal details only.

### Phase 8 — Mobile experience
Responsive accessible portals; installable PWA manifest/icons/service worker/update strategy; offline caching only for safe public or explicitly authorized content; notifications with user controls. Evaluate Android only after core mobile workflows stabilize.

### Phase 9 — Integration, security and launch
End-to-end tests for public, learner, staff, school, customer and admin journeys; permission and tenant-isolation tests; payment callback/idempotency/refund/reconciliation tests; upload validation, access controls and rate limits; backup/restore and rollback rehearsal; accessibility, performance and mobile tests; release checklist and monitoring.

## Shared architecture
- **Identity:** retain existing sessions where possible; add granular permissions. Distinguish global Navstar staff from tenant-specific school staff. Add guardian, customer, employer and institution-owner access through reviewed role design.
- **Multi-tenancy:** add institution identifiers to tenant-owned records only after schema audit. Every tenant query must verify authenticated membership server-side; never trust a submitted tenant ID alone.
- **Payments:** common payment-intent/reconciliation pattern for course fees, school fees, shop orders and bookings. Preserve Daraja callback verification, purpose/reference checks, idempotency, amount matching and audit history. Cashouts remain approval-only unless a separately approved payout integration exists.
- **Files:** use R2 with visibility, ownership, size/type limits and authorized downloads; store metadata in D1. Never expose private learner/school files via public object URLs.
- **Notifications:** shared in-app service with optional email/SMS/push, delivery status and user preferences; avoid sensitive notification previews.
- **Audit:** record actor, tenant, action, target, timestamp and safe metadata. Never log passwords, tokens, PINs, API keys or private document contents.

## Proposed domain entities — candidates, not migrations
Compare with every existing migration/table first to prevent duplication.
- Identity: institutions, institution_memberships, role_permissions, guardians, learner_guardians.
- Academics: academic_years, terms, classes, streams, subjects, class_enrolments, timetables, attendance.
- LMS: course_modules, lessons, learning_resources, course_memberships, assignments, submissions, rubrics, grades, question_banks, questions, exams, exam_attempts, exam_answers.
- Finance: fee_structures, invoices, invoice_items, payment_intents, allocations, refunds, reconciliations.
- Commerce: products, product_variants, inventory_locations, stock_movements, carts, cart_items, orders, order_items, fulfilments, suppliers, purchases.
- Library: library_items, library_categories, library_access, downloads.
- Opportunities: job_listings, job_applications, scholarships, scholarship_applications.
- Services: service_catalogue, service_requests, quotations, bookings, staff_availability, support_tickets.
- Credentials: certificates, certificate_awards, verification_codes.
- Platform: notification_preferences, notification_deliveries, feature_flags, consent_records.

Use compatible text/UUID identifiers consistent with the existing schema after verification.

## Release gates for every phase
- Existing routes and journeys continue to work.
- Server-side validation, authorization and tenant isolation are tested.
- Schema changes include additive migration and rollback notes.
- Main UI/API journeys have tests.
- TypeScript, Pages build and Functions checks pass.
- No unreviewed production database changes.
- Unfinished functionality is labelled accurately.
- Preview deployment is reviewed before production merge.

## Immediate engineering sequence
1. Complete exhaustive route, API and migration inventory.
2. Verify production schema and migration history without modifying production data.
3. Create role/permission and tenant-isolation matrix.
4. Add baseline smoke tests for public routes, authentication, enrolment, payments, receipts and forum.
5. Resolve baseline build/test failures before feature migrations.
6. After foundation verification, implement Phase 2 LMS first, designing tenant-aware foundations required for Phase 3.

## Status policy
A feature is **Live** only after frontend, backend, database, permissions, tests and deployment are verified. Designs, placeholders, disabled forms and unmerged branches remain **Planned** or **In progress**.
