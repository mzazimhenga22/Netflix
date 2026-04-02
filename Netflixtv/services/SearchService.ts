import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from './firebase';
import { 
  doc, 
  setDoc, 
  getDocs, 
  collection, 
  query, 
  orderBy, 
  limit, 
  deleteDoc,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';

const getSearchHistoryKey = (profileId: string) => `netflix_search_history_${profileId}`;

export const SearchService = {
  async saveSearch(profileId: string, queryText: string) {
    if (!profileId || !queryText.trim()) return;
    
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    const cleanQuery = queryText.trim().toLowerCase();

    try {
      // 1. Update Local Storage
      const localHistory = await this.getRecentSearchesLocal(profileId);
      const updatedHistory = [
        cleanQuery,
        ...localHistory.filter(q => q !== cleanQuery)
      ].slice(0, 10);
      
      await AsyncStorage.setItem(getSearchHistoryKey(profileId), JSON.stringify(updatedHistory));

      // 2. Sync to Firestore
      if (activeUid !== 'dev-guest') {
        const searchDocId = cleanQuery.replace(/[^a-z0-9]/g, '_');
        const searchDocRef = doc(db, 'users', activeUid, 'profiles', profileId, 'searchHistory', searchDocId);
        await setDoc(searchDocRef, {
          query: cleanQuery,
          timestamp: serverTimestamp()
        });
      }
    } catch (e) {
      console.error('[SearchService] Failed to save search:', e);
    }
  },

  async getRecentSearchesLocal(profileId: string): Promise<string[]> {
    try {
      if (!profileId) return [];
      const data = await AsyncStorage.getItem(getSearchHistoryKey(profileId));
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  async clearSearchHistory(profileId: string) {
    if (!profileId) return;
    try {
      await AsyncStorage.removeItem(getSearchHistoryKey(profileId));
    } catch (e) {}
  },

  subscribeToRecentSearches(profileId: string, callback: (queries: string[]) => void) {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    if (!profileId || activeUid === 'dev-guest') return () => {};

    const colRef = collection(db, 'users', activeUid, 'profiles', profileId, 'searchHistory');
    const q = query(colRef, orderBy('timestamp', 'desc'), limit(10));
    
    return onSnapshot(q, (snapshot) => {
      const queries = snapshot.docs.map(doc => doc.data().query);
      callback(queries);
    });
  }
};
