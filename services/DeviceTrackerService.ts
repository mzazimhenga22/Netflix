import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, auth } from './firebase';
import { doc, setDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'netflix_clone_device_id';

function generateDeviceId() {
  return 'device_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

export const DeviceTrackerService = {
  getDeviceId: async () => {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = generateDeviceId();
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  },

  registerDevice: async () => {
    const activeUid = auth.currentUser?.uid;
    if (!activeUid) return;

    const deviceId = await DeviceTrackerService.getDeviceId();
    const deviceName = Platform.OS === 'ios' ? 'Apple iPhone' : Platform.OS === 'android' ? 'Android Device' : 'Web Browser';

    try {
      await setDoc(doc(db, 'users', activeUid, 'devices', deviceId), {
        id: deviceId,
        name: deviceName,
        os: Platform.OS,
        lastActive: Date.now()
      }, { merge: true });
    } catch (e) {
      console.error('[DeviceTracker] Failed to register:', e);
    }
  },

  getDevices: async () => {
    const activeUid = auth.currentUser?.uid;
    if (!activeUid) return [];

    try {
      const snap = await getDocs(collection(db, 'users', activeUid, 'devices'));
      return snap.docs.map(doc => doc.data());
    } catch (e) {
      console.error('[DeviceTracker] Failed to get devices:', e);
      return [];
    }
  },

  revokeDevice: async (deviceId: string) => {
    const activeUid = auth.currentUser?.uid;
    if (!activeUid) return;

    try {
      await deleteDoc(doc(db, 'users', activeUid, 'devices', deviceId));
    } catch (e) {
      console.error('[DeviceTracker] Failed to revoke device:', e);
    }
  }
};
