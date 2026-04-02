import { db, auth } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export interface SubscriptionStatus {
  status: 'active' | 'past_due' | 'none' | 'error' | 'loading';
  planId?: string;
  planName?: string;
  expiresAt?: number;
  errorMessage?: string;
}

export const PLAN_PROFILE_LIMITS: Record<string, number> = {
  'basic': 5,
  'standard': 5,
  'premium': 5,
  'none': 5,
};

export const SubscriptionService = {
  getSubscription: async (): Promise<SubscriptionStatus> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return { status: 'none' };
    
    const fetchSub = async (attempt = 1): Promise<SubscriptionStatus> => {
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'subscription', 'details'));
        if (snap.exists()) {
          return { ...(snap.data() as SubscriptionStatus), status: snap.data().status || 'active' };
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

    // Initial loading state
    callback({ status: 'loading' });

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
        
        if ((snap as any).exists()) {
          callback({ ...(snap.data() as SubscriptionStatus), status: snap.data().status || 'active' });
        } else {
          // IMPORTANT: If snap doesn't exist but is from cache, it might just be 
          // that the cache hasn't synced yet. We WAIT for server confirmation 
          // unless the server itself says the document is missing.
          if (!(snap as any).metadata.fromCache) {
            callback({ status: 'none' });
          } else {
            // Document missing from cache, stay in loading/error until server confirms
            callback({ status: 'loading' });
          }
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

  async initializePaystackTransaction(uid: string, email: string, amountKesh: number, planCode?: string) {
    try {
      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer sk_test_9b3a9f3183cae06895ff27c71f83968a9bccd14c`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: amountKesh * 100,
          // plan: planCode, // Requires plans to be created in your Paystack Dashboard to work
          callback_url: 'https://standard.paystack.co/close',
          metadata: {
            custom_fields: [
              {
                display_name: "User ID",
                variable_name: "user_id",
                value: uid
              },
              {
                display_name: "Action",
                variable_name: "action",
                value: "subscription_activation"
              }
            ]
          }
        }),
      });

      const data = await response.json();
      return data.status ? data.data.authorization_url : null;
    } catch (error) {
      console.error('Paystack initialization failed:', error);
      return null;
    }
  }
};
