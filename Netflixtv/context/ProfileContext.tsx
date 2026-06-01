import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { SubscriptionService, PLAN_PROFILE_LIMITS, SubscriptionStatus } from '../services/SubscriptionService';
import {
  collection,
  addDoc,
  setDoc,
  doc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';

export interface Profile {
  id: string;
  name: string;
  avatar: any;
  avatarId: string;
  isLocked?: boolean;
  pin?: string;
  isKids?: boolean;
  maturityLevel?: 'G' | 'PG' | 'TV-14' | 'MA';
}

export const AVATAR_MAP: Record<string, any> = {
  avatar1: require('../assets/avatars/avatar1.png'),
  avatar2: require('../assets/avatars/avatar2.png'),
  avatar3: require('../assets/avatars/avatar3.png'),
  avatar4: require('../assets/avatars/avatar4.png'),
  avatar5: require('../assets/avatars/avatar5.png'),
  avatar6: require('../assets/avatars/avatar6.png'),
  avatar7: require('../assets/avatars/avatar7.png'),
  avatar8: require('../assets/avatars/avatar8.png'),
  avatar9: require('../assets/avatars/avatar9.png'),
  avatar10: require('../assets/avatars/avatar10.png'),
};

interface ProfileContextType {
  profiles: Profile[];
  selectedProfile: Profile | null;
  selectProfile: (profile: Profile) => void;
  addProfile: (name: string, avatarId: string, isLocked?: boolean, pin?: string, isKids?: boolean, maturityLevel?: 'G' | 'PG' | 'TV-14' | 'MA') => void;
  updateProfile: (id: string, name: string, avatarId: string, isLocked?: boolean, pin?: string, isKids?: boolean, maturityLevel?: 'G' | 'PG' | 'TV-14' | 'MA') => void;
  deleteProfile: (id: string) => void;
  isLoading: boolean;
  canAddProfile: boolean;
  maxProfilesAllowed: number;
  subscriptionStatus: SubscriptionStatus;
}

const ProfileContext = createContext<ProfileContextType>({
  profiles: [],
  selectedProfile: null,
  selectProfile: () => {},
  addProfile: () => {},
  updateProfile: () => {},
  deleteProfile: () => {},
  isLoading: true,
  canAddProfile: true,
  maxProfilesAllowed: 1,
  subscriptionStatus: { status: 'loading' },
});



export function useProfile() {
  return useContext(ProfileContext);
}

const SELECTED_PROFILE_KEY = 'netflix_selected_profile_id';
const getProfilesCacheKey = (uid: string) => `netflix_profiles_cache_${uid}`;

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [maxProfilesAllowed, setMaxProfilesAllowed] = useState(1);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({ status: 'loading' });

  useEffect(() => {
    // Wait for auth to be ready before subscribing to subscription status.
    let subUnsub: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous subscription listener on auth state change
      if (subUnsub) { subUnsub(); subUnsub = null; }

      if (user) {
        subUnsub = SubscriptionService.listenToSubscription((sub) => {
          setSubscriptionStatus(sub);
          const limit = sub?.status === 'active'
            ? (PLAN_PROFILE_LIMITS[sub?.planId || 'none'] || 1)
            : 1;
          setMaxProfilesAllowed(limit);
        });
      } else {
        setSubscriptionStatus({ status: 'none' });
        setMaxProfilesAllowed(1);
      }
    });
    return () => {
      unsubAuth();
      if (subUnsub) subUnsub();
    };
  }, []);

  // 1. Listen for Auth Changes and Fetch Profiles
  useEffect(() => {
    let unsubProfiles: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      const activeUid = user ? user.uid : 'dev-guest';
      setIsLoading(true);

      // Clean up previous listener
      if (unsubProfiles) unsubProfiles();

      AsyncStorage.getItem(getProfilesCacheKey(activeUid))
        .then((cached) => {
          if (!cached) return;
          const parsed = JSON.parse(cached) as Omit<Profile, 'avatar'>[];
          if (!Array.isArray(parsed) || parsed.length === 0) return;

          const cachedProfiles = parsed.map((profile) => ({
            ...profile,
            avatar: AVATAR_MAP[profile.avatarId] || AVATAR_MAP.avatar1,
          }));

          setProfiles(cachedProfiles);
          setIsLoading(false);
        })
        .catch(() => {});

      const profilesCol = collection(db, 'users', activeUid, 'profiles');
      
      // Listen for realtime profile changes
      unsubProfiles = onSnapshot(profilesCol, (snapshot) => {
        // Safeguard: If snapshot is from cache and it's empty, ignore it (we are offline)
        if (snapshot.empty && snapshot.metadata.fromCache) {
          console.log('[ProfileContext] Ignoring empty snapshot from cache (offline)');
          setIsLoading(false);
          return;
        }

        let fetchedProfiles: Profile[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          fetchedProfiles.push({
            id: doc.id,
            name: data.name,
            avatarId: data.avatarId,
            avatar: AVATAR_MAP[data.avatarId] || AVATAR_MAP.avatar1,
            isLocked: data.isLocked,
            pin: data.pin,
            isKids: data.isKids === true || data.isKids === 'true',
            maturityLevel: data.maturityLevel || (data.isKids ? 'G' : 'MA')
          });
        });

        // Safeguard: If fetchedProfiles is empty but metadata indicates cache, ignore it
        if (fetchedProfiles.length === 0 && snapshot.metadata.fromCache) {
          console.log('[ProfileContext] Ignoring empty fetched profiles from cache snapshot');
          setIsLoading(false);
          return;
        }

        // Only update local state if fetchedProfiles has items OR we are online (!fromCache)
        if (fetchedProfiles.length > 0 || !snapshot.metadata.fromCache) {
          setProfiles(fetchedProfiles);
          
          if (fetchedProfiles.length > 0) {
            AsyncStorage.setItem(
              getProfilesCacheKey(activeUid),
              JSON.stringify(
                fetchedProfiles.map(({ avatar, ...profile }) => profile)
              )
            ).catch(() => {});
          }
        }

        // Restore selected profile from storage if not set in memory
        if (fetchedProfiles.length > 0) {
          AsyncStorage.getItem(SELECTED_PROFILE_KEY).then(savedId => {
            if (!savedId) return;
            const matched = fetchedProfiles.find(p => p.id === savedId);
            if (!matched) return;
            setSelectedProfile((current) => current ?? matched);
          });
        }

        setSelectedProfile((current) => {
          if (!current) return current;
          const matched = fetchedProfiles.find((p) => p.id === current.id);
          return matched || null;
        });

        setIsLoading(false);
      }, (error) => {
        AsyncStorage.getItem(getProfilesCacheKey(activeUid))
          .then((cached) => {
            if (!cached) return;
            const parsed = JSON.parse(cached) as Omit<Profile, 'avatar'>[];
            if (!Array.isArray(parsed)) return;
            setProfiles(parsed.map((profile) => ({
              ...profile,
              avatar: AVATAR_MAP[profile.avatarId] || AVATAR_MAP.avatar1,
            })));
          })
          .catch(() => {});
        setIsLoading(false);
      });
    });

    return () => {
      unsubAuth();
      if (unsubProfiles) unsubProfiles();
    };
  }, []);

  const selectProfile = async (profile: Profile) => {
    setSelectedProfile(profile);
    await AsyncStorage.setItem(SELECTED_PROFILE_KEY, profile.id);

    // Defer cloud sync so profile selection stays responsive on weak networks.
    setTimeout(() => {
      try {
        const { WatchHistoryService } = require('../services/WatchHistoryService');
        WatchHistoryService.syncWithFirestore(profile.id);
      } catch (e) {
        console.error('[ProfileContext] Failed to sync watch history:', e);
      }
    }, 0);
  };

  const addProfile = async (name: string, avatarId: string, isLocked = false, pin = '', isKids = false, maturityLevel?: 'G' | 'PG' | 'TV-14' | 'MA') => {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    if (profiles.length >= maxProfilesAllowed) {
      console.warn('[Profiles] Max profile limit reached:', maxProfilesAllowed);
      return;
    }
    try {
      console.log('[Profiles] Adding profile for:', activeUid);
      await addDoc(collection(db, 'users', activeUid, 'profiles'), {
        name,
        avatarId,
        isLocked,
        pin,
        isKids,
        maturityLevel: maturityLevel || (isKids ? 'G' : 'MA'),
        createdAt: Date.now()
      });
    } catch (e) {
      console.error('[Profiles] Create failed:', e);
    }
  };

  const updateProfile = async (id: string, name: string, avatarId: string, isLocked = false, pin = '', isKids = false, maturityLevel?: 'G' | 'PG' | 'TV-14' | 'MA') => {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    try {
       console.log('[Profiles] Updating profile:', id);
       await setDoc(doc(db, 'users', activeUid, 'profiles', id), {
        name,
        avatarId,
        isLocked,
        pin,
        isKids,
        maturityLevel: maturityLevel || (isKids ? 'G' : 'MA')
      }, { merge: true });
    } catch (e) {
      console.error('[Profiles] Update failed:', e);
    }
  };

  const deleteProfile = async (id: string) => {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    try {
      console.log('[Profiles] Deleting profile:', id);
      await deleteDoc(doc(db, 'users', activeUid, 'profiles', id));
      if (selectedProfile?.id === id) {
        setSelectedProfile(null);
        await AsyncStorage.removeItem(SELECTED_PROFILE_KEY);
      }
    } catch (e) {
      console.error('[Profiles] Delete failed:', e);
    }
  };

  return (
    <ProfileContext.Provider value={{
      profiles,
      selectedProfile,
      selectProfile,
      addProfile,
      updateProfile,
      deleteProfile,
      isLoading,
      canAddProfile: profiles.length < maxProfilesAllowed,
      maxProfilesAllowed,
      subscriptionStatus
    }}>
      {children}
    </ProfileContext.Provider>
  );
}
