import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  collection, 
  getDocs, 
  addDoc, 
  setDoc, 
  doc, 
  deleteDoc, 
  onSnapshot,
  query 
} from 'firebase/firestore';
import { SubscriptionService, PLAN_PROFILE_LIMITS } from '../services/SubscriptionService';

export interface ProfileSettings {
  wifiOnlyDownloads: boolean;
  autoplayNext: boolean;
  autoplayPreviews: boolean;
  videoQuality?: 'standard' | 'higher';
}

export interface Profile {
  id: string;
  name: string;
  avatar: any;
  avatarId: string;
  isLocked?: boolean;
  pin?: string;
  isKids?: boolean;
  settings?: ProfileSettings;
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
  selectProfile: (profile: Profile) => void;
  addProfile: (name: string, avatarId: string, isLocked?: boolean, pin?: string, isKids?: boolean) => void;
  updateProfile: (id: string, name: string, avatarId: string, isLocked?: boolean, pin?: string, isKids?: boolean) => void;
  updateProfileSettings: (id: string, settings: Partial<ProfileSettings>) => void;
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
  updateProfileSettings: () => {},
  deleteProfile: () => {},
  isLoading: true,
  canAddProfile: true,
  maxProfilesAllowed: 5,
});

export function useProfile() {
  return useContext(ProfileContext);
}

const SELECTED_PROFILE_KEY = 'netflix_selected_profile_id';

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [maxProfilesAllowed, setMaxProfilesAllowed] = useState(2);

  useEffect(() => {
    const unsub = SubscriptionService.listenToSubscription((sub) => {
      const limit = PLAN_PROFILE_LIMITS[sub?.planId || 'none'] || 2;
      setMaxProfilesAllowed(limit);
    });
    return () => unsub();
  }, []);

  // 1. Listen for Auth Changes and Fetch Profiles
  useEffect(() => {
    let unsubProfiles: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      const activeUid = user ? user.uid : 'dev-guest';
      
      setIsLoading(true);
      
      // Clean up previous listener
      if (unsubProfiles) unsubProfiles();

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
            settings: data.settings || {
              wifiOnlyDownloads: false,
              autoplayNext: true,
              autoplayPreviews: true,
              videoQuality: 'standard'
            }
          });
        });

        setProfiles(fetchedProfiles);

        // If no profiles exist, initialize with defaults
        if (fetchedProfiles.length === 0 && isLoading) {
           DEFAULT_PROFILES.forEach(p => {
              setDoc(doc(db, 'users', activeUid, 'profiles', p.id), {
                 name: p.name,
                 avatarId: p.avatarId,
                  isLocked: p.isLocked,
                  pin: p.pin || null,
                  isKids: p.isKids === true,
                  settings: {
                    wifiOnlyDownloads: false,
                    autoplayNext: true,
                    autoplayPreviews: true,
                    videoQuality: 'standard'
                  }
               });
            });
        }

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
  };

  const addProfile = async (name: string, avatarId: string, isLocked = false, pin = '', isKids = false) => {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    try {
      console.log('[Profiles] Adding profile for:', activeUid);
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

  const updateProfile = async (id: string, name: string, avatarId: string, isLocked = false, pin = '', isKids = false) => {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    try {
       console.log('[Profiles] Updating profile:', id);
       await setDoc(doc(db, 'users', activeUid, 'profiles', id), {
        name,
        avatarId,
        isLocked,
        pin,
        isKids
      }, { merge: true });
    } catch (e) {
      console.error('[Profiles] Update failed:', e);
    }
  };

  const updateProfileSettings = async (id: string, settings: Partial<ProfileSettings>) => {
    const activeUid = auth.currentUser?.uid || 'dev-guest';
    try {
      console.log('[Profiles] Updating profile settings:', id);
      await setDoc(doc(db, 'users', activeUid, 'profiles', id), {
        settings
      }, { merge: true });
    } catch (e) {
      console.error('[Profiles] Settings update failed:', e);
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

  const canAddProfile = profiles.length < maxProfilesAllowed;

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
      canAddProfile,
      maxProfilesAllowed
    }}>
      {children}
    </ProfileContext.Provider>
  );
}
