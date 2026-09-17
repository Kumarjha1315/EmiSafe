# Architecture — EmiSafe

## System Architecture Overview

EmiSafe is an Urban Emergency Dispatch Platform built as a client-server-realtime system powered by Node.js, Express, WebSockets, and Firebase Cloud Firestore.

```
+-------------------------------------------------------------------+
|                        CLIENT FRONTEND                            |
|  +------------------+  +-------------------+  +-----------------+  |
|  | Citizen Portal   |  | Dispatcher Portal |  | Responder Portal|  |
|  | (Report / Track) |  | (Dashboard/Analytics)| (Status/GPS)    |  |
|  +--------+---------+  +---------+---------+  +--------+--------+  |
+-----------|----------------------|-------------------|------------+
            | HTTP / REST          | HTTP / JWT        | HTTP / WS
            v                      v                   v
+-------------------------------------------------------------------+
|                         EXPRESS SERVER                            |
|  +------------------+  +-------------------+  +-----------------+  |
|  | Incident Router  |  | Dispatcher Router |  | Responder Router|  |
|  | (/api/incidents) |  | (/api/auth &      |  | (/api/responders|  |
|  |                  |  |  /api/analytics)  |  |  & /api/auth)   |  |
|  +--------+---------+  +---------+---------+  +--------+--------+  |
|           |                      |                   |            |
|           +----------------------+-------------------+            |
|                                  |                                |
|                        WebSocket Server (ws)                      |
|                     Broadcast & Live Location                     |
+----------------------------------+--------------------------------+
                                   |
                                   v
+-------------------------------------------------------------------+
|                     FIREBASE CLOUD FIRESTORE                      |
|        Collections: `incidents` | `responders`                    |
+-------------------------------------------------------------------+
```

## User Roles & Workflows

### 1. Citizen Role
- **Report Emergency**: Submits category, description, location coordinates, address, name, phone, and optional media upload.
- **Track Status**: Uses unique report ID (`EMI-XXXXXXXX`) to check incident status (`Received` -> `En Route` -> `On Scene` -> `Resolved`), assigned responder details, and audit history.

### 2. Dispatcher Role
- **Authentication**: Authenticates using predefined admin credentials. Receives JWT token valid for 12 hours.
- **Control Center**: Views real-time map with active incidents and responder markers.
- **Incident Dispatch**: Assigns available field responders to emergency reports.
- **Analytics & Metrics**: Monitors KPI scorecards, incident category distribution, response times, daily activity trends, incident heatmaps, and responder leaderboards.

### 3. Field Responder Role
- **Self-Registration**: Registers badge ID, department, email, phone, experience. Begins in `Pending` state.
- **Authentication**: Logs in via badge ID and email. Receives JWT token.
- **Live Location Sync**: Sends periodic GPS coordinates via REST/WebSocket to update dispatcher map.
- **Incident Action**: Transitions status of assigned incidents (`En Route` -> `On Scene` -> `Resolved`). Upon resolution, responder status automatically reverts to `Available`.

## Component Layers

1. **Presentation Layer (`client/`)**: Static HTML, vanilla JS, custom CSS (`global.css`), and Leaflet mapping modules.
2. **Routing & Business Logic Layer (`server/routes/`)**: Express controllers managing authentication, authorization, validation, incident processing, and analytics calculation.
3. **Data Layer (`server/config/db.js`)**: `firebase-admin` SDK connecting directly to Cloud Firestore.
4. **Real-time Engine (`server/ws/socketHandler.js`)**: Centralized WebSocket connection manager supporting heartbeat pings and event broadcasts.
