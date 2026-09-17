# Integrations — EmiSafe

## External Services & Database

### 1. Firebase Cloud Firestore
- **Usage**: Primary database storing `incidents` and `responders` collections.
- **SDK**: `firebase-admin` node module.
- **Auth**: Service Account key parsed from `FIREBASE_SERVICE_ACCOUNT` env variable, with project ID fallback (`FIREBASE_PROJECT_ID` / default `'emisafe-app'`).
- **Collections**:
  - `incidents`: Emergency reports submitted by citizens, updated by dispatchers and responders.
  - `responders`: Emergency personnel profiles, live locations, and status trackers.

### 2. Live WebSocket Channel
- **Protocol**: `ws://` / `wss://`
- **Server**: Native Node.js HTTP server bound to `ws` instance.
- **Client**: `ws.js` wrapper class supporting exponential backoff reconnection.
- **Broadcasting Events**:
  - `new_incident`: Broadcasted when a citizen submits an incident report.
  - `incident_update`: Broadcasted on assignment or status changes (`Received` -> `En Route` -> `On Scene` -> `Resolved`).
  - `new_responder`: Broadcasted on new field responder registration (`Pending`).
  - `responder_update`: Broadcasted on responder operational status change (`Available`, `Busy`, `Offline`).
  - `responder_location`: Broadcasted when field responder transmits live GPS coordinates.

## Client-Side Integrations

### 1. Leaflet Maps & OpenStreetMap
- **Usage**: Interactive emergency dispatch and tracking map overlays.
- **Integration**: Loaded via CDN scripts/styles in client HTML files (`dashboard.html`, `report.html`, `track.html`, `portal.html`).

### 2. Media Upload Systems
- **Usage**: Incident photo upload handling via `multer`.
- **Storage**: Saved to local server filesystem path (`server/uploads/`) and served statically at `/uploads/`.

## Environment Dependencies & Config

- `PORT`: Server port (default `3000`).
- `JWT_SECRET`: Secret key for signing and verifying JWT tokens.
- `DISPATCHER_ID`: Fixed dispatcher login credential.
- `DISPATCHER_PASS`: Fixed dispatcher password credential.
- `FIREBASE_SERVICE_ACCOUNT`: Service account JSON string.
- `FIREBASE_PROJECT_ID`: Target Firebase project ID.
- `EMISAFE_API_URL`: Client-side API root override (default `https://emisafe.onrender.com/api`).
- `EMISAFE_WS_URL`: Client-side WebSocket URL override (default `wss://emisafe.onrender.com`).
