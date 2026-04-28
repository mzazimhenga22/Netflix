import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
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

const AVATAR_MAP: Record<string, any> = {
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
  addProfile: (name: string, avatarId: string, isLocked?: boolean, pin?: string, isKids?: boolean, maturityLevel?: string) => void;
  updateProfile: (id: string, name: string, avatarId: string, isLocked?: boolean, pin?: string, isKids?: boolean, maturityLevel?: string) => void;
  deleteProfile: (id: string) => void;
  isLoading: boolean;
  canAddProfile: boolean;
  maxProfilesAllowed: number;
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
  maxProfilesAllowed: 5,
});

import { SubscriptionService, PLAN_PROFILE_LIMITS } from '../services/SubscriptionService';

export function useProfile() {
  return useContext(ProfileContext);
}

const SELECTED_PROFILE_KEY = 'netflix_selected_profile_id';
const getProfilesCacheKey = (uid: string) => `netflix_profiles_cache_${uid}`;

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [maxProfilesAllowed, setMaxProfilesAllowed] = useState(5);

  useEffect(() => {
    // Wait for auth to be ready before subscribing to subscription status.
    // Without this, listenToSubscription fires with no uid, the 15s timeout
    // triggers, and the TV app incorrectly shows the subscription overlay.
    let subUnsub: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous subscription listener on auth state change
      if (subUnsub) { subUnsub(); subUnsub = null; }

      if (user) {
        subUnsub = SubscriptionService.listenToSubscription((sub) => {
          const limit = PLAN_PROFILE_LIMITS[sub?.planId || 'none'] || 2;
          setMaxProfilesAllowed(limit);
        });
      } else {
        setMaxProfilesAllowed(5);
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

        setProfiles(fetchedProfiles);
        AsyncStorage.setItem(
          getProfilesCacheKey(activeUid),
          JSON.stringify(
            fetchedProfiles.map(({ avatar, ...profile }) => profile)
          )
        ).catch(() => {});

        // Restore selected profile from storage if not set in memory
        if (fetchedProfiles.length > 0) {
          AsyncStorage.getItem(SELECTED_PROFILE_KEY).then(savedId => {
            if (savedId && !selectedProfile) {
              const matched = fetchedProfiles.find(p => p.id === savedId);
              if (matched) setSelectedProfile(matched);
            }
          });
        }

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
      maxProfilesAllowed
    }}>
      {children}
    </ProfileContext.Provider>
  );
}
