import { db, auth } from './firebase';
import { doc, setDoc, onSnapshot, getDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';

export type RatingValue = 'none' | 'dislike' | 'like' | 'love';

export const RatingsService = {
  subscribeToRating: (profileId: string, tmdbId: string, callback: (rating: RatingValue) => void) => {
    const activeUid = auth.currentUser?.uid;
    if (!activeUid || !profileId || !tmdbId) {
      callback('none');
      return () => {};
    }

    const ratingDocRef = doc(db, 'users', activeUid, 'profiles', profileId, 'ratings', tmdbId.toString());
    
    return onSnapshot(ratingDocRef, (docSnap) => {
      if (docSnap.exists()) {
        callback(docSnap.data().rating as RatingValue);
      } else {
        callback('none');
      }
    });
  },

  setRating: async (profileId: string, item: { id: string, title?: string, type: string, poster_path?: string }, rating: RatingValue) => {
    const activeUid = auth.currentUser?.uid;
    if (!activeUid || !profileId || !item.id) return;

    const ratingDocRef = doc(db, 'users', activeUid, 'profiles', profileId, 'ratings', item.id.toString());

    if (rating === 'none') {
        await deleteDoc(ratingDocRef);
    } else {
        await setDoc(ratingDocRef, {
            tmdbId: item.id.toString(),
            title: item.title || '',
            type: item.type,
            poster_path: item.poster_path || '',
            rating,
            updatedAt: Date.now()
        }, { merge: true });
    }
  }
};
