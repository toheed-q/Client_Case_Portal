// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA0JfRUFFKH-eWknPdWRZRr_hPfK0deDvE",
  authDomain: "cdp-law-client-portal.firebaseapp.com",
  projectId: "cdp-law-client-portal",
  storageBucket: "cdp-law-client-portal.firebasestorage.app",
  messagingSenderId: "289405589999",
  appId: "1:289405589999:web:bbe011525038bc48f73e1a",
  measurementId: "G-42M7361CWP"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
