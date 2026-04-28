import { db, auth } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SubscriptionStatus {
  status: 'active' | 'past_due' | 'none';
  planId?: string;
  planName?: string;
  expiresAt?: number;
}

export const PLAN_PROFILE_LIMITS: Record<string, number> = {
  'basic': 2,
  'standard': 4,
  'premium': 5,
  'none': 1,
};

export const SubscriptionService = {
  getSubscription: async (): Promise<SubscriptionStatus> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return { status: 'none' };
    
    const fetchSub = async (): Promise<SubscriptionStatus> => {
      try {
        // Create a timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), 3000);
        });

        // Race the Firestore network call against the 3-second timeout
        const snap = await Promise.race([
          getDoc(doc(db, 'users', uid, 'subscription', 'details')),
          timeoutPromise
        ]);

        if (snap && (snap as any).exists && (snap as any).exists()) {
          const data = (snap as any).data() as SubscriptionStatus;
          // Cache the latest active status for offline use
          AsyncStorage.setItem(`sub_status_${uid}`, JSON.stringify(data));
          return data;
        }
      } catch (e: any) {
        // If it timed out, is offline, or failed, fallback to our offline cache
        console.warn('[SubscriptionService] Network/Timeout error, falling back to cache:', e?.message || e);
        const cached = await AsyncStorage.getItem(`sub_status_${uid}`);
        if (cached) {
          console.log('[SubscriptionService] Offline fallback: Returning cached subscription.');
          return JSON.parse(cached) as SubscriptionStatus;
        }
      }
      return { status: 'none' };
    };

    return fetchSub();
  },

  listenToSubscription: (callback: (sub: SubscriptionStatus) => void) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      callback({ status: 'none' });
      return () => {};
    }

    // Load cached first so UI doesn't bounce while waiting for Firestore connection
    AsyncStorage.getItem(`sub_status_${uid}`).then(cached => {
      if (cached) callback(JSON.parse(cached) as SubscriptionStatus);
    });

    return onSnapshot(doc(db, 'users', uid, 'subscription', 'details'), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as SubscriptionStatus;
        AsyncStorage.setItem(`sub_status_${uid}`, JSON.stringify(data));
        callback(data);
      } else {
        callback({ status: 'none' });
      }
    });
  },

  activateSubscription: async (planId: string, planName: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      await setDoc(doc(db, 'users', uid, 'subscription', 'details'), {
        status: 'active',
        planId,
        planName,
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days from now
      }, { merge: true });
    } catch (e) {
      console.error('[SubscriptionService] Error activating sub:', e);
    }
  },

  async initializePayHeroTransaction(uid: string, amount: number) {
    try {
      const baseUrl =
        process.env.EXPO_PUBLIC_PAYHERO_URL ||
        process.env.EXPO_PUBLIC_PAYMENT_URL ||
        process.env.EXPO_PUBLIC_LIPWA_LINK ||
        'https://lipwa.link/7976';
      
      // Construct the checkout URL with parameters for tracking
      // reference: used to track the payment back to the user UID in our webhook
      // success_url: allows the app to detect when the payment is completed
      const successUrl = encodeURIComponent('https://lipwa.link/success?status=success');
      const separator = baseUrl.includes('?') ? '&' : '?';
      const checkoutUrl = `${baseUrl}${separator}amount=${amount}&reference=${encodeURIComponent(uid)}&success_url=${successUrl}`;
      
      return checkoutUrl;
    } catch (error) {
      console.error('Pay Hero initialization failed:', error);
      return null;
    }
  }
};
