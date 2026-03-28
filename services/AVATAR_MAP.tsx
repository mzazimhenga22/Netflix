import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getDocs, addDoc, setDoc, doc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';
import { DeviceTrackerService } from '../services/DeviceTrackerService';
import { SubscriptionService, PLAN_PROFILE_LIMITS, SubscriptionStatus } from '../services/SubscriptionService';

export interface Profile {
  id: string;
  name: string;
  avatar: any;
  avatarId: string;
  isLocked?: boolean;
  pin?: string;
  isKids?: boolean;
  settings?: {
    autoplayNext: boolean;
    autoplayPreviews: boolean;
    wifiOnlyDownloads: boolean;
  };
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

const DEFAULT_PROFILES: Profile[] = [
  { id: '1', name: 'Brian', avatar: AVATAR_MAP.avatar1, avatarId: 'avatar1', isLocked: false },
  { id: '2', name: 'Addams', avatar: AVATAR_MAP.avatar2, avatarId: 'avatar2', isLocked: false },
  { id: '3', name: 'Saurabh', avatar: AVATAR_MAP.avatar3, avatarId: 'avatar3', isLocked: false },
  { id: '4', name: 'Money', avatar: AVATAR_MAP.avatar4, avatarId: 'avatar4', isLocked: true, pin: '1234' },
  { id: '5', name: 'Kids', avatar: AVATAR_MAP.avatar5, avatarId: 'avatar5', isLocked: false, isKids: true },
];

interface ProfileContextType {
  profiles: Profile[];
  selectedProfile: Profile | null;
  selectProfile: (profile: Profile) => Promise<void>;
  addProfile: (name: string, avatarId: string, isLocked: boolean, pin: string, isKids: boolean) => Promise<void>;
  updateProfile: (id: string, name: string, avatarId: string, isLocked: boolean, pin: string, isKids: boolean) => Promise<void>;
  updateProfileSettings: (id: string, settings: any) => void;
  deleteProfile: (id: string) => void;
  isLoading: boolean;
  maxProfilesAllowed: number;
  canAddProfile: boolean;
}

const ProfileContext = createContext<ProfileContextType>({
  profiles: [],
  selectedProfile: null,
  selectProfile: async () => {},
  addProfile: async () => {},
  updateProfile: async () => {},
  updateProfileSettings: () => {},
  deleteProfile: () => {},
  isLoading: true,
  maxProfilesAllowed: 2,
  canAddProfile: false,
});

export function useProfile() {
  return useContext(ProfileContext);
}

const SELECTED_PROFILE_KEY = 'netflix_selected_profile_id';

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus>({ status: 'none' });

  useEffect(() => {
    let unsubProfiles: (() => void) | null = null;
    let unsubSubscription: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      const activeUid = user ? user.uid : 'dev-guest';
      setIsLoading(true);
      
      if (user) {
        DeviceTrackerService.registerDevice();
      }
      
      if (unsubProfiles) unsubProfiles();
      if (unsubSubscription) unsubSubscription();

      unsubSubscription = SubscriptionService.listenToSubscription((sub) => {
        setSubscription(sub);
      });

      const profilesCol = collection(db, 'users', activeUid, 'profiles');
      
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
            pin: data.pin || '',
            isKids: data.isKids || false,
            settings: data.settings || { autoplayNext: true, autoplayPreviews: true, wifiOnlyDownloads: false }
          });
        });

        setProfiles(fetchedProfiles);

        if (fetchedProfiles.length === 0 && isLoading) {
            DEFAULT_PROFILES.forEach(p => {
               setDoc(doc(db, 'users', activeUid, 'profiles', p.id), {
                  name: p.name,
                  avatarId: p.avatarId,
                  isLocked: p.isLocked,
                  pin: p.pin || '',
                  isKids: p.isKids || false,
                  settings: p.settings || { autoplayNext: true, autoplayPreviews: true, wifiOnlyDownloads: false }
               });
            });
        }

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
        console.error('[Profiles] Snapshot error:', error);
        setIsLoading(false);
      });
    });

    return () => {
      unsubAuth();
      if (unsubProfiles) unsubProfiles();
      if (unsubSubscription) unsubSubscription();
    };
  }, []);

  const selectProfile = async (profile: Profile) => {
    setSelectedProfile(profile);
    await AsyncStorage.setItem(SELECTED_PROFILE_KEY, profile.id);
  };

  const addProfile = async (name: string, avatarId: string, isLocked: boolean = false, pin: string = '', isKids: boolean = false) => {
    if (!canAddProfile) return;
    
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    try {
      await addDoc(collection(db, 'users', activeUid, 'profiles'), {
        name,
        avatarId,
        isLocked,
        pin,
        isKids,
        createdAt: Date.now()
      });
    } catch (e) {
      console.error('[Profiles] Create failed:', e);
    }
  };

  const updateProfile = async (id: string, name: string, avatarId: string, isLocked: boolean = false, pin: string = '', isKids: boolean = false) => {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    try {
       await setDoc(doc(db, 'users', activeUid, 'profiles', id), {
        name,
        avatarId,
        isLocked,
        pin,
        isKids,
      }, { merge: true });
    } catch (e) {
      console.error('[Profiles] Update failed:', e);
    }
  };

  const updateProfileSettings = async (id: string, settings: any) => {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    try {
       await setDoc(doc(db, 'users', activeUid, 'profiles', id), {
        settings
      }, { merge: true });
    } catch (e) {
      console.error('[Profiles] Update settings failed:', e);
    }
  };

  const deleteProfile = async (id: string) => {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    try {
      await deleteDoc(doc(db, 'users', activeUid, 'profiles', id));
    } catch (e) {
      console.error('[Profiles] Delete failed:', e);
    }
  };

  const maxProfilesAllowed = subscription.status === 'active' && subscription.planId 
    ? PLAN_PROFILE_LIMITS[subscription.planId.split('_')[1]] || 2 // e.g. "PLN_standard_test" -> "standard"
    : PLAN_PROFILE_LIMITS['none'];
    
  // Absolute max is 5 (Netflix UI limit), but constrained by plan
  const actualLimit = Math.min(maxProfilesAllowed, 5);
  const canAddProfile = profiles.length < actualLimit;

  return (
    <ProfileContext.Provider value={{
      profiles,
      selectedProfile,
      selectProfile,
      addProfile,
      updateProfile,
      updateProfileSettings,
      deleteProfile,
      isLoading,
      maxProfilesAllowed: actualLimit,
      canAddProfile,
    }}>
      {children}
    </ProfileContext.Provider>
  );
}
