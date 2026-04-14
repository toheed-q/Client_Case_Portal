import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged
} from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

/**
 * Service to manage Firebase Authentication.
 */

// TODO: Replace Firebase Auth + Firestore user creation with Clio Identity sync if required

/**
 * Registers a new user account with email and password.
 * 
 * @param email - The user's email address
 * @param password - The user's password
 * @param fullName - The user's full name
 * @returns The newly created User object
 */
export async function register(email: string, password: string, fullName: string): Promise<User> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Create default user record in Firestore
    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      fullName: fullName,
      role: "client"
    });
    
    return user;
  } catch (error) {
    console.error("Registration failed:", error);
    throw error;
  }
}


/**
 * Logs in a user with email and password.
 * 
 * @param email - The user's email address
 * @param password - The user's password
 * @returns The logged-in User object
 */
export async function login(email: string, password: string): Promise<User> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
}

/**
 * Logs out the current user.
 */
export async function logout(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout failed:", error);
    throw error;
  }
}

/**
 * Listens to authentication state changes.
 * 
 * @param callback - Function to execute when auth state changes (e.g., user logs in or out)
 * @returns An unsubscribe function to stop listening
 */
export function listenToAuthChanges(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Retrieves the current logged-in user synchronously (if already initialized/known).
 * 
 * @returns The current User or null
 */
export function getCurrentUser(): User | null {
  return auth.currentUser;
}
