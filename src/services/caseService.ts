import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  limit,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';

// TODO: Replace admin-created data with webhook (Zapier) or Clio API integration

export interface Case {
  id?: string;
  userId: string;
  caseStage: string;
  statusSummary: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export const CASE_STAGES = [
  'New Case (Onboarding)',
  'Treatment Ongoing',
  'Treatment Complete',
  'Case Closed',
] as const;

export type CaseStage = typeof CASE_STAGES[number];

/**
 * Service to manage Case data.
 * Built as an abstraction to avoid tight coupling between the UI and backend data source.
 * Designed so any function can be swapped to call a Cloud Function / external API.
 */

// ─────────────────────────────────────────────
// CLIENT-FACING READS
// ─────────────────────────────────────────────

/**
 * Retrieves the first case associated with a particular user.
 *
 * @param userId - The authenticated user's ID
 * @returns The associated Case object, or null if no case exists.
 */
export async function getCaseByUserId(userId: string): Promise<Case | null> {
  try {
    const casesRef = collection(db, 'cases');
    const q = query(casesRef, where('userId', '==', userId), limit(1));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];
    const docData = docSnap.data();
    return {
      id: docSnap.id,
      userId: docData.userId,
      caseStage: docData.caseStage,
      statusSummary: docData.statusSummary,
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

    if (snapshot.empty) return [];

    return snapshot.docs.map(docSnap => {
      const docData = docSnap.data();
      return {
        id: docSnap.id,
        userId: docData.userId,
        caseStage: docData.caseStage,
        statusSummary: docData.statusSummary,
      } as Case;
    });
  } catch (error) {
    console.error('Error fetching all cases by user ID:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────
// ADMIN OPERATIONS
// ─────────────────────────────────────────────

/**
 * [ADMIN] Retrieves ALL cases across all users.
 * Used by the admin dashboard to display and manage the full case list.
 *
 * TODO: Replace admin-created data with webhook (Zapier) or Clio API integration
 *
 * @returns Array of all Case objects with their Firestore document IDs.
 */
export async function getAllCases(): Promise<Case[]> {
  try {
    const snapshot = await getDocs(collection(db, 'cases'));
    if (snapshot.empty) return [];

    return snapshot.docs.map(docSnap => {
      const docData = docSnap.data();
      return {
        id: docSnap.id,
        userId: docData.userId,
        caseStage: docData.caseStage,
        statusSummary: docData.statusSummary,
      } as Case;
    });
  } catch (error) {
    console.error('Error fetching all cases:', error);
    throw error;
  }
}

/**
 * [ADMIN] Creates a new case document in Firestore.
 * Data structure mirrors the future webhook payload format from Clio/Zapier.
 *
 * TODO: Replace admin-created data with webhook (Zapier) or Clio API integration
 *
 * @param caseData - Object matching { userId, caseStage, statusSummary }
 * @returns The ID of the newly created Firestore document.
 */
export async function createCase(
  caseData: Pick<Case, 'userId' | 'caseStage' | 'statusSummary'>
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'cases'), {
      userId: caseData.userId,
      caseStage: caseData.caseStage,
      statusSummary: caseData.statusSummary,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating case:', error);
    throw error;
  }
}

/**
 * [ADMIN] Updates an existing case by its Firestore document ID.
 *
 * TODO: Replace admin-created data with webhook (Zapier) or Clio API integration
 *
 * @param caseId - The Firestore document ID of the case to update
 * @param updates - Partial case fields to update
 */
export async function updateCase(
  caseId: string,
  updates: Partial<Pick<Case, 'caseStage' | 'statusSummary'>>
): Promise<void> {
  try {
    const caseRef = doc(db, 'cases', caseId);
    await updateDoc(caseRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating case:', error);
    throw error;
  }
}
