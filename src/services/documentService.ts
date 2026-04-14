import { ref, uploadBytes, getDownloadURL, listAll } from 'firebase/storage';
import { storage } from './firebase';

export interface Document {
  id: string;
  fileName: string;
  fileUrl: string;
  userId: string;
}

/**
 * Service to manage Document data stored on Firebase Storage.
 * Designed as a strict abstraction layer over the backend storage system.
 */

// TODO: Replace Firebase Storage logic with Clio document API via Cloud Functions

/**
 * Uploads a file for a specific user to the storage bucket.
 * 
 * @param userId - The user's ID
 * @param file - The file blob to upload
 * @returns The public download URL of the uploaded file
 */
export async function uploadDocument(userId: string, file: File): Promise<string> {
  try {
    const fileRef = ref(storage, `documents/${userId}/${file.name}`);
    await uploadBytes(fileRef, file);
    const downloadUrl = await getDownloadURL(fileRef);
    return downloadUrl;
  } catch (error) {
    console.error('Error uploading document:', error);
    throw error;
  }
}

/**
 * Fetches all available documents stored for a specific user.
 * 
 * @param userId - The user's ID
 * @returns A list of Document objects mapping to the user's files
 */
export async function getDocumentsByUserId(userId: string): Promise<Document[]> {
  try {
    const listRef = ref(storage, `documents/${userId}`);
    const res = await listAll(listRef);
    
    // Map list results to internal Document schema and fetch URLs
    const documents = await Promise.all(
      res.items.map(async (itemRef) => {
        const url = await getDownloadURL(itemRef);
        return {
          id: itemRef.fullPath, // Using the full path as a unique ID
          fileName: itemRef.name,
          fileUrl: url,
          userId: userId
        } as Document;
      })
    );
    
    return documents;
  } catch (error: any) {
    // If the directory doesn't exist, listAll throws a specific storage/object-not-found error depending on rules, 
    // but usually in Firebase Storage missing folders just return empty items array.
    console.error('Error fetching documents:', error);
    throw error;
  }
}
