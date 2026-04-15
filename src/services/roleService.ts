import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// TODO: Replace admin-created data with webhook (Zapier) or Clio API integration

/**
 * Retrieves the role of a user from Firestore.
 *
 * @param uid - The authenticated user's UID
 * @returns 'admin' or 'client' — defaults to 'client' if role is missing
 */
export async function getUserRole(uid: string): Promise<'admin' | 'client'> {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      const role = data?.role;
      if (role === 'admin' || role === 'client') {
        return role;
      }
    }
    // Default to 'client' for safety if role is missing or malformed
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
