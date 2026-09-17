# Codebase Structure — EmiSafe

## Directory Layout

```
EmiSafe/
├── .firebase/                    # Firebase CLI cache & local metadata
├── .firebaserc                   # Firebase target project binding
├── firebase.json                 # Firebase Hosting configuration & SPA rewrite rules
├── client/                       # Static Frontend Client
│   ├── _redirects                # Netlify / static host rewrite fallback rules
│   ├── index.html                # Platform Landing & Role Selector
│   ├── css/
│   │   └── global.css            # Centralized CSS design system & component styles
│   ├── js/
│   │   ├── config.js             # Environment API & WebSocket URL definitions
│   │   ├── api.js                # API client wrapper, toasts, & helper functions
│   │   ├── ws.js                 # WebSocket client with auto-reconnect
│   │   ├── citizen-report.js     # Incident submission logic & map integration
│   │   ├── citizen-track.js      # Public incident tracking logic
│   │   ├── dispatcher-dashboard.js# Main dispatch control center logic
│   │   ├── dispatcher-analytics.js# Analytics charts & KPI scorecards logic
│   │   └── responder-portal.js   # Field responder mobile portal logic
│   ├── citizen/
│   │   ├── report.html           # Citizen emergency reporting page
│   │   └── track.html            # Public report lookup & live status tracker
│   ├── dispatcher/
│   │   ├── login.html            # Dispatcher authentication view
│   │   ├── dashboard.html        # Emergency control center view
│   │   └── analytics.html        # Operational analytics & heatmap view
│   └── responder/
│       ├── login.html            # Field responder authentication view
│       ├── register.html         # Responder registration view
│       └── portal.html           # Active duty responder portal view
├── functions/                    # Firebase Cloud Functions Module
│   ├── index.js                  # Cloud Functions triggers & HTTPS setup
│   └── package.json              # Cloud Functions dependencies & Node engine (v24)
└── server/                       # Node.js / Express Backend Server
    ├── index.js                  # Main server entrypoint, middleware, & route mounting
    ├── package.json              # Server dependencies & scripts (`start`, `dev`)
    ├── config/
    │   └── db.js                 # Firebase Admin SDK & Firestore initialization
    ├── middleware/
    │   └── authMiddleware.js     # JWT Bearer token verification middleware
    ├── routes/
    │   ├── auth.js               # Dispatcher & responder authentication endpoints
    │   ├── incidents.js          # Incident CRUD, dispatcher assignment, status updates
    │   ├── responders.js         # Responder CRUD, registration, status & location updates
    │   └── analytics.js          # Aggregated KPI & analytics reporting endpoints
    ├── uploads/                  # Local storage for citizen uploaded incident images
    └── ws/
        └── socketHandler.js      # WebSocket server initialization & broadcast helper
```

## Key Entry Points

1. **Server Backend**: `server/index.js`
   - Initializes Express app and HTTP server.
   - Connects to Firebase Firestore database via `server/config/db.js`.
   - Binds `ws` WebSocket Server instance.
   - Serves API routes (`/api/auth`, `/api/incidents`, `/api/responders`, `/api/analytics`).
   - Serves static client files and uploaded images (`/uploads`).
   - Handles SPA fallback routing to `client/index.html`.

2. **Frontend Entry**: `client/index.html`
   - Entry point for users to navigate between Citizen, Dispatcher, and Responder portals.

3. **Cloud Functions**: `functions/index.js`
   - Entry point for serverless functions deployment on Firebase.
