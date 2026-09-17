# Testing Strategy & Status — EmiSafe

## Current Testing Setup

### 1. Unit & Integration Testing
- **Server Package**: `server/package.json` currently has no automated test runner configured (`jest`, `mocha`, or `supertest` are not installed).
- **Functions Package**: `functions/package.json` includes `firebase-functions-test` (`^3.4.1`) as a dev dependency, but no test scripts are configured in `package.json`.

### 2. Manual Verification Workflows

#### A. Emergency Incident Reporting Flow
1. Open Citizen Report portal (`client/citizen/report.html`).
2. Fill out incident report with category, location (GPS or manual click), description, reporter details, and optional photo attachment.
3. Submit form and verify receipt of unique Report ID (`EMI-XXXXXXXX`).
4. Navigate to Public Track portal (`client/citizen/track.html`) and enter Report ID to inspect live incident status and audit history.

#### B. Dispatcher Emergency Control Center Flow
1. Access Dispatcher Login (`client/dispatcher/login.html`).
2. Login with configured dispatcher credentials.
3. Verify live map markers for incidents and responders on `client/dispatcher/dashboard.html`.
4. Test real-time WebSocket broadcasting by creating an incident in another tab and verifying immediate card insertion without page refresh.
5. Assign a responder to an incoming incident and verify status updates (`Received` -> `En Route`).
6. Inspect operational analytics metrics, category distributions, heatmaps, and responder leaderboards on `client/dispatcher/analytics.html`.

#### C. Field Responder Duty Flow
1. Access Responder Portal (`client/responder/login.html` or `register.html`).
2. Login with registered badge ID and email.
3. Verify assigned incident card details on `client/responder/portal.html`.
4. Update incident status (`On Scene` -> `Resolved`) and verify responder status transition to `Available`.
5. Test live GPS location publishing (`PATCH /api/responders/:id/location`).

## Recommended Future Test Infrastructure
- Add Jest & Supertest to `server/package.json` for automated API endpoint testing.
- Add client component unit tests (e.g. testing `haversineDistance` and `estimateETA` functions in `api.js`).
