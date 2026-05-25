// Firebase configuration. Set in a global namespace so the rest of the app
// can read it without ES module imports.
//
// To enable Firebase:
//   1. Create a project at https://console.firebase.google.com
//   2. Enable Authentication (Email/Password), Firestore, and Storage
//   3. Replace the placeholder values below with your own
//   4. Set ENABLED = true
//
// While ENABLED = false the app runs in local mode (localStorage), so you
// can use it immediately by just opening index.html (no server needed).

window.TimebokConfig = {
  FIREBASE_CONFIG: {
    apiKey: 'AIzaSyC9UMePqy2Kvd9C-20sWDA3ED-AoXMI57M',
    authDomain: 'timebok-d0084.firebaseapp.com',
    projectId: 'timebok-d0084',
    storageBucket: 'timebok-d0084.firebasestorage.app',
    messagingSenderId: '464873951998',
    appId: '1:464873951998:web:933eee1a178fc031c58baf',
  },
  ENABLED: true,
  // E-mail of the admin user. The first time this user signs in, their
  // profile is created with role = 'admin'. Others default to 'user'.
  ADMIN_EMAIL: 'kulasic.igor@gmail.com',
};
