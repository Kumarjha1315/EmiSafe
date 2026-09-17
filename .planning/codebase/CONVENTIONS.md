# Conventions — EmiSafe

## Coding & Architectural Conventions

### 1. Module System & Imports
- **Backend**: CommonJS (`require` / `module.exports`).
- **Frontend**: Vanilla ES6 JavaScript modules/scripts included via standard script tags in HTML files.

### 2. File & Directory Naming
- **Routes & Handlers**: Lowercase camelCase or hyphenated (`auth.js`, `incidents.js`, `responders.js`, `socketHandler.js`).
- **Middleware**: CamelCase files with `Middleware` suffix (`authMiddleware.js`).
- **Client Scripts**: Hyphenated role-feature format (`citizen-report.js`, `dispatcher-dashboard.js`, `responder-portal.js`).
- **HTML Views**: Role-scoped directories (`client/citizen/`, `client/dispatcher/`, `client/responder/`).

### 3. API Response Structure & Conventions
- REST endpoints return JSON payloads.
- Errors follow standard HTTP status codes with an `error` key:
  ```json
  { "error": "Descriptive error message" }
  ```
- Successful item creation returns HTTP 201 with created record ID(s):
  ```json
  { "reportId": "EMI-A1B2C3D4", "incidentId": "firestore_doc_id" }
  ```
- Item updates return the populated object.

### 4. Database ID Mapping & Compatibility Pattern
- Cloud Firestore document IDs are assigned as `id` and mirrored as `_id` on populated objects to ensure backward compatibility across REST controllers and frontend scripts.
  ```js
  const responder = { id: doc.id, _id: doc.id, ...doc.data() };
  ```

### 5. Authentication & Authorization
- Dispatcher JWT signed with role `dispatcher` and expiration (`12h`).
- Responder JWT signed with role `responder` and expiration (`24h`).
- Protected endpoints check `Authorization: Bearer <token>` via `authMiddleware.js`.

### 6. Frontend API Client Pattern
- `apiFetch` in `client/js/api.js` encapsulates token injection, request header management (e.g. removing `Content-Type` for `FormData`), error catching, and toast notifications.
