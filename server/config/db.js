const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK
if (!admin.getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('✅ Firebase Admin initialized with Service Account');
    } catch (err) {
      console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', err.message);
      admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'emisafe-app' });
    }
  } else {
    // Default initialization with project ID fallback
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'emisafe-app',
    });
    console.log('✅ Firebase Admin initialized');
  }
}

const db = getFirestore();

const connectDB = async () => {
  console.log('🔥 Connected to Firebase Cloud Firestore');
};

connectDB.admin = admin;
connectDB.db = db;

module.exports = connectDB;
