# Tech Stack — EmiSafe

## Core Technologies

- **Runtime Environment**: Node.js (v24 configured for Firebase Functions)
- **Backend Framework**: Express.js (`^4.18.2`)
- **Database**: Firebase Cloud Firestore via `firebase-admin` (`^14.4.0` / `^13.6.0`)
- **Real-Time Communication**: WebSockets using `ws` (`^8.16.0`)
- **Frontend Core**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Map Rendering**: Leaflet.js (Client-side interactive map)

## Languages & Formats

- **JavaScript**: CommonJS (`require`) on Server & Cloud Functions; Native ES6 scripts on Client
- **Data Exchange**: JSON over HTTP REST & WebSocket frames
- **Configuration**: Environment variables (`.env`, `dotenv` `^16.3.1`), `firebase.json`, `.firebaserc`

## Major Dependencies & Libraries

### Server (`server/package.json`)
- `express`: Web application server & routing
- `firebase-admin`: Firebase Cloud Firestore SDK
- `jsonwebtoken` (`^9.0.2`): Auth token generation & verification
- `bcryptjs` (`^2.4.3`): Password hashing (utility ready)
- `ws`: Native WebSocket server instance for real-time dispatch updates
- `multer` (`^1.4.5-lts.1`): Multipart form-data parser for media upload handling
- `cors` (`^2.8.5`): Cross-Origin Resource Sharing handling
- `uuid` (`^9.0.1`): Unique identifier generation for emergency report IDs
- `dotenv`: Local environment configuration loader

### Firebase Functions (`functions/package.json`)
- `firebase-functions` (`^7.0.0`): Serverless triggers & HTTPS functions
- `firebase-admin` (`^13.6.0`): Administrative access to Firebase services
- `firebase-functions-test` (`^3.4.1`): Test utility for functions

## Infrastructure & Hosting

- **API Server**: Render live deployment (`https://emisafe.onrender.com/api`)
- **WebSocket Gateway**: Render live deployment (`wss://emisafe.onrender.com`)
- **Hosting Target**: Firebase Hosting (`firebase.json` configured to host `client/` static assets)
