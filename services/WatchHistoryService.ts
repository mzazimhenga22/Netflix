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

const WATCH_HISTORY_KEY = 'netflix_phone_watch_history';
const THROTTLE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const lastSaveProgressTime: Record<string, number> = {};

export interface WatchHistoryItem {
  id: string | number;
  type: 'movie' | 'tv';
  currentTime: number;
  duration: number;
  lastUpdated: number;
  season?: number;
  episode?: number;
  item: any;
}

export const WatchHistoryService = {
  async saveProgress(
    item: any, 
    type: 'movie' | 'tv', 
    currentTime: number, 
    duration: number, 
    profileId?: string,
    season?: number, 
    episode?: number
  ) {
    try {
      if (!item || !item.id) return;

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
      
      if (season !== undefined && season !== null) newItem.season = season;
      if (episode !== undefined && episode !== null) newItem.episode = episode;

      // 1. Update Local Storage (ALWAYS)
      const localHistory = await this.getAllHistory();
      const updatedHistory = [
        newItem,
        ...localHistory.filter(h => h.id.toString() !== itemId)
      ].slice(0, 50);
      await AsyncStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(updatedHistory));

      // 2. Throttled Cloud Sync
      const activeUid = auth.currentUser?.uid || 'dev-guest';
      const lastSave = lastSaveProgressTime[itemId] || 0;
      
      if (profileId && (now - lastSave >= THROTTLE_INTERVAL_MS)) {
        lastSaveProgressTime[itemId] = now;
        const historyDocRef = doc(db, 'users', activeUid, 'profiles', profileId, 'watchHistory', itemId);
        await setDoc(historyDocRef, {
          ...newItem,
          lastUpdated: serverTimestamp(),
        }, { merge: true });
      }
    } catch (e) {
      console.error('[WatchHistory] Failed to save progress:', e);
    }
  },

  async getProgress(itemId: string | number): Promise<WatchHistoryItem | null> {
    try {
      const history = await this.getAllHistory();
      return history.find(h => h.id.toString() === itemId.toString()) || null;
    } catch (e) {
      return null;
    }
  },

  async getAllHistory(): Promise<WatchHistoryItem[]> {
    try {
      const data = await AsyncStorage.getItem(WATCH_HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  async syncWithFirestore(profileId: string) {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    if (!profileId) return;

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

      if (remoteHistory.length === 0) return await this.getAllHistory();

      const localHistory = await this.getAllHistory();
      const combined = [...remoteHistory];
      
      localHistory.forEach(localItem => {
        if (!combined.some(r => r.id.toString() === localItem.id.toString())) {
          combined.push(localItem);
        }
      });

      const finalHistory = combined
        .sort((a, b) => b.lastUpdated - a.lastUpdated)
        .slice(0, 50);

      await AsyncStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(finalHistory));
      return finalHistory;
    } catch (e) {
      console.error('[WatchHistory] Sync failed:', e);
      return await this.getAllHistory();
    }
  },

  async removeFromHistory(itemId: string | number, profileId?: string) {
    try {
      const history = await this.getAllHistory();
      const updated = history.filter(h => h.id.toString() !== itemId.toString());
      await AsyncStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(updated));

      const activeUid = auth.currentUser?.uid || 'dev-guest';
      if (profileId) {
        await deleteDoc(doc(db, 'users', activeUid, 'profiles', profileId, 'watchHistory', itemId.toString()));
      }
    } catch (e) {}
  },

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
