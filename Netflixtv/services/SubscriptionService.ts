import { db, auth } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SubscriptionStatus {
  status: 'active' | 'past_due' | 'none' | 'error' | 'loading';
  planId?: string;
  planName?: string;
  expiresAt?: number;
  errorMessage?: string;
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
    
    const fetchSub = async (attempt = 1): Promise<SubscriptionStatus> => {
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'subscription', 'details'));
        if (snap.exists()) {
          const data = { ...(snap.data() as SubscriptionStatus), status: snap.data().status || 'none' };
          AsyncStorage.setItem(`sub_status_${uid}`, JSON.stringify(data)).catch(() => {});
          return data;
        }
        return { status: 'none' };
      } catch (e: any) {
        console.error(`[SubscriptionService] Error (Attempt ${attempt}):`, e);
        
        // Connectivity error handling
        const isNetworkError = e?.code === 'unavailable' || e?.message?.toLowerCase().includes('offline') || e?.message?.toLowerCase().includes('network');
        
        if (isNetworkError && attempt < 3) {
          const delay = attempt * 2000;
          console.warn(`[SubscriptionService] Network error, retrying in ${delay/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchSub(attempt + 1);
        }
        
        try {
          const cached = await AsyncStorage.getItem(`sub_status_${uid}`);
          if (cached) {
            console.log('[SubscriptionService] Returning cached subscription offline');
            return JSON.parse(cached) as SubscriptionStatus;
          }
        } catch (_) {}
        
        return { 
          status: 'error', 
          errorMessage: isNetworkError ? 'Network connectivity issue. Please check your internet.' : 'Failed to load subscription details.' 
        };
      }
    };

    return fetchSub();
  },

  listenToSubscription: (callback: (sub: SubscriptionStatus) => void) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      callback({ status: 'none' });
      return () => {};
    }

    // Load cached subscription status first so UI is responsive offline
    AsyncStorage.getItem(`sub_status_${uid}`).then(cached => {
      if (cached) {
        callback(JSON.parse(cached) as SubscriptionStatus);
      } else {
        callback({ status: 'loading' });
      }
    }).catch(() => {
      callback({ status: 'loading' });
    });

    // Timeout to prevent infinite loading on broken networks
    const timeout = setTimeout(() => {
      callback({ 
        status: 'error', 
        errorMessage: 'Connection timed out. We are still trying to verify your subscription...' 
      });
    }, 15000);

    return onSnapshot(doc(db, 'users', uid, 'subscription', 'details'), 
      (snap) => {
        // Clear timeout once we get ANY non-error result from Firestore
        clearTimeout(timeout);
        
        const snapData = snap.data();
        if (snap.exists() && snapData) {
          const data = { ...(snapData as SubscriptionStatus), status: snapData.status || 'none' };
          AsyncStorage.setItem(`sub_status_${uid}`, JSON.stringify(data)).catch(() => {});
          callback(data);
        } else {
          // Document doesn't exist — user is on the free plan.
          // Whether from cache or server, treat as 'none' (restricted) to
          // prevent free users bypassing the lock while waiting for server sync.
          // BUT: If the snapshot is empty and comes from cache (offline), do NOT downgrade!
          if (snap.metadata.fromCache) {
            console.log('[SubscriptionService] Ignoring empty subscription snapshot from cache (offline)');
            return;
          }
          callback({ status: 'none' });
        }
      },
      (error) => {
        clearTimeout(timeout);
        console.error('[SubscriptionService] Snapshot error:', error);
        callback({ status: 'error', errorMessage: 'Network synchronization failed. Please check your internet.' });
      }
    );
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
