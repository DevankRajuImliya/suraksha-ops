# Suraksha OPS Android migration analysis

**Analysis date:** 2026-08-17  
**Repository baseline:** `master` at `7327fe9` (`this is the first stable version of the suraksha-ops`)

## Scope and evidence

This document describes the repository as it exists before Android work. The React application is the baseline product; this is an analysis and migration plan, not an Android implementation or a redesign.

Status labels used below:

- **Confirmed** — verified by tracing the checked-in source and build configuration.
- **Inferred proposal** — an Android structure suggested to preserve confirmed behavior.
- **Unknown / decision required** — not implemented or specified in this repository. It must not be invented during migration.

## 1. Executive summary

**Confirmed:** Suraksha OPS is a single-page React 19/Vite prototype for one mine (`Kargali Colliery`) and one current shift. It provides role-selected demo access, shift logs, safety hazards, a handover/acknowledgement workflow, a manager dashboard, a simulated ERP queue, an audit display, and browser printing of acknowledged handovers.

All operational data is held in one in-memory JavaScript object and persisted as one JSON value in browser `localStorage` under `suraksha-ops-state-v1`. There is no server, authentication provider, API client, database, router, PWA/service worker, network transport, Bluetooth code, Bitchat code, or test suite. The production-oriented labels in the UI should therefore not be mistaken for existing integrations.

The future Android product should preserve the current workflows and terminology but move durable business state into a transactional local Room database. It should expose the business layer through use cases and repositories, with an offline outbox and a transport abstraction. A future Bitchat adapter belongs behind that abstraction; it must not replace the OPS domain model or screen flow.

## 2. Repository inventory

### 2.1 Framework and build

| Area | Confirmed implementation |
| --- | --- |
| Framework | React `19.2.8`, React DOM `19.2.8`, JavaScript/JSX only; no TypeScript. |
| Build/dev server | Vite `8.2.1` with `@vitejs/plugin-react`; the Vite configuration only enables the React plugin. |
| Entry point | `src/main.jsx` mounts `App` into `#root` with React `StrictMode`. |
| Dependency UI/charting | `lucide-react` supplies icons; `recharts` supplies the manager pie and bar charts. |
| CSS | `src/index.css` supplies only a reset and font stack. Most UI styling is Tailwind utility class names loaded from `https://cdn.tailwindcss.com` in `index.html`. `src/App.css` is not imported and appears to be unused Vite starter CSS. |
| Lint | Flat ESLint configuration for browser JS/JSX, React Hooks, and Vite refresh; `dist` is ignored. |
| Tests | No test files and no test script or test framework configuration were found. |
| Environment/configuration | No `.env` files, backend configuration, Docker/compose files, API base URL, or Android files were found. |
| Assets | `public/favicon.svg` is referenced by `index.html`. `public/icons.svg` and `src/assets/{hero.png,react.svg,vite.svg}` are present but are not imported by the OPS UI. |

### 2.2 Source layout

The checked-in application code is intentionally compact but highly centralized:

| File | Responsibility |
| --- | --- |
| `src/main.jsx` | Browser storage adapter over `localStorage`; React DOM mount. |
| `src/App.jsx` | Constants, sample data, persistence hook, all UI primitives, every screen, role navigation, and every mutation. This is the business and presentation layer. |
| `src/index.css` | Global reset. |
| `src/App.css` | Unused starter-style CSS; it has no runtime import. |
| `index.html` | Root DOM node, page title/favicon, and Tailwind CDN script. |
| `package.json`, `vite.config.js`, `eslint.config.js` | Node/Vite/lint setup. |

There are no separate component, route, hook, service, API, model, mock-data, state-management, or utility directories. The seed data and hard-coded reference data live in `src/App.jsx`.

### 2.3 Routing, state, and data flow

**Confirmed routing:** There is no React Router, URL routing, deep linking, or route configuration. `AppShell` keeps a local `tab` state (`home`, `hazards`, `report`, `audit`, `erp`, `users`) and shows role-specific navigation entries. A screen is selected entirely in memory.

**Confirmed state management:** There is no Redux, Context, Zustand, React Query, or external store. `useAppState` owns a nullable `state` object, a loading flag, and a persistence callback. `App` owns the volatile selected user and toast list, constructs a `mutations` object, and passes `state`, `currentUser`, and `mutations` through props to screens.

**Confirmed persistence path:**

```text
First load
  -> window.storage.get("suraksha-ops-state-v1")
  -> localStorage value exists: JSON.parse it
  -> otherwise: create seedState() and write the whole object

User mutation
  -> permission check in App.jsx
  -> immutable-looking in-memory object update
  -> write the whole object back to the same localStorage key
```

The `window.storage` wrapper exposes `get`, `set`, `delete`, and `list`, but this UI uses only `get` and `set`. Persistence errors continue with in-memory data; `storageOk` is computed by the hook but is not rendered or otherwise consumed by `App`.

**Confirmed API architecture:** None. Repository searches found no `fetch`, Axios, GraphQL, WebSocket, EventSource, or HTTP endpoint use. The ERP queue is an in-process timer simulation, not a network adapter.

**Confirmed authentication:** None. The login screen asks the user to select one of four static identities. It expressly calls itself demo mode. The selected user exists only in React state, so a reload returns to the selector. All authorization checks are browser-side and are not a security boundary.

### 2.4 Confirmed current data model

All of these are plain JavaScript objects stored together in the local-storage JSON document:

| Model | Important fields and relationships |
| --- | --- |
| `Mine` | Static singleton: `id`, `name`, `code`, `dgms`. |
| `User` | Static `id`, `name`, `role`; four demo identities. |
| `Zone` | Static `id`, `name`, `underground`; five locations. |
| `ShiftInstance` | `id`, `mineId`, `shiftName`, `date`, `status`. Seed data has one `shift-current` B shift. |
| `ShiftLogEntry` | `id`, `shiftInstanceId`, `type`, `zoneId`, `authorId`, `description`, `createdAt`, `evidence` (boolean). |
| `HazardTicket` | `id`, `mineId`, `zoneId`, `description`, `riskLevel`, `status`, `reportedBy`, assignment/control/due-date fields, resolution/closure fields, `comments`, and `history`. |
| `HazardComment` | Nested in a hazard: `id`, `authorId`, `text`, `createdAt`. |
| `HazardHistoryEvent` | Nested in a hazard: `id`, `actor`, `action`, `createdAt`. |
| `HandoverRecord` | `id`, `shiftInstanceId`, `compiledBy`, `summary`, status, nested red flags/briefing notes/rejections, signature/acknowledgement fields, `pdfStatus`, and `erpStatus`. |
| `RedFlag` | Nested in a handover: `id`, `description`, `raisedBy`, `createdAt`. |
| `BriefingNote` | Nested in a handover: `id`, `text`, `authorId`, `createdAt`. |
| `HandoverRejection` | Nested in a handover: `id`, `rejectedBy`, `reason`, `createdAt`. |
| `ErpQueueEntry` | `id`, `entityType`, `entityId`, `status`, `attempts`, `lastAttemptAt`. |
| `AuditEntry` | `id`, `ts`, `actor`, `action`, `entity`, `detail`. |

IDs use a prefix plus a short `Math.random()` string. Timestamps use `new Date().toISOString()`. Date display and relative-time calculations are client-side and use the device/browser locale.

## 3. Existing screen inventory

All locations below are functions in `src/App.jsx`; a named UI surface is listed even when it is a modal or drawer rather than a navigable tab.

| Screen / surface | Location | Purpose, inputs, outputs, and state | Navigation, storage, browser/API dependencies |
| --- | --- | --- | --- |
| Login / identity selector | `LoginScreen` (line 296) | Selects a static user identity and emits its user ID. Local state: selected identity. It does not collect credentials or create a session token. | Shown before `currentUser` is set; output only changes volatile React state. No storage, API, or browser permission dependency. |
| Application shell | `AppShell` (line 1148) | Role-aware sidebar, shift header, high-risk badge, reset-demo action, and switch-user action. Local state: active tab. | No URL route; tabs choose the listed screen. Reset replaces the persisted demo state. Switch user returns to Login. |
| Operator — My Shift | `OperatorView` (line 651) | Displays current-shift logs and opens new-log entry. Input: current shift/logs/user. Output: creates a log. Local state: new-log modal visibility. | Operator home tab. Reads persisted logs; no API. |
| Supervisor — Shift & Handover | `SupervisorView` (line 697) | Before compilation: shows per-log-type counts and compiles a handover. After compilation: edits summary, red flags, briefing notes, views logs/open hazards, signs/resubmits. Local state: modal visibility, editable text. | Supervisor home tab. Reads/writes logs, handover, hazards, audit. No API; sign changes local state only. |
| Incoming in-charge — Shift & Handover | `InChargeView` (line 840) | When a handover is pending, blocks the dashboard with a mandatory review overlay. It can acknowledge or reject with a required reason, then shows accepted summary. It can create a log when not pending. | In-charge home tab. Reads/writes handover/log/audit data. The blocking overlay is UI-only; no system-level enforcement. |
| Manager — SMP Dashboard | `ManagerDashboard` (line 919) | Calculates open/high-risk/overdue counts and handover status; renders risk pie, status bar, and high-risk list. | Manager home tab. Read-only against current persisted state; Recharts has no server data source. |
| Hazards board | `HazardBoard` (line 563) | Searches, filters by risk/status, lists all current hazards, opens report and detail surfaces. Local state: filters, query, selected item, report-modal visibility. | Available to every role. `showAll` is unused; there is no role or mine scoping beyond the single local dataset. Reads/writes persisted hazards and audit. |
| New hazard modal | `NewHazardModal` (line 387) | Inputs: zone, description, suggested risk. Warns (but does not block) when recent non-closed hazards in the same zone have more than 35% long-word overlap. | Opened from hazards. Creates a persisted hazard and audit entry. The photo attachment presentation is simulated; no file, URI, or evidence field is saved. |
| Hazard detail drawer | `HazardDrawer` (line 445) | Shows ticket, assignment/control/due date, action buttons, history, and comments. Inputs: selected hazard and role. Outputs: assignment, status update, comment, escalation. | Opened from hazards board. Reads/writes persisted hazards/audit. No external notification is actually sent on escalation. |
| New shift log modal | `NewLogModal` (line 345) | Inputs: type, zone, description, evidence toggle. Requires non-blank description. | Opened from role home views. Saves a log and audit entry. “Attach photo/video evidence” only sets a boolean; it never invokes camera/file APIs or stores media. |
| Handover report | `HandoverReport` (line 1084) | Shows an acknowledged-and-locked handover with red flags, notes, summary, full current log appendix, and sign/ack metadata. | Supervisor, in-charge, and manager tab. Uses `window.print()` for “Print / Save as PDF”; no PDF is generated, stored, or downloaded by the application. |
| Audit Log | `AuditLogView` (line 987) | Filters and displays audit rows sorted newest first. Local state: text filter. | Manager-only tab. Reads local audit array; UI text claims append-only/hash-chained production behavior, but no hash chain or immutability mechanism exists in this code. |
| ERP Sync Queue | `ErpSyncView` (line 1023) | Displays local queue entries and lets the manager retry failed/dead-letter entries. | Manager-only tab. Uses local timers and random success/failure; no ERP endpoint, HTTP request, background job, or durable process exists. |
| Users & Roles | `UsersView` (line 1058) | Shows the four fixed static users, roles, mine, and an “Active” label. | Manager-only tab. It is read-only; there is no user CRUD despite the `MANAGE_USERS` permission constant. |
| Toast overlays | `Toasts` (line 258) | Shows success/warn/error feedback for selected actions. | App-level transient state, removed after 3.5 seconds with `setTimeout`; not persistent and not an OS notification. |

### 3.1 Navigation inventory by current role

| Role | Current tab labels |
| --- | --- |
| Operator / Field Worker | My Shift; Hazards |
| Outgoing Supervisor | Shift & Handover; Hazards; Handover Report |
| Incoming Shift In-Charge | Shift & Handover; Hazards; Handover Report |
| Mine Manager / Admin | SMP Dashboard; All Hazards; Handover Report; Audit Log; ERP Sync; Users |

There are no dedicated equipment, worker-management, incident-management, messages/chat, notification-center, settings, authentication settings, or map screens. Equipment status, incidents, and hazard observations are log types, not separate workflows.

## 4. Confirmed features and business rules

### 4.1 Role permissions

The app defines a role/action allow-list and checks it inside each mutation. The matrix below describes the implemented constants, not a server-enforced authorization model.

| Capability | Operator | Supervisor | In-charge | Manager |
| --- | :---: | :---: | :---: | :---: |
| Create log, create hazard, comment on hazard | Yes | Yes | Yes | Yes |
| Compile handover; edit summary; add red flag; sign handover | No | Yes | No | No |
| Acknowledge handover | No | No | Yes | No |
| Reject handover | No | No | Yes | Yes |
| Assign hazard; update non-close status; escalate | No | Yes | Yes | Yes |
| Close a resolved hazard | No | No | No | Yes |
| View audit; ERP retry/config; manage users; `VIEW_ALL` | No | No | No | Defined for Manager |

`ERP_CONFIG`, `MANAGE_USERS`, and `VIEW_ALL` are not paired with implemented write or filtering behavior. A disallowed mutation only shows a toast; it does not record a denied attempt in the audit log.

### 4.2 Shift log feature

- **Confirmed:** Four log types are available: Production, Equipment Status, Incident, and Hazard Observation.
- **Confirmed:** A log has a zone rather than a GPS location. The UI explicitly notes that underground zones have no GPS.
- **Confirmed:** A non-empty description is required. Evidence is a boolean marker only.
- **Confirmed:** The current views list the one seeded `shift-current` record. There is no shift creation, shift rollover, staff assignment, or multi-mine selection workflow.

### 4.3 Hazard feature

- **Confirmed:** Any current role can report a hazard with zone, description, and suggested risk level (HIGH/MEDIUM/LOW).
- **Confirmed:** Duplicate detection is an advisory only: same zone, non-closed, created within 24 hours, with long-word overlap greater than 35%.
- **Confirmed:** Supervisor, in-charge, and manager can assign non-operator users, control measures, and due dates. Assigning an OPEN ticket changes it to ASSIGNED.
- **Confirmed:** The drawer presents the UI transition sequence `OPEN -> ASSIGNED -> IN_PROGRESS -> {BLOCKED|RESOLVED}`, `BLOCKED -> IN_PROGRESS`, and `RESOLVED -> CLOSED`. It flags overdue active tickets by comparing the due-date string with the current UTC date string.
- **Confirmed risk:** The mutation itself does not verify the previous status, the assignee, or transition legality. The UI guides valid transitions, but the domain rule is not centrally enforced.
- **Confirmed:** Status changes, assignments, creation, and escalation add history/audit entries; comments add an audit entry but not a history event.
- **Confirmed:** The UI says closure needs independent manager verification, but the mutation only requires the manager role and explicitly allows the manager to be the resolver in this demo. Separate-verifier enforcement is not implemented.
- **Confirmed:** Escalation only appends the words “ESCALATED to Manager” to history and audit. It does not change state, assign a manager, create a notification, or communicate externally.

### 4.4 Handover feature

The actual implemented path is:

```text
Supervisor compiles current shift
  -> COMPILING
  -> edits summary, red flags, briefing notes
  -> signs
  -> PENDING_ACK
  -> In-charge acknowledges
  -> ACKNOWLEDGED_LOCKED

In-charge rejects while pending
  -> REJECTED
  -> Supervisor edits/resubmits
  -> PENDING_ACK
```

- **Confirmed:** The UI defines `DRAFT` and `SIGNED` in its step array but does not assign either status. Rejections are handled outside that array.
- **Confirmed:** Compiling creates a handover record but does not snapshot logs or hazards. The handover and report derive their log/open-hazard views from the current mutable app state.
- **Confirmed:** A second rejection adds an `HANDOVER_ESCALATED_TO_MANAGER` audit entry. It does not send a manager notification or assign follow-up work.
- **Confirmed:** Acknowledgement sets `pdfStatus` to `GENERATING`, then a timer changes it to `READY`; no PDF artifact is produced. It also adds a local ERP queue item and randomly changes it to SUCCESS or FAILED after a timer.
- **Confirmed risk:** “Locked” is represented by handover status and disabled UI fields. Mutation functions do not provide a general immutable-record guard, and other related data such as logs/hazards remain mutable.

### 4.5 Dashboard, audit, and ERP feature

- **Confirmed:** The manager dashboard computes counts/charts from the local hazards array at render time. It has no historical aggregation or remote analytics.
- **Confirmed:** Audit entries are plain records in the same mutable local-storage document. Some actions (for example summary and briefing-note edits) are not audited. The production/hash-chain claim is present only as explanatory UI text.
- **Confirmed:** ERP queue work is simulated with `setTimeout` and `Math.random()`. An acknowledgement begins at attempt 1 and can become SUCCESS or FAILED. A manager retry increments attempts and can become SUCCESS, FAILED, or DEAD_LETTER at three or more attempts. There is no retry scheduling, networking, process survival, or endpoint contract.

### 4.6 Frontend-only functionality

Every feature is frontend-only in the current repository. Specifically, these are simulations or local presentation rather than integrations:

| UI language / feature | Actual implementation |
| --- | --- |
| Login, identity, role access | Four hard-coded selectable people and browser-side checks. |
| Photo/video evidence | Icon/text or a boolean; no capture, picker, upload, or local media record. |
| Digital signature | `signedBy` and timestamp set locally; no cryptographic signing or identity proof. |
| Locked/immutable record | Status and UI conditions only; no immutable storage or hash chain. |
| PDF generation | Status timer plus browser printing; no file. |
| ERP sync/retry/dead letter | Timer/random state machine; no HTTP, queue worker, or ERP adapter. |
| Escalation | Local history/audit text only. |
| Notifications | In-app toast only. |
| User management | Read-only hard-coded table. |

## 5. Browser and web dependencies

| Dependency | Current use | Android replacement / treatment |
| --- | --- | --- |
| `localStorage` through `window.storage` | Whole application state is read/written as one JSON string. | Room for operational records and an outbox; DataStore only for small preferences/session hints. Migrate existing local data only after a data-retention decision. |
| `window` / `document` | Installs storage adapter, mounts React root, and invokes print. | No direct equivalent. Compose is hosted by an Activity; use Android storage/printing abstractions. |
| `window.print()` | Print or Save as PDF action for an acknowledged handover. | Android Print Framework or a generated PDF + share/print intent. The required archival and output format are decisions. |
| Tailwind CDN script | Supplies all effective utility styling at runtime; it is the only app runtime URL. | Replace with a Compose Material/theme design system. This CDN means a fresh browser page needs network access to receive styling, even though OPS data does not call a backend. |
| React DOM / browser layout | JSX components, DOM dialogs/drawers, CSS utility layouts. | Jetpack Compose screens, dialogs, modal bottom sheets/drawers, and adaptive layouts. |
| Recharts | Browser/SVG responsive pie and bar charts. | Compose chart implementation or a selected Android chart library. Preserve measures and labels; library choice is a future decision. |
| Browser date/locale/timeouts | Relative/localized date strings and toast/ERP/PDF timers. | Inject a `Clock`; use `java.time` and Android locale APIs. Use coroutines/WorkManager for durable work rather than UI process timers. |

No use of `navigator`, geolocation, Camera API, MediaDevices, Notifications API, IndexedDB, service workers, Bluetooth/Web Bluetooth, WebSocket, or browser push was found. The camera/evidence labels do not constitute a browser-camera dependency.

## 6. Migration map

### 6.1 React/UI mapping

| Current React artifact | Android target | Preservation notes |
| --- | --- | --- |
| `LoginScreen` | `IdentitySelectionScreen` Compose screen | Preserve explicit demo identity-selection semantics until real authentication is defined. Do not imply secure login. |
| `AppShell` tab state and `NAV` | Navigation Compose graph with a role-filtered navigation rail/drawer | Preserve current role menus and destination names; do not add URL-equivalent routes unless product requirements require deep links. |
| Operator/Supervisor/In-charge/Manager views | Four Compose home destinations plus focused state variants | Preserve role-specific current-shift and handover behavior. |
| Hazard board/drawer/modals | `HazardListScreen`, detail destination or modal sheet, report/edit dialogs | Preserve filters, duplicate warning, states, assignment, comments, and escalation wording. |
| Handover report | Compose report destination | Generate/print only after the current locked-state condition, unless a future requirements decision changes it. |
| Audit/ERP/Users views | Manager Compose destinations | Preserve current read-only/queue behavior initially; do not infer CRUD or actual ERP protocol. |
| `RiskBadge`, `StatusPill`, `Btn`, `Card`, `Field`, `RedFlagBanner`, toast | Reusable Compose design-system components and snackbar/event host | Preserve colors/meaning/accessibility states, not browser class names. |
| Recharts dashboard | Compose dashboard/cards/chart components | Retain the hazard-by-risk and hazard-by-status calculations. |
| Tailwind breakpoints/classes | Compose adaptive layout and theme | Preserve the existing manager grid responsiveness. Reconsider the fixed sidebar for narrow phones without changing available destinations. |

### 6.2 State and hook mapping

| Current pattern | Android target |
| --- | --- |
| Global `useAppState` object | Repository-backed screen/domain `StateFlow`s; Room is the source of truth. |
| `useState` form/filter/modal/tab state | Screen `ViewModel` state, with `SavedStateHandle` for recoverable inputs/filters/navigation state where appropriate. |
| `useMemo` derived lists/counts | ViewModel/domain `Flow` transformations or explicit use cases; keep filtering/sorting deterministic. |
| `useEffect` initial storage read and form reset | ViewModel initialization and explicit UI events; avoid lifecycle-dependent business mutations. |
| `useCallback` / `mutations` object | Typed use-case calls exposed as ViewModel actions. |
| Toast array and `setTimeout` | One-shot `SharedFlow`/channel of UI events consumed by Compose Snackbar host. |
| Browser-side `can(role, action)` | A pure domain authorization policy used by use cases and UI affordances. It must also be enforced by any later server/transport authority. |

### 6.3 JavaScript model to Kotlin model mapping

Use strongly typed Kotlin `data class`es, enums, and IDs rather than a single unvalidated JSON object. Proposed domain terms:

| JavaScript object / string | Kotlin domain representation |
| --- | --- |
| `User`, `Mine`, `Zone`, `ShiftInstance` | `User`, `Mine`, `Zone`, `ShiftInstance` data classes; typed ID value classes if adopted. |
| Role strings | `enum class UserRole { OPERATOR, SUPERVISOR, INCHARGE, MANAGER }` |
| Log-type strings | `enum class ShiftLogType { PRODUCTION, EQUIPMENT_STATUS, INCIDENT, HAZARD_OBSERVATION }` |
| Risk strings | `enum class RiskLevel { HIGH, MEDIUM, LOW }` |
| Hazard status strings | `enum class HazardStatus { OPEN, ASSIGNED, IN_PROGRESS, BLOCKED, RESOLVED, CLOSED }` |
| Handover status strings | `enum class HandoverStatus`; model the confirmed reachable states and decide whether unused `DRAFT`/`SIGNED` are retained. |
| `HazardTicket` with nested arrays | `Hazard`, `HazardAssignment`, `HazardComment`, `HazardHistoryEvent`; Room relations or a transactionally assembled aggregate. |
| `HandoverRecord` with nested arrays | `Handover`, `RedFlag`, `BriefingNote`, `HandoverRejection` with foreign keys/relations. |
| `ErpQueueEntry` | `OutboxItem` with delivery state, payload version, retry policy metadata, and destination. |
| `AuditEntry` | `AuditEvent`; preserve current fields and add integrity fields only under a defined security requirement. |

### 6.4 Persistence mapping

| Current browser storage | Android persistence proposal |
| --- | --- |
| One key containing all mutable data | Room tables and transactions for mines, users, zones, shifts, logs, hazards, handovers, child records, audit events, and outbox items. |
| `localStorage` reset overwrites state with dynamic seed data | Debug/demo-only database reset available only in appropriate non-production builds, subject to product decision. |
| No schema/versioning/data validation | Room migrations, serialized schema version, validation on read/write, and recovery policy for corrupt data. |
| Entire state write for each action | Transactional targeted writes; add audit and outbox row in the same transaction as the operational change. |
| Nothing for small UI/session settings | DataStore for selected demo identity (only if desired), theme/accessibility preferences, and other non-operational small settings. Do not place operational records in DataStore. |

### 6.5 API and repository mapping

There is no existing API implementation to translate. The following are **inferred repositories** that isolate the confirmed OPS aggregate boundaries:

| Repository | Initial responsibility |
| --- | --- |
| `SessionRepository` | Demo identity selection/session lifecycle; later real authentication integration. |
| `ReferenceDataRepository` | Mines, zones, users, role reference data. |
| `ShiftLogRepository` | Current shift and append/read log entries. |
| `HazardRepository` | Hazard list/detail, assignment, lifecycle, comments, and history. |
| `HandoverRepository` | Compile, edit, red flags, notes, sign, acknowledge, reject, and locked-record retrieval. |
| `AuditRepository` | Read and atomically append audit events. |
| `OutboxRepository` | Durable delivery records, attempts, failure/dead-letter state, and retry eligibility. |
| `ReportRepository` | Read-only handover report projection and later PDF/print preparation. |
| `OperationsTransport` | An interface for future server or mesh delivery; no Bluetooth/Bitchat code belongs in a screen or core repository. |

### 6.6 Proposed use cases

Use cases should own the rules currently embedded in `App.jsx` mutations:

- `CreateShiftLog`
- `ReportHazard` and `FindPotentialDuplicateHazards`
- `AssignHazard`, `TransitionHazardStatus`, `AddHazardComment`, `EscalateHazard`
- `CompileHandover`, `UpdateHandoverSummary`, `AddRedFlag`, `AddBriefingNote`
- `SignHandover`, `AcknowledgeHandover`, `RejectHandover`
- `GetManagerHazardDashboard`, `SearchAuditEvents`, `GetHandoverReport`
- `EnqueueOperationalChange`, `ProcessOutbox`, `RetryOutboxItem`

Each mutating use case should perform role authorization, domain precondition validation, the data update, audit event insertion, and any future outbox insertion within a single Room transaction. This is the Android place to preserve, and make explicit, the business rules now scattered across click handlers.

### 6.7 Android services and system integrations

| Existing behavior | Appropriate Android mechanism | Do not assume |
| --- | --- | --- |
| Simulated ERP synchronization/retry | WorkManager worker reading the Room outbox with network constraints when an actual ERP adapter exists. | A foreground service is not justified by the current UI or code. |
| Simulated PDF-ready state and browser print | On-demand report/PDF generation followed by Android Print Framework or share intent. Use WorkManager only if requirements make generation durable/deferrable. | No PDF format, archive, or endpoint is defined today. |
| In-app toast | Compose `SnackbarHost` and UI event flow. | No existing OS notification behavior to replicate. |
| Future urgent handover/hazard attention | NotificationManager behind a product-defined notification policy. | The current app never calls a browser notification API. |
| Future photo/video evidence | Activity Result APIs / CameraX and a media repository only after evidence requirements are specified. | Current evidence is only simulated. |
| Future mesh or online delivery | `OperationsTransport` adapter and durable outbox. | Do not connect Compose screens directly to Bluetooth or use Bitchat as business logic. |

## 7. Proposed Android architecture

This is a high-level **inferred proposal**, not a request to create Android files yet.

```text
Compose UI
  -> screen ViewModels (StateFlow + one-shot UI events)
  -> OPS use cases (authorization + domain workflow)
  -> repositories
       -> Room database (offline source of truth)
       -> DataStore (small preferences only)
       -> Report/PDF adapter (when specified)
       -> OperationsTransport interface
              -> future ERP HTTP adapter
              -> future Bitchat/mesh adapter

WorkManager
  -> processes persistent outbox
  -> updates delivery state transactionally
```

Suggested module boundaries once implementation begins:

| Module | Contents |
| --- | --- |
| `:app` | Android application, navigation host, dependency wiring. |
| `:core:model` | Kotlin domain models/enums/IDs. |
| `:core:database` | Room entities, DAOs, migrations. |
| `:core:ui` | Compose theme and reusable OPS visual primitives. |
| `:feature:auth` | Identity selection / later authentication. |
| `:feature:shift`, `:feature:hazard`, `:feature:handover`, `:feature:manager` | Compose screens and their ViewModels. |
| `:data:ops` | Repository implementations and mappings. |
| `:sync` | Outbox processor and adapters. |
| `:communication` | Transport contracts plus later mesh/Bitchat adapter, isolated from OPS use cases and UI. |

The early native version can run entirely offline with Room. It should write local domain events/outbox records even when no delivery adapter is configured. Later adapters can deliver those records without reshaping the shift, hazard, or handover business model.

## 8. Communication and future Bitchat integration boundary

**Confirmed:** This repository contains no message screen, chat model, communication service, Bluetooth implementation, or Bitchat dependency.

**Inferred boundary:** Define a domain-owned `OperationsTransport` contract that accepts versioned OPS envelopes such as `HandoverAcknowledged`, `HazardEscalated`, or synchronization projections. The sender persists an outbox record first; a transport implementation later transmits it and reports delivery state. Incoming validated envelopes should be translated by repositories/use cases into OPS domain changes, not rendered as raw mesh/chat messages.

This keeps the evolution aligned with the intended direction:

```text
Current OPS business workflow
  -> Android domain + Room/outbox
  -> communication abstraction
  -> optional mesh/Bitchat adapter
```

**Unknown / decision required before an adapter:** peer discovery, group/recipient rules, message ordering and deduplication, conflict resolution for concurrent offline edits, encryption/key lifecycle, identity binding, relay policy, delivery acknowledgements, audit evidence, payload size/media transfer, Bitchat capabilities/licensing, and which OPS events may travel over mesh. None of these should be inferred from the current web UI.

## 9. Migration risks and decisions

| Risk / gap | Why it matters | Migration treatment |
| --- | --- | --- |
| Monolithic implementation | UI, state, business rules, persistence, and fake integrations live in one 1,428-line file. Moving only visual components can silently lose behavior. | Extract behavior into tested use cases before/while reproducing screens. Use this inventory as the behavioral baseline. |
| Demo labels vs. real implementation | UI wording can imply security, ERP, PDF, evidence, audit integrity, and notification capabilities that do not exist. | Preserve visible workflow/labels where required, but document and decide real capability contracts before claiming production behavior. |
| Client-only security | Static identities, `Math.random()` IDs, mutable local storage, and in-client authorization are not reliable security controls. | Define real authentication/authorization, encryption-at-rest needs, device policy, audit integrity, and server/mesh trust model before production deployment. |
| Rule inconsistencies | Status transitions are UI-guided but not mutation-enforced; “independent” closure is not enforced; unused handover statuses exist. | Decide whether Android matches exact current behavior or formalizes the stated intent. Record approved rule changes as product changes rather than accidental migration changes. |
| Handover snapshot/lock semantics | Current handover views derive from mutable current logs/hazards and locked state is not storage-enforced. | Decide what must be snapshotted, immutable, signed, and retained; implement database constraints/transactions accordingly. |
| Local-storage data quality | The app has no schema validation/migrations and parses one arbitrary JSON document. Existing browser data may be malformed or incompatible. | Decide whether web data needs one-time import. If so, define a versioned, validated importer and recovery/error policy. |
| Offline concurrency | Current app is a single local browser with no sync/merge logic. Multi-device offline use changes conflict semantics. | Define entity versioning, idempotency keys, merge policy, and ownership/transition authorization before sync or mesh rollout. |
| ERP simulation | No endpoint, payload, error taxonomy, auth, or scheduling rules exist. | Keep a local outbox interface; do not code a concrete ERP client until contract details are supplied. |
| Evidence simulation | A boolean photo flag is not a media record. | Decide camera/gallery policy, storage, encryption, retention, upload/mesh restrictions, and how evidence affects reports/audits. |
| Browser print is not archival PDF | The report appears printable but produces no controlled artifact. | Decide official report format, signature/verification requirements, storage location, and print/share policy. |
| Device/time behavior | Current logic mixes UTC comparisons with device-local display and uses process timers. | Inject clock/time-zone handling; design durable work that survives process death. |
| UI responsiveness/accessibility | Tailwind CDN controls current styling; the fixed 240px sidebar has no small-screen navigation variant, and tables may not fit narrow devices. | Preserve content/meaning with Compose adaptive layouts and accessibility testing; this is an implementation adaptation, not a workflow redesign. |
| Baseline quality | No tests exist; lint currently fails; production build succeeds with a large initial JS bundle warning. | Add Android unit tests for use cases, Room tests, ViewModel tests, and Compose tests during migration. Keep web lint issues documented rather than silently treating them as behavior changes. |

## 10. Unknowns requiring future decisions

The repository does not answer these questions:

- Real identity provider, credential lifecycle, roles/user provisioning, and whether the demo selector remains.
- Mine, zone, user, shift schedule, and multi-mine data sources; shift creation/rollover rules.
- Backend/ERP endpoint, authentication, payload schema, retry policy, delivery guarantee, and reconciliation process.
- Exact regulatory/audit requirements, retention, hash/signature scheme, reviewer independence, and record immutability definition.
- Evidence media capture/storage/retention/permissions and report inclusion requirements.
- Official PDF/report template, archive, printer/share restrictions, and offline-print behavior.
- Alert recipient/escalation behavior; current “escalation” does not notify anyone.
- Android minimum SDK, supported device classes, managed-device constraints, language/localization, and accessibility target.
- Any Bitchat/mesh protocol contract and the event/conflict/security rules listed above.

## 11. Verification performed

| Command | Result |
| --- | --- |
| `git status --short` | Clean before the analysis document was created. |
| `git branch --show-current` | `master`. |
| `git log --oneline -10` | One baseline commit: `7327fe9 this is the first stable version of the suraksha-ops`. |
| Repository/source scans (`rg`, tracked-file listing, dependency scan) | Confirmed the inventory above; no tests, env files, API calls, network transport, Bluetooth, or Bitchat code found. |
| `npm ls --depth=0` | Resolved declared React/Vite/lucide/recharts and lint dependency set. |
| `npm run build` | Passed. Vite produced a bundle-size warning: generated JavaScript is above 500 kB after minification. |
| `npm run lint` | Failed with 17 errors and 5 warnings in existing `src/App.jsx`: unused imports/parameters, synchronous state updates inside effects, and Hook dependency warnings. No lint fixes were made during this analysis-only phase. |

## 12. Changes made in this phase

- Added this analysis document only: `docs/ANDROID_MIGRATION_ANALYSIS.md`.
- Did not delete, rewrite, or otherwise modify the React OPS implementation.
- Did not create an Android project, integrate Bitchat, add Bluetooth, implement networking, or alter working workflows.
