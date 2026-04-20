import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyA0JfRUFFKH-eWknPdWRZRr_hPfK0deDvE",
  authDomain: "cdp-law-client-portal.firebaseapp.com",
  projectId: "cdp-law-client-portal",
  storageBucket: "cdp-law-client-portal.firebasestorage.app",
  messagingSenderId: "289405589999",
  appId: "1:289405589999:web:bbe011525038bc48f73e1a",
  measurementId: "G-42M7361CWP"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

