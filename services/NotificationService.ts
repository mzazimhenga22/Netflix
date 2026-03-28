import { db, auth } from './firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';

export interface NetflixNotification {
  id: string;
  type: string;
  title: string;
  desc: string;
  date: string;
  image: string;
  isRead: boolean;
  createdAt: number;
}

export const NotificationService = {
  subscribeToNotifications: (profileId: string, callback: (notifications: NetflixNotification[]) => void) => {
    const activeUid = auth.currentUser?.uid;
    if (!activeUid || !profileId) {
      callback([]);
      return () => {};
    }

    const q = query(
      collection(db, 'users', activeUid, 'profiles', profileId, 'notifications'),
      orderBy('createdAt', 'desc')
    );

    return onSnapshot(q, (snapshot) => {
      const notifs: NetflixNotification[] = [];
      snapshot.forEach(docSnap => {
        notifs.push({ id: docSnap.id, ...docSnap.data() } as NetflixNotification);
      });
      callback(notifs);
    });
  },

  markAsRead: async (profileId: string, notificationId: string) => {
    const activeUid = auth.currentUser?.uid;
    if (!activeUid || !profileId) return;

    try {
      await updateDoc(doc(db, 'users', activeUid, 'profiles', profileId, 'notifications', notificationId), {
        isRead: true
      });
    } catch (e) {
      console.error('[NotificationService] Failed to mark read:', e);
    }
  },

  seedMockNotifications: async (profileId: string) => {
    const activeUid = auth.currentUser?.uid;
    if (!activeUid || !profileId) return;

    const mocks = [
      {
        id: 'mock1',
        type: 'New Arrival',
        title: 'Stranger Things 5',
        desc: 'The epic conclusion is here.',
        date: 'Today',
        image: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfSA8sQcw1959.jpg',
        isRead: false,
        createdAt: Date.now()
      },
      {
        id: 'mock2',
        type: 'Top Pick for You',
        title: 'Wednesday',
        desc: 'Because you watched The Addams Family.',
        date: 'Yesterday',
        image: 'https://image.tmdb.org/t/p/w500/9PFonBhy4cQy7Jz20NpMygczOo.jpg',
        isRead: true,
        createdAt: Date.now() - 86400000
      }
    ];

    for (const m of mocks) {
      await setDoc(doc(db, 'users', activeUid, 'profiles', profileId, 'notifications', m.id), m, { merge: true });
    }
  }
};
