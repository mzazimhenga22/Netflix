import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, Dimensions, StatusBar } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';
import { HorizontalCarousel } from '../../components/HorizontalCarousel';
import { fetchPopular, getImageUrl, getBackdropUrl } from '../../services/tmdb';
import { Ionicons, MaterialCommunityIcons, Feather, MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useProfile } from '../_layout';
import Animated, { 
  FadeIn,
  FadeInDown,
  useSharedValue, 
  useAnimatedStyle, 
  withSpring,
  withTiming,
  interpolate
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const SMART_ACTIONS = [
  { id: '1', title: 'Notifications', icon: 'notifications', color: '#e50914', badge: '3' },
  { id: '2', title: 'Downloads', icon: 'download', color: '#0071eb' },
  { id: '3', title: 'My List', icon: 'add-circle', color: '#46d369' },
  { id: '4', title: 'Account', icon: 'settings', color: '#333' },
];

export default function MyNetflixScreen() {
  const router = useRouter();
  const { selectedAvatar } = useProfile();
  const [myList, setMyList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const scrollY = useSharedValue(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        const popular = await fetchPopular('movie');
        const formatData = (items: any[]) => items.map(item => ({
          id: item.id.toString(),
          title: item.title || item.name,
          imageUrl: getImageUrl(item.poster_path),
          backdropUrl: getBackdropUrl(item.backdrop_path),
          synopsis: item.overview,
        }));
        
        setMyList(formatData(popular.slice(0, 10)));
      } catch (error) {
        console.error("Error loading My Netflix data:", error);
      } finally {
        setTimeout(() => setLoading(false), 600);
      }
    };
    loadData();
  }, []);

  const headerOpacityStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(scrollY.value, [0, 50], [0, 1]),
      backgroundColor: 'rgba(0,0,0,0.85)',
    };
  });

  if (loading) return <View style={{ flex: 1, backgroundColor: 'black' }} />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Floating Header */}
      <Animated.View style={[styles.floatingHeader, headerOpacityStyle]}>
        <SafeAreaView edges={['top']} style={styles.headerContent}>
          <Text style={styles.floatingHeaderTitle}>My Netflix</Text>
          <View style={styles.headerIcons}>
            <Pressable style={styles.iconButton}><MaterialCommunityIcons name="cast" size={24} color="white" /></Pressable>
            <Pressable style={styles.iconButton} onPress={() => router.push('/search')}><Ionicons name="search" size={24} color="white" /></Pressable>
            <Pressable style={styles.iconButton}><Ionicons name="menu" size={24} color="white" /></Pressable>
          </View>
        </SafeAreaView>
      </Animated.View>

      <Animated.ScrollView 
        showsVerticalScrollIndicator={false} 
        onScroll={(e) => { scrollY.value = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Immersive Profile Identity */}
        <LinearGradient
          colors={['rgba(229, 9, 20, 0.2)', 'transparent']}
          style={styles.profileGradient}
        />
        
        <SafeAreaView edges={['top']}>
          <View style={styles.profileSection}>
            <Animated.View entering={FadeIn.duration(600)} style={styles.avatarContainer}>
              <Pressable onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}>
                <Image source={selectedAvatar} style={styles.mainAvatar} />
                <View style={styles.avatarEditBadge}>
                  <MaterialIcons name="edit" size={16} color="white" />
                </View>
              </Pressable>
            </Animated.View>
            <Text style={styles.profileName}>Saurabh</Text>
            <Pressable style={styles.switchPill} onPress={() => router.replace('/profiles')}>
              <Text style={styles.switchPillText}>Switch Profile</Text>
              <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.6)" />
            </Pressable>
          </View>
        </SafeAreaView>

        {/* AI-Powered Smart Actions (Bento Grid) */}
        <View style={styles.bentoSection}>
          <View style={styles.bentoRow}>
            {SMART_ACTIONS.map((action, idx) => (
              <Animated.View 
                key={action.id}
                entering={FadeInDown.delay(idx * 100).duration(500)}
                style={[styles.bentoCard, { width: (width - 44) / 2 }]}
              >
                <Pressable 
                  style={styles.bentoPressable}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (action.id === '1') router.push('/notifications');
                    if (action.id === '2') router.push('/downloads');
                  }}
                >
                  <View style={[styles.bentoIconBox, { backgroundColor: action.color }]}>
                    <MaterialIcons name={action.icon as any} size={24} color="white" />
                  </View>
                  <Text style={styles.bentoLabel}>{action.title}</Text>
                  {action.badge && (
                    <View style={styles.bentoBadge}>
                      <Text style={styles.bentoBadgeText}>{action.badge}</Text>
                    </View>
                  )}
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </View>

        {/* Personalized Feed Rows */}
        <View style={styles.contentRows}>
          <View style={styles.rowWrapper}>
            <HorizontalCarousel 
              title="Recently Watched" 
              data={myList.slice(0, 5)} 
              variant="landscape"
            />
          </View>
          
          <View style={styles.rowWrapper}>
            <HorizontalCarousel 
              title="My List" 
              data={myList} 
            />
          </View>

          <View style={styles.rowWrapper}>
            <HorizontalCarousel 
              title="Trailers You Liked" 
              data={myList.slice(5, 10)} 
              variant="landscape"
            />
          </View>
        </View>

        {/* Quick Utilities */}
        <View style={styles.utilitySection}>
          <Pressable style={styles.utilityItem}>
            <Ionicons name="help-circle-outline" size={24} color="white" />
            <Text style={styles.utilityText}>Help Center</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.3)" />
          </Pressable>
          <Pressable style={styles.utilityItem} onPress={() => router.replace('/index')}>
            <Ionicons name="log-out-outline" size={24} color="#e50914" />
            <Text style={[styles.utilityText, { color: '#e50914' }]}>Sign Out</Text>
          </Pressable>
        </View>

        <Text style={styles.footerInfo}>Version 1.0.0 (2026.03.24)</Text>
        <View style={{ height: 120 }} />
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingBottom: 10,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  floatingHeaderTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  iconButton: {
    padding: 4,
  },
  profileGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  profileSection: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  mainAvatar: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: '#1a1a1a',
    padding: 6,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  profileName: {
    color: 'white',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  switchPillText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: 'bold',
  },
  bentoSection: {
    paddingHorizontal: 16,
    marginBottom: 30,
  },
  bentoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bentoCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    height: 110,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  bentoPressable: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bentoIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  bentoLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
  },
  bentoBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#e50914',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  bentoBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '900',
  },
  contentRows: {
    marginTop: 10,
  },
  rowWrapper: {
    marginBottom: 10,
  },
  utilitySection: {
    marginTop: 20,
    paddingHorizontal: 16,
    gap: 12,
  },
  utilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 16,
    borderRadius: 12,
    gap: 16,
  },
  utilityText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  footerInfo: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 40,
    fontWeight: 'bold',
  }
});
