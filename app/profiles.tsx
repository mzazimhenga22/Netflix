import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image, Dimensions, ActivityIndicator, StatusBar } from 'react-native';
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
} from 'react-native-reanimated';
import { MaterialCommunityIcons, MaterialIcons, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchTrending, getBackdropUrl } from '../services/tmdb';
import { useProfile } from './_layout';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');
const PROFILE_SIZE = Math.min(width * 0.22, 100); 

const ACTIVE_PROFILES = [
  { id: '1', name: 'Saurabh', avatar: require('../assets/avatars/avatar1.png') },
  { id: '2', name: 'Stranger', avatar: require('../assets/avatars/avatar2.png') },
  { id: '3', name: 'Kids', avatar: require('../assets/avatars/avatar5.png') },
  { id: '4', name: 'Money', avatar: require('../assets/avatars/avatar3.png') },
];

export default function ProfilesScreen() {
  const router = useRouter();
  const { setSelectedAvatar } = useProfile();
  const [featured, setFeatured] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);

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

  const handleProfileSelect = (profile: any) => {
    setSelectingId(profile.id);
    setSelectedAvatar(profile.avatar);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    // Navigate almost immediately to let the shared transition handle the visual jump
    setTimeout(() => {
      router.replace('/(tabs)/home');
    }, 50);
  };

  if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator color={COLORS.primary} /></View>;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" />
      
      {/* Immersive Cinematic Billboard */}
      <Animated.View entering={FadeIn.duration(1200)} style={styles.billboardContainer}>
        {featured && (
          <>
            <Image source={{ uri: getBackdropUrl(featured.backdrop_path) }} style={styles.billboardImage} />
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

      {/* Modern Profile Selection Overlay */}
      <View style={styles.overlaySection}>
        <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.headerBox}>
          <Text style={styles.whoText}>Who's Watching?</Text>
          <Pressable style={styles.editBtn} onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}>
            <MaterialIcons name="edit" size={20} color="white" />
          </Pressable>
        </Animated.View>

        <View style={styles.profilesRow}>
          {ACTIVE_PROFILES.map((profile, index) => (
            <ProfileCard 
              key={profile.id} 
              profile={profile} 
              index={index} 
              isSelecting={selectingId === profile.id}
              disabled={selectingId !== null}
              onSelect={() => handleProfileSelect(profile)} 
            />
          ))}
          
          <Animated.View entering={ZoomIn.delay(800)} style={styles.profileWrapper}>
            <Pressable style={styles.addProfileCard}>
              <View style={styles.addBox}>
                <Ionicons name="add" size={32} color="rgba(255,255,255,0.4)" />
              </View>
              <Text style={styles.profileName}>Add</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

function ProfileCard({ profile, index, onSelect, isSelecting, disabled }: any) {
  const scale = useSharedValue(1);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(scale.value) }],
    opacity: disabled && !isSelecting ? withTiming(0, { duration: 300 }) : 1,
  }));

  return (
    <Animated.View 
      entering={ZoomIn.delay(index * 100 + 400).duration(500)}
      style={[styles.profileWrapper, animatedStyle]}
    >
      <Pressable 
        style={styles.profileCard} 
        onPress={onSelect}
        disabled={disabled}
        onPressIn={() => { if (!disabled) scale.value = 1.15; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        onPressOut={() => { if (!disabled && !isSelecting) scale.value = 1; }}
      >
        <Animated.Image 
          source={profile.avatar} 
          style={styles.avatar} 
          sharedTransitionTag={isSelecting ? "avatar" : undefined}
        />
        <Text style={styles.profileName} numberOfLines={1}>{profile.name}</Text>
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
  profileCard: { alignItems: 'center', gap: 10 },
  avatar: { width: PROFILE_SIZE, height: PROFILE_SIZE, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  profileName: { color: 'white', fontSize: 14, fontWeight: '600', opacity: 0.8 },
  addProfileCard: { alignItems: 'center', gap: 10 },
  addBox: { width: PROFILE_SIZE, height: PROFILE_SIZE, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed' },
});
