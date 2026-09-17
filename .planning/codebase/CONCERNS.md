# Codebase Concerns & Technical Debt — EmiSafe

## Critical Security Risks

1. **Hardcoded Fallback Secret in JWT**:
   - `server/routes/auth.js` uses `'emisafe_secret_key'` as a fallback if `JWT_SECRET` is missing in environment variables.
   - *Risk*: Anyone knowing this fallback string can forge dispatcher or responder tokens.

2. **Permissive CORS Configuration**:
   - `server/index.js` sets `app.use(cors({ origin: '*' }))`.
   - *Risk*: Open to cross-site request forgery and unauthorized domain interaction in production.

3. **Unauthenticated Public Incident Status Update Endpoint**:
   - `PATCH /api/incidents/:id/status` in `server/routes/incidents.js` does NOT enforce `authMiddleware`. Anyone with a Firestore incident ID can modify incident status, log audit entries, or auto-release responders.
   - *Risk*: Unauthorized state tampering.

4. **Token Storage in Web Storage**:
   - Client scripts store auth tokens in `sessionStorage` (`emisafe_token`) and `localStorage` (`emisafe_responder_token`).
   - *Risk*: Susceptible to XSS attacks.

## Scalability & Architectural Limitations

1. **Local Filesystem Media Storage**:
   - Uploaded incident photos are stored directly on the server's local disk (`server/uploads/`).
   - *Risk*: In ephemeral host environments (e.g., Render free tier or containerized deployments), uploads will be wiped on restart/redeploy. Should be migrated to Firebase Cloud Storage or AWS S3.

2. **In-Memory WebSocket Server without Adapter**:
   - WebSocket broadcast (`server/ws/socketHandler.js`) relies on a single in-memory `ws` server instance.
   - *Risk*: If backend instances are scaled horizontally across multiple process containers, WebSocket broadcasts will fail to reach clients connected to other instances. Requires Redis Pub/Sub adapter or Firebase Realtime DB triggers.

3. **Unindexed / Client-Side Sorting on Firestore Queries**:
   - In `server/routes/incidents.js` and `server/routes/responders.js`, full collection snapshots are fetched and sorted in Node.js memory (`incidents.sort(...)`).
   - *Risk*: As incident count grows, fetching all records without pagination or index-backed Firestore queries will degrade performance and incur high read costs.

## Code Quality & Maintainability Concerns

1. **Absence of Automated Test Coverage**:
   - No unit or integration test runner configured in `server/package.json`.
   - Regressions can only be detected via manual portal testing.

2. **Missing Input Validation & Sanitization**:
   - Incident descriptions and responder input parameters are written directly to Firestore without HTML sanitization, leaving potential XSS risks in rendering pages.
