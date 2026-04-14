import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';

export interface Case {
  userId: string;
  caseStage: string;
  statusSummary: string;
}

/**
 * Service to manage Case data.
 * Built as an abstraction to avoid tight coupling between the UI and backend data source.
 */

// TODO: Replace Firestore logic with Clio API integration via Cloud Functions

/**
 * Retrieves the case details associated with a particular user.
 * 
 * @param userId - The authenticated user's ID
 * @returns The associated Case object, or null if no case exists.
 */
export async function getCaseByUserId(userId: string): Promise<Case | null> {
  try {
    const casesRef = collection(db, 'cases');
    const q = query(casesRef, where('userId', '==', userId), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    // Since we limit to 1, we just return the first document mapped to the Case interface
    const docData = snapshot.docs[0].data();
    return {
      userId: docData.userId,
      caseStage: docData.caseStage,
      statusSummary: docData.statusSummary
    } as Case;
  } catch (error) {
    console.error('Error fetching case by user ID:', error);
    throw error;
  }
}

/**
 * Retrieves all cases associated with a particular user.
 * 
 * @param userId - The authenticated user's ID
 * @returns Array of Case objects. Empty array if none found.
 */
export async function getAllCasesByUserId(userId: string): Promise<Case[]> {
  try {
    const casesRef = collection(db, 'cases');
    const q = query(casesRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map(docSnap => {
      const docData = docSnap.data();
      return {
        userId: docData.userId,
        caseStage: docData.caseStage,
        statusSummary: docData.statusSummary
      } as Case;
    });
  } catch (error) {
    console.error('Error fetching all cases by user ID:', error);
    throw error;
  }
}
