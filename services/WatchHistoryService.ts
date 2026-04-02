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
  season?: number;
  episode?: number;
  item: any;
}

export const WatchHistoryService = {
  // Build a storage key that is unique per episode for TV shows
  _buildStorageId(itemId: string, type: string, season?: number, episode?: number): string {
    if (type === 'tv' && season !== undefined && episode !== undefined) {
      return `${itemId}_s${season}_e${episode}`;
    }
    return itemId;
  },

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
      const storageId = this._buildStorageId(itemId, type, season, episode);
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

      // 1. Update Local Storage (ALWAYS) - PROFILE SPECIFIC
      // For TV shows, store per-episode AND update the "latest" entry for the show
      const localHistory = await this.getAllHistory(profileId);

      // Remove any existing entry with same storageId
      const filtered = localHistory.filter(h => {
        const hStorageId = this._buildStorageId(h.id.toString(), h.type, h.season, h.episode);
        return hStorageId !== storageId;
      });

      const updatedHistory = [newItem, ...filtered].slice(0, 100);
      await AsyncStorage.setItem(getHistoryKey(profileId), JSON.stringify(updatedHistory));

      // 2. Throttled Cloud Sync
      const activeUid = auth.currentUser?.uid || 'dev-guest';
      const lastSave = lastSaveProgressTime[storageId] || 0;
      
      if (now - lastSave >= THROTTLE_INTERVAL_MS) {
        lastSaveProgressTime[storageId] = now;
        const historyDocRef = doc(db, 'users', activeUid, 'profiles', profileId, 'watchHistory', storageId);
        await setDoc(historyDocRef, {
          ...newItem,
          lastUpdated: serverTimestamp(),
        }, { merge: true });
      }
    } catch (e) {
      console.error('[WatchHistory] Failed to save progress:', e);
    }
  },

  async getProgress(profileId: string, itemId: string | number, season?: number, episode?: number): Promise<WatchHistoryItem | null> {
    try {
      if (!profileId) return null;
      const history = await this.getAllHistory(profileId);
      const id = itemId.toString();

      // For TV shows, look for exact episode match first
      if (season !== undefined && episode !== undefined) {
        const episodeMatch = history.find(h => 
          h.id.toString() === id && h.season === season && h.episode === episode
        );
        if (episodeMatch) return episodeMatch;
      }

      // Fallback: find the most recent entry for this show (for resuming from details page)
      return history.find(h => h.id.toString() === id) || null;
    } catch (e) {
      return null;
    }
  },

  async getAllHistory(profileId: string): Promise<WatchHistoryItem[]> {
    try {
      if (!profileId) return [];
      const data = await AsyncStorage.getItem(getHistoryKey(profileId));
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

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

      const localHistory = await this.getAllHistory(profileId);
      const combined = [...remoteHistory];
      
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

  async removeFromHistory(profileId: string, itemId: string | number) {
    try {
      if (!profileId) return;
      const history = await this.getAllHistory(profileId);
      const updated = history.filter(h => h.id.toString() !== itemId.toString());
      await AsyncStorage.setItem(getHistoryKey(profileId), JSON.stringify(updated));

      const activeUid = auth.currentUser?.uid || 'dev-guest';
      await deleteDoc(doc(db, 'users', activeUid, 'profiles', profileId, 'watchHistory', itemId.toString()));
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
