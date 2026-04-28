import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, ActivityIndicator, StatusBar, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { 
  FadeIn, 
  FadeInDown, 
  FadeInUp, 
  ZoomIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  runOnJS,
  Easing
} from 'react-native-reanimated';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchTrending, getBackdropUrl, getImageUrl } from '../services/tmdb';
import { useProfile } from '../context/ProfileContext';
import { useTransition } from './_layout';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');
const PROFILE_SIZE = Math.min(width * 0.22, 100); 

export default function ProfilesScreen() {
  const router = useRouter();
  const { profiles, selectProfile, canAddProfile, maxProfilesAllowed } = useProfile();
  const { startProfileTransition, isTransitioning } = useTransition();
  const [featured, setFeatured] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isManaging, setIsManaging] = useState(false);
  
  // PIN Modal State
  const [showPinModal, setShowPinModal] = useState(false);
  const [lockedProfile, setLockedProfile] = useState<{profile: any, layout: any} | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const contentOpacity = useSharedValue(1);

  useEffect(() => {
    if (isTransitioning) {
      contentOpacity.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) });
    } else {
      contentOpacity.value = 1;
    }
  }, [isTransitioning]);

  useEffect(() => {
    async function loadFeatured() {
      try {
        const trending = await fetchTrending('all');
        if (trending && trending.length > 0) {
          setFeatured(trending[Math.floor(Math.random() * 5)]);
        }
      } catch (e) {
        console.warn("Failed to load billboard", e);
      } finally {
        setLoading(false);
      }
    }
    loadFeatured();
  }, []);

  const handleProfilePress = (profile: any, layout: any) => {
    if (isManaging) {
      router.push({
        pathname: '/edit-profile',
        params: { id: profile.id, name: profile.name, avatarId: profile.avatarId }
      });
      return;
    }

    if (profile.isLocked && profile.pin) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setLockedProfile({ profile, layout });
      setPinInput('');
      setPinError(false);
      setShowPinModal(true);
      return;
    }

    handleProfileSelect(profile, layout);
  };

  const handleProfileSelect = (profile: any, layout: any) => {

    // Guard against invalid layout data from measure
    if (!layout || typeof layout.x !== 'number' || typeof layout.y !== 'number') {
      console.warn("Invalid profile layout measured", layout);
      // Fallback: Just navigate if measurement fails
      selectProfile(profile);
      router.replace('/(tabs)/home');
      return;
    }

    selectProfile(profile);
    startProfileTransition(profile, layout);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Give the floating avatar animation time to fly across the screen
    // while the profile screen smoothly fades to black before navigation.
    setTimeout(() => {
      router.replace('/(tabs)/home');
    }, 800);
  };

  const handlePinPress = (digit: string) => {
    if (pinInput.length >= 4) return;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPinError(false);
    const newVal = pinInput + digit;
    setPinInput(newVal);

    if (newVal.length === 4) {
      if (newVal === lockedProfile?.profile.pin) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowPinModal(false);
        // Add a slight delay after modal closure for a smoother transition
        setTimeout(() => {
          handleProfileSelect(lockedProfile.profile, lockedProfile.layout);
        }, 150);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setPinError(true);
        setTimeout(() => setPinInput(''), 400); // clear after brief pause
      }
    }
  };

  const handleDeletePin = () => {
    if (pinInput.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPinInput(pinInput.slice(0, -1));
      setPinError(false);
    }
  };

  const animatedContentStyle = useAnimatedStyle(() => ({ 
    opacity: contentOpacity.value 
  }));

  if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator color={COLORS.primary} /></View>;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />
      
      {/* Background Fades Out on Selection */}
      <Animated.View style={[{ flex: 1 }, animatedContentStyle]}>
        <Animated.View entering={FadeIn.duration(1200)} style={styles.billboardContainer}>
          {featured && (
            <>
              <Image source={{ uri: getImageUrl(featured.poster_path) || getBackdropUrl(featured.backdrop_path) }} style={styles.billboardImage} />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.8)', '#000']}
                style={styles.gradient}
              />
              
              <View style={styles.billboardContent}>
                <Animated.View entering={FadeInUp.delay(500).duration(800)} style={styles.badge}>
                  <Text style={styles.badgeText}>TRENDING NOW</Text>
                </Animated.View>
                <Animated.Text entering={FadeInUp.delay(600).duration(800)} style={styles.featuredTitle}>
                  {featured.title || featured.name}
                </Animated.Text>
              </View>
            </>
          )}
        </Animated.View>

        <View style={styles.overlaySection}>
          <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.headerBox}>
            <Text style={styles.whoText}>{isManaging ? 'Manage Profiles' : "Who's Watching?"}</Text>
            <Pressable 
              style={[styles.editBtn, isManaging && { backgroundColor: 'white' }]} 
              onPress={() => {
                setIsManaging(!isManaging);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              {isManaging ? (
                <Text style={{ color: 'black', fontWeight: 'bold' }}>Done</Text>
              ) : (
                <MaterialIcons name="edit" size={20} color="white" />
              )}
            </Pressable>
          </Animated.View>

          <View style={styles.profilesRow}>
            {profiles.map((profile: any, index: number) => (
              <ProfileCard 
                key={profile.id} 
                profile={profile} 
                index={index} 
                disabled={false}
                isManaging={isManaging}
                onSelect={handleProfilePress} 
              />
            ))}
            
            {/* Add Profile / Upgrade Plan Button */}
            {profiles.length < 5 && (
              <Animated.View entering={ZoomIn.delay(800)} style={styles.profileWrapper}>
                <Pressable 
                  style={styles.addProfileCard}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    if (canAddProfile) {
                      router.push('/edit-profile');
                    } else {
                      Alert.alert(
                        'Profile Limit Reached', 
                        `Your current plan allows up to ${maxProfilesAllowed} profiles.\n\nUpgrade your plan to add more.`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Upgrade Plan', onPress: () => router.push('/subscription') }
                        ]
                      );
                    }
                  }}
                >
                  <View style={styles.addBox}>
                    {canAddProfile ? (
                      <Ionicons name="add" size={40} color="white" />
                    ) : (
                      <Ionicons name="lock-closed" size={32} color="rgba(255,255,255,0.5)" />
                    )}
                  </View>
                  <Text style={styles.profileName}>{canAddProfile ? 'Add Profile' : 'Upgrade Plan'}</Text>
                </Pressable>
              </Animated.View>
            )}
          </View>
        </View>
      </Animated.View>

      {/* Global GhostAvatar is now handled in _layout.tsx */}

      {/* Full-Screen Dark PIN Modal */}
      {showPinModal && lockedProfile && (
        <Animated.View entering={FadeIn.duration(300)} style={styles.pinModalOverlay}>
          <Pressable style={styles.pinModalCloseBtn} onPress={() => setShowPinModal(false)}>
            <Ionicons name="close" size={32} color="white" />
          </Pressable>
          
          <View style={styles.pinModalContent}>
            <Text style={styles.pinTitle}>Enter your PIN to access this profile.</Text>
            
            <View style={styles.pinDotsContainer}>
              {[0, 1, 2, 3].map((i) => (
                <View 
                  key={i} 
                  style={[
                    styles.pinDot, 
                    pinInput.length > i && styles.pinDotFilled,
                    pinError && styles.pinDotError,
                    pinError && pinInput.length > i && { backgroundColor: '#e50914' } // Dynamic red fill
                  ]} 
                />
              ))}
            </View>

            {pinError && <Text style={styles.pinErrorText}>Incorrect PIN.</Text>}

            <View style={styles.keypad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <Pressable key={digit} style={styles.keypadBtn} onPress={() => handlePinPress(digit)}>
                  <Text style={styles.keypadBtnText}>{digit}</Text>
                </Pressable>
              ))}
              <View style={styles.keypadBtnEmpty} />
              <Pressable style={styles.keypadBtn} onPress={() => handlePinPress('0')}>
                <Text style={styles.keypadBtnText}>0</Text>
              </Pressable>
              <Pressable style={styles.keypadBtn} onPress={handleDeletePin}>
                <Ionicons name="backspace-outline" size={28} color="white" />
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function ProfileCard({ profile, index, onSelect, disabled, isManaging }: any) {
  const scale = useSharedValue(1);
  const viewRef = useRef<View>(null);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value) }],
    opacity: isManaging ? 0.8 : 1
  }));

  const handlePress = () => {
    if (disabled) return;
    
    // Use requestAnimationFrame to ensure we don't block the UI thread
    requestAnimationFrame(() => {
      viewRef.current?.measure((x, y, w, h, pageX, pageY) => {
        // Android layout measurement can sometimes return null/undefined
        onSelect(profile, { 
          x: pageX || 0, 
          y: pageY || 0, 
          width: w || PROFILE_SIZE, 
          height: h || PROFILE_SIZE 
        });
      });
    });
  };

  return (
    <Animated.View 
      entering={ZoomIn.delay(index * 100 + 400).duration(500)}
      style={[styles.profileWrapper, animatedStyle]}
    >
      <Pressable 
        style={styles.profileCard} 
        onPress={handlePress}
        disabled={disabled}
        onPressIn={() => { if (!disabled) scale.value = 1.1; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        onPressOut={() => { if (!disabled) scale.value = 1; }}
      >
        <View ref={viewRef} collapsable={false}>
          <Image source={profile.avatar} style={[styles.avatar, isManaging && { opacity: 0.5 }]} />
          {isManaging && (
            <View style={styles.pencilOverlay}>
              <MaterialIcons name="edit" size={24} color="white" />
            </View>
          )}
        </View>
        <Text style={styles.profileName} numberOfLines={1}>{profile.name}</Text>
        {profile.isKids ? (
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: -4 }}>Kids</Text>
        ) : profile.isLocked && !isManaging && (
          <Ionicons name="lock-closed" size={14} color="rgba(255,255,255,0.5)" style={styles.lockIcon} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { justifyContent: 'center', alignItems: 'center' },
  billboardContainer: { ...StyleSheet.absoluteFillObject, height: height * 0.8 },
  billboardImage: { width: '100%', height: '100%', opacity: 0.7 },
  gradient: { ...StyleSheet.absoluteFillObject },
  billboardContent: { position: 'absolute', bottom: height * 0.25, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 40 },
  badge: { backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 2, marginBottom: 16 },
  badgeText: { color: 'white', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  featuredTitle: { color: 'white', fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: -1, textShadowColor: 'black', textShadowRadius: 10 },
  overlaySection: { position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.4, justifyContent: 'center', paddingBottom: 40 },
  headerBox: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 30, gap: 15 },
  whoText: { color: 'white', fontSize: 24, fontWeight: 'bold', letterSpacing: -0.5 },
  editBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  profilesRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20, paddingHorizontal: 20 },
  profileWrapper: { width: PROFILE_SIZE },
  profileCard: { alignItems: 'center', gap: 8 },
  avatar: { width: PROFILE_SIZE, height: PROFILE_SIZE, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  profileName: { color: 'white', fontSize: 14, fontWeight: '500', opacity: 0.9 },
  lockIcon: { marginTop: -4 },
  addProfileCard: { alignItems: 'center', gap: 8 },
  addBox: { width: PROFILE_SIZE, height: PROFILE_SIZE, borderRadius: 10, backgroundColor: '#141414', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  pencilOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  pinModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.95)',
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinModalCloseBtn: {
    position: 'absolute',
    top: 60,
    right: 30,
    padding: 10,
  },
  pinModalContent: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 300,
  },
  pinTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 40,
    textAlign: 'center',
  },
  pinDotsContainer: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 40,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  pinDotFilled: {
    backgroundColor: 'white',
    borderColor: 'white',
  },
  pinDotError: {
    borderColor: '#e50914',
  },
  pinErrorText: {
    color: '#e50914',
    fontSize: 14,
    marginBottom: 20,
    marginTop: -20,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: 260,
    gap: 15,
  },
  keypadBtn: {
    width: 70,
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 35,
  },
  keypadBtnEmpty: {
    width: 70,
    height: 70,
  },
  keypadBtnText: {
    color: 'white',
    fontSize: 28,
    fontWeight: '400',
  }
});
