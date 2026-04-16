import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// TODO: Replace admin-created data with webhook (Zapier) or Clio API integration

/**
 * Retrieves the role of a user from Realtime Database.
 *
 * @param uid - The authenticated user's UID
 * @returns 'admin' or 'client' — defaults to 'client' if role is missing
 */
export async function getUserRole(uid: string): Promise<'admin' | 'client'> {
  try {
    console.log('[getUserRole] Fetching role for UID:', uid);
    const snapshot = await getDoc(doc(db, 'users', uid));
    console.log('[getUserRole] Document exists:', snapshot.exists());
    if (snapshot.exists()) {
      const data = snapshot.data();
      console.log('[getUserRole] Document data:', data);
      const role = data?.role;
      console.log('[getUserRole] Role value:', role, 'Type:', typeof role);
      if (role === 'admin' || role === 'client') {
        console.log('[getUserRole] Returning role:', role);
        return role;
      }
    }
    // Default to 'client' for safety if role is missing or malformed
    console.log('[getUserRole] Defaulting to client');
    return 'client';
  } catch (error) {
    console.error('Error fetching user role:', error);
    return 'client';
  }
}

/**
 * Checks whether the given user has admin privileges.
 *
 * @param uid - The authenticated user's UID
 * @returns true if the user's role is 'admin'
 */
export async function isAdmin(uid: string): Promise<boolean> {
  const role = await getUserRole(uid);
  return role === 'admin';
}

