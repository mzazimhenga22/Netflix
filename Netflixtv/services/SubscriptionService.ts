import { db, auth } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

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
  'none': 2, // default free/expired fallback
};

export const SubscriptionService = {
  getSubscription: async (): Promise<SubscriptionStatus> => {
    const uid = auth.currentUser?.uid;
    if (!uid) return { status: 'none' };
    
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'subscription', 'details'));
      if (snap.exists()) {
        return snap.data() as SubscriptionStatus;
      }
    } catch (e) {
      console.error('[SubscriptionService] Error getting sub:', e);
    }
    return { status: 'none' };
  },

  listenToSubscription: (callback: (sub: SubscriptionStatus) => void) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      callback({ status: 'none' });
      return () => {};
    }

    return onSnapshot(doc(db, 'users', uid, 'subscription', 'details'), (snap) => {
      if (snap.exists()) {
        callback(snap.data() as SubscriptionStatus);
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
