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

const getHistoryKey = (profileId: string) => `netflix_watch_history_${profileId}`;
const THROTTLE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const lastSaveProgressTime: Record<string, number> = {};

export interface WatchHistoryItem {
  id: string | number;
  type: 'movie' | 'tv';
  currentTime: number;
  duration: number;
  lastUpdated: number;
  season?: number;    // NEW: For TV Shows
  episode?: number;   // NEW: For TV Shows
  item: any; // Store the movie/tv item object for row display
}

export const WatchHistoryService = {
  /**
   * Saves progress both locally and to Firestore (if logged in).
   * Local updates happen immediately; Firestore is throttled to every 3 minutes.
   */
  async saveProgress(
    item: any, 
    type: 'movie' | 'tv', 
    currentTime: number, 
    duration: number, 
    profileId: string, // REQUIRED
    season?: number, 
    episode?: number
  ) {
    try {
      if (!item || !item.id || !profileId) return;

      const itemId = item.id.toString();
      const now = Date.now();

      const newItem: WatchHistoryItem = {
        id: itemId,
        type,
        currentTime,
        duration,
        lastUpdated: now,
        item
      };
      
      // Firestore does not allow undefined. Only add if present.
      if (season !== undefined && season !== null) newItem.season = season;
      if (episode !== undefined && episode !== null) newItem.episode = episode;

      // 1. Update Local Storage (ALWAYS) - PROFILE SPECIFIC
      const localHistory = await this.getAllHistory(profileId);
      const updatedHistory = [
        newItem,
        ...localHistory.filter(h => h.id.toString() !== itemId)
      ].slice(0, 50);
      await AsyncStorage.setItem(getHistoryKey(profileId), JSON.stringify(updatedHistory));

      // 2. Throttled Cloud Sync
      const activeUid = auth.currentUser?.uid || 'dev-guest';
      const lastSave = lastSaveProgressTime[itemId] || 0;
      
      if (now - lastSave >= THROTTLE_INTERVAL_MS) {
        lastSaveProgressTime[itemId] = now;
        const historyDocRef = doc(db, 'users', activeUid, 'profiles', profileId, 'watchHistory', itemId);
        await setDoc(historyDocRef, {
          ...newItem,
          lastUpdated: serverTimestamp(), // Use server time for reliable syncing
        }, { merge: true });
      }
    } catch (e) {
      console.error('[WatchHistory] Failed to save progress:', e);
    }
  },

  /**
   * Retrieves playback progress for a specific item.
   */
  async getProgress(profileId: string, itemId: string | number): Promise<WatchHistoryItem | null> {
    try {
      if (!profileId) return null;
      const history = await this.getAllHistory(profileId);
      return history.find(h => h.id.toString() === itemId.toString()) || null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Retrieves all items in the local watch history.
   */
  async getAllHistory(profileId: string): Promise<WatchHistoryItem[]> {
    try {
      if (!profileId) return [];
      const data = await AsyncStorage.getItem(getHistoryKey(profileId));
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('[WatchHistory] Failed to get history:', e);
      return [];
    }
  },

  /**
   * Syncs the local history with Firestore data.
   * Pulls the most recent items from the cloud and merges them into local storage.
   */
  async syncWithFirestore(profileId: string) {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    if (!profileId) return [];

    try {
      const historyColRef = collection(db, 'users', activeUid, 'profiles', profileId, 'watchHistory');
      const q = query(historyColRef, orderBy('lastUpdated', 'desc'), limit(50));
      const querySnapshot = await getDocs(q);

      const remoteHistory: WatchHistoryItem[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        remoteHistory.push({
          ...data,
          lastUpdated: data.lastUpdated?.toMillis?.() || Date.now(),
        } as WatchHistoryItem);
      });

      if (remoteHistory.length === 0) return await this.getAllHistory(profileId);

      // Merge Remote and Local
      const localHistory = await this.getAllHistory(profileId);
      const combined = [...remoteHistory];
      
      // Add local items that aren't in remote (or are newer - but usually remote is source of truth)
      localHistory.forEach(localItem => {
        if (!combined.some(r => r.id.toString() === localItem.id.toString())) {
          combined.push(localItem);
        }
      });

      const finalHistory = combined
        .sort((a, b) => b.lastUpdated - a.lastUpdated)
        .slice(0, 50);

      await AsyncStorage.setItem(getHistoryKey(profileId), JSON.stringify(finalHistory));
      return finalHistory;
    } catch (e) {
      console.error('[WatchHistory] Sync failed:', e);
      return await this.getAllHistory(profileId);
    }
  },

  /**
   * Removes an item from history.
   */
  async removeFromHistory(profileId: string, itemId: string | number) {
    try {
      if (!profileId) return;
      // Remove Local
      const history = await this.getAllHistory(profileId);
      const updated = history.filter(h => h.id.toString() !== itemId.toString());
      await AsyncStorage.setItem(getHistoryKey(profileId), JSON.stringify(updated));

      // Remove Remote
      const activeUid = auth.currentUser?.uid || 'dev-guest';
      await deleteDoc(doc(db, 'users', activeUid, 'profiles', profileId, 'watchHistory', itemId.toString()));
    } catch (e) {}
  },

  /**
   * Subscribes to watch history updates for a specific profile.
   */
  subscribeToHistory(profileId: string, callback: (items: any[]) => void) {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    if (!profileId) return () => {};

    const colRef = collection(db, 'users', activeUid, 'profiles', profileId, 'watchHistory');
    return onSnapshot(colRef, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(items);
    });
  }
};
