import { ref as storageRef, uploadBytes, getDownloadURL, listAll } from 'firebase/storage';
import { collection, getDocs } from 'firebase/firestore';
import { storage, db } from './firebase';

// TODO: Replace admin-created data with webhook (Zapier) or Clio API integration

export interface Document {
  id: string;
  fileName: string;
  fileUrl: string;
  userId: string;
}

export interface UserRecord {
  uid: string;
  email: string;
  fullName?: string;
}

/**
 * Service to manage Document data stored on Firebase Storage.
 * Designed as a strict abstraction layer over the backend storage system.
 */

// ─────────────────────────────────────────────
// CLIENT-FACING READS
// ─────────────────────────────────────────────

/**
 * Fetches all available documents stored for a specific user.
 *
 * @param userId - The user's ID
 * @returns A list of Document objects mapping to the user's files
 */
export async function getDocumentsByUserId(userId: string): Promise<Document[]> {
  try {
    const listRef = storageRef(storage, `documents/${userId}`);
    const res = await listAll(listRef);

    const documents = await Promise.all(
      res.items.map(async itemRef => {
        const url = await getDownloadURL(itemRef);
        return {
          id: itemRef.fullPath,
          fileName: itemRef.name,
          fileUrl: url,
          userId: userId,
        } as Document;
      })
    );

    return documents;
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────
// ADMIN OPERATIONS
// ─────────────────────────────────────────────

/**
 * [ADMIN] Uploads a file for a specific user to the storage bucket.
 * Path format: documents/{userId}/{fileName} — matches future webhook payload structure.
 *
 * @param userId - The user's ID
 * @param file - The file blob to upload
 * @returns The public download URL of the uploaded file
 */
export async function uploadDocument(userId: string, file: File): Promise<string> {
  try {
    const fileRef = storageRef(storage, `documents/${userId}/${file.name}`);
    const metadata = {
      contentType: file.type,
      customMetadata: {
        uploadedBy: 'admin',
        uploadedAt: new Date().toISOString(),
      },
    };
    await uploadBytes(fileRef, file, metadata);
    const downloadUrl = await getDownloadURL(fileRef);
    return downloadUrl;
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
}

/**
 * [ADMIN] Fetches all registered users from the Realtime Database users node.
 * Used to populate user dropdowns in the admin panel.
 *
 * @returns Array of UserRecord objects
 */
export async function getAllUsers(): Promise<UserRecord[]> {
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    if (snapshot.empty) return [];

    return snapshot.docs.map(docSnap => {
      const userData = docSnap.data();
      return {
        uid: docSnap.id,
        email: userData.email || '',
        fullName: userData.fullName || '',
      } as UserRecord;
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
}

