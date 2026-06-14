// Konfigurasi Firebase untuk FinTrack
const firebaseConfig = {
  apiKey: "AIzaSyB-OcBrSrkveSh7BZHT5dbkV8IrBLfo_c4",
  authDomain: "keuangan121-87817.firebaseapp.com",
  projectId: "keuangan121-87817",
  storageBucket: "keuangan121-87817.firebasestorage.app",
  messagingSenderId: "1014759970402",
  appId: "1:1014759970402:web:4f53d4ebae702ceb36633b",
  measurementId: "G-VCJ3LB7SY4"
};

let auth = null;
let db = null;

if (typeof firebase !== 'undefined') {
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();

  // Aktifkan offline persistence agar aplikasi tetap jalan tanpa internet
  db.enablePersistence().catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code == 'unimplemented') {
      console.warn('The current browser does not support all of the features required to enable persistence');
    }
  });
} else {
  console.error("Firebase SDK is undefined. Check internet connection or adblocker.");
}
