import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, StatusBar, ScrollView, Text, Image, Pressable, Dimensions, Platform, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GameService, GameDetails } from '../../services/GameService';
import { useProfile } from '../../context/ProfileContext';
import { useTheme } from '../_layout';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const getProfileColor = (profile: any) => {
  if (!profile) return '#e50914';
  if (profile.isKids) return '#0071eb';
  
  const colors: Record<string, string> = {
    avatar1: '#E50914',
    avatar2: '#0071eb',
    avatar3: '#46d369',
    avatar4: '#f5c518',
    avatar5: '#b9090b',
    avatar6: '#e91e63',
    avatar7: '#9c27b0',
    avatar8: '#ff5722',
    avatar9: '#00bcd4',
    avatar10: '#3f51b5',
  };
  return colors[profile.avatarId] || '#E50914';
};

/* ── Liquid Glass Circular Icon Button ── */
const GlassCircularButton = React.memo(({ onPress, children }: { onPress: () => void; children: React.ReactNode }) => {
  return (
    <View style={styles.glassCircleContainer}>
      <Pressable onPress={onPress} style={styles.glassCircleBody}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 75}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glassPillTintFill} />
        {/* Convex dome – horizontal edge vignette */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.20)',
            'rgba(0,0,0,0.07)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.07)',
            'rgba(0,0,0,0.20)',
          ]}
          locations={[0, 0.1, 0.25, 0.75, 0.9, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Convex dome – vertical center-bright */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.20)',
            'rgba(255,255,255,0.06)',
            'transparent',
            'transparent',
            'rgba(255,255,255,0.05)',
            'rgba(255,255,255,0.12)',
          ]}
          locations={[0, 0.15, 0.40, 0.80, 0.90, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Specular Highlight */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.30)',
            'rgba(255,255,255,0.05)',
            'rgba(255,255,255,0.40)',
            'rgba(255,255,255,0.08)',
            'transparent',
            'rgba(255,255,255,0.15)',
          ]}
          locations={[0, 0.08, 0.18, 0.32, 0.85, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Inner shadow */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.28)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.48)',
          ]}
          locations={[0, 0.12, 0.78, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.glassCircleRefraction} pointerEvents="none" />
        <View style={styles.glassCircleBorder} pointerEvents="none" />
        <View style={styles.glassCircleContent}>
          {children}
        </View>
      </Pressable>
    </View>
  );
});

export default function GameDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { selectedProfile } = useProfile();
  const { setThemeColor } = useTheme();
  const profileColor = getProfileColor(selectedProfile);
  const [gameData, setGameData] = useState<GameDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profileColor) {
      setThemeColor(profileColor);
    }
  }, [profileColor]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const details = await GameService.getGameDetails(String(id));
        if (mounted) {
          setGameData(details);
        }
      } catch (error) {
        console.warn('[GameDetailsScreen] Failed to load game details:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    if (id) {
      load();
    }
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading && !gameData) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  if (!gameData) {
    return (
      <View style={styles.loader}>
        <Text style={{ color: 'white' }}>Failed to load game details.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Hero Banner backdrop */}
        <View style={styles.heroContainer}>
          <Image source={{ uri: gameData.heroUrl || gameData.posterUrl }} style={styles.heroImage} />
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.4)', '#000000']}
            style={StyleSheet.absoluteFill}
            locations={[0, 0.55, 1]}
          />
          
          {/* Floating Back Button */}
          <View style={styles.backButtonWrap}>
            <GlassCircularButton onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}>
              <Ionicons name="arrow-back" size={20} color="white" />
            </GlassCircularButton>
          </View>
        </View>

        {/* Content details block */}
        <Animated.View entering={FadeInUp.duration(500)} style={styles.contentWrap}>
          <Text style={styles.title}>{gameData.title}</Text>
          <Text style={styles.subtitle}>{gameData.subtitle}</Text>
          
          {/* Immersive Play Action Button */}
          <Pressable 
            style={[styles.playGameBtn, { backgroundColor: profileColor }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              Alert.alert('Launch Game', `Launching ${gameData.title} on your TV / Mobile devices...`);
            }}
          >
            <MaterialCommunityIcons name="controller-classic" size={24} color="white" />
            <Text style={styles.playGameBtnText}>Play Game</Text>
          </Pressable>

          {/* Description Card */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>About the Game</Text>
            <Text style={styles.description}>{gameData.description}</Text>
          </View>

          {/* Specs / Tags */}
          <View style={styles.specsRow}>
            <View style={styles.specCard}>
              <Text style={styles.specTitle}>Category</Text>
              <Text style={styles.specValue}>{gameData.subtitle}</Text>
            </View>
            <View style={styles.specCard}>
              <Text style={styles.specTitle}>Rating</Text>
              <Text style={styles.specValue}>PEGI 18</Text>
            </View>
            <View style={styles.specCard}>
              <Text style={styles.specTitle}>Metacritic</Text>
              <Text style={styles.specValue}>97 / 100</Text>
            </View>
          </View>

          <Text style={styles.footerSignature}>made by mzazimhenga ❤️</Text>
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  heroContainer: {
    width: '100%',
    height: 320,
    position: 'relative',
    backgroundColor: '#000000',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  backButtonWrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 16,
  },
  contentWrap: {
    paddingHorizontal: 16,
    marginTop: -20,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
  },
  subtitle: {
    color: '#e50914',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  playGameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 20,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  playGameBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardHeader: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  description: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 20,
  },
  specsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 10,
  },
  specCard: {
    flex: 1,
    backgroundColor: '#121212',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  specTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  specValue: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  footerSignature: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  /* ── Liquid Glass Circular Icon Button Styles ── */
  glassCircleContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
  },
  glassCircleBody: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassCircleRefraction: {
    position: 'absolute',
    top: 1.2,
    left: 2,
    right: 2,
    height: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1.2,
    borderTopColor: 'rgba(255,255,255,0.4)',
  },
  glassCircleBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
    borderTopColor: 'rgba(255,255,255,0.50)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  glassCircleContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  glassPillTintFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 15, 15, 0.42)',
  },
});
