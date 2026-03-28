import { auth, db } from './firebase';
import { 
  doc, 
  setDoc, 
  getDocs, 
  collection, 
  deleteDoc, 
  query,
  onSnapshot
} from 'firebase/firestore';

export const MyListService = {
  /**
   * Toggles an item in the user's "My List" for a specific profile.
   */
  async toggleItem(profileId: string, item: any) {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    if (!profileId || !item || !item.id) return;

    const itemId = item.id.toString();
    const docRef = doc(db, 'users', activeUid, 'profiles', profileId, 'myList', itemId);
    
    const exists = await this.isInList(profileId, itemId);
    
    if (exists) {
      await deleteDoc(docRef);
      return false; // Removed
    } else {
      await setDoc(docRef, {
        ...item,
        addedAt: Date.now()
      });
      return true; // Added
    }
  },

  /**
   * Checks if an item is in the user's "My List".
   */
  async isInList(profileId: string, itemId: string | number): Promise<boolean> {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    if (!profileId) return false;

    try {
      const colRef = collection(db, 'users', activeUid, 'profiles', profileId, 'myList');
      const querySnapshot = await getDocs(query(colRef));
      return querySnapshot.docs.some(doc => doc.id === itemId.toString());
    } catch (e) {
      return false;
    }
  },

  /**
   * Retrieves the full "My List" for a profile.
   */
  async getMyList(profileId: string): Promise<any[]> {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    if (!profileId) return [];

    try {
      const colRef = collection(db, 'users', activeUid, 'profiles', profileId, 'myList');
      const snapshot = await getDocs(colRef);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.error('[MyList] Error fetching list:', e);
      return [];
    }
  },

  /**
   * Listen for real-time changes to "My List".
   */
  subscribeToList(profileId: string, callback: (items: any[]) => void) {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    if (!profileId) return () => {};

    const colRef = collection(db, 'users', activeUid, 'profiles', profileId, 'myList');
    return onSnapshot(colRef, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(items);
    });
  }
};
