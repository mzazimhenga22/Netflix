import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { View, StyleSheet, StatusBar, ScrollView, Text, Image, Pressable, Dimensions, Platform, Alert } from 'react-native';
import { useTheme } from '../_layout';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { GameService, GameSection, GameCardItem } from '../../services/GameService';
import { useProfile } from '../../context/ProfileContext';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, Feather, MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';

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

/* ── Liquid Glass Pill Button ── */
const GlassPillButton = React.memo(({ isFocused, activeColor, onPress, children }: { isFocused: boolean; activeColor: string; onPress: () => void; children: React.ReactNode }) => {
  return (
    <View style={styles.glassPillContainer}>
      {isFocused && (
        <View style={[styles.activePillAuraShadow, { shadowColor: activeColor }]} pointerEvents="none" />
      )}
      <Pressable onPress={onPress} style={styles.glassPillBody}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 65 : 75}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.glassPillTintFill} />
        {/* Convex dome – horizontal edge vignette */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.18)',
            'rgba(0,0,0,0.06)',
            'transparent',
            'transparent',
            'rgba(0,0,0,0.06)',
            'rgba(0,0,0,0.18)',
          ]}
          locations={[0, 0.08, 0.22, 0.78, 0.92, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Convex dome – vertical center-bright band */}
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
        <View style={styles.glassPillRefraction} pointerEvents="none" />
        <View style={styles.glassPillBorder} pointerEvents="none" />
        {isFocused && (
          <View style={StyleSheet.absoluteFill}>
            <View style={styles.activePillGlow} />
            <LinearGradient
              colors={[
                `${activeColor}40`,
                'transparent',
                `${activeColor}20`,
              ]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
        <View style={styles.glassPillContent}>
          {children}
        </View>
      </Pressable>
    </View>
  );
});

export default function GamesScreen() {
  const { setThemeColor } = useTheme();
  const router = useRouter();
  const { selectedProfile, profiles, selectProfile } = useProfile();
  const profileColor = getProfileColor(selectedProfile);
  const [sections, setSections] = useState<GameSection[]>([]);
  const [activeFilter, setActiveFilter] = useState('All Games');
  const [featuredGame, setFeaturedGame] = useState<any>({
    id: '3498',
    title: 'Grand Theft Auto V',
    subtitle: 'Action • Rockstar Games',
    description: 'Explore the massive open world of Los Santos and pull off daring heists with three unlikely criminals.',
    heroUrl: 'https://media.rawg.io/media/games/456/456dea5e1c7e3cd07060c14e96612001.jpg',
  });

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['58%'], []);
  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsAt={-1} appearsAt={0} opacity={0.7} />
    ),
    []
  );

  useFocusEffect(
    useCallback(() => {
      const activeColor = getProfileColor(selectedProfile);
      setThemeColor(activeColor);
    }, [selectedProfile])
  );

  useEffect(() => {
    GameService.getHomeSections().then(async (data) => {
      setSections(data);
      if (data.length > 0 && data[0].items.length > 0) {
        try {
          const firstGame = data[0].items[0];
          const details = await GameService.getGameDetails(firstGame.id);
          setFeaturedGame(details);
        } catch (e) {
          console.warn('Failed to load featured game details:', e);
        }
      }
    }).catch((error) => {
      console.warn('[GamesScreen] Failed to load games:', error);
    });
  }, []);

  const filteredSections = useMemo(() => {
    if (activeFilter === 'All Games') return sections;
    return sections.map(section => {
      const items = section.items.filter(game => {
        const genre = game.subtitle?.toLowerCase() || '';
        if (activeFilter === 'Action') return genre.includes('action');
        if (activeFilter === 'RPG') return genre.includes('rpg') || genre.includes('role-playing');
        if (activeFilter === 'Indie') return genre.includes('indie');
        if (activeFilter === 'Strategy') return genre.includes('strategy') || genre.includes('puzzle');
        if (activeFilter === 'Family') return genre.includes('family') || genre.includes('kids') || genre.includes('adventure');
        return true;
      });
      return { ...section, items };
    }).filter(section => section.items.length > 0);
  }, [sections, activeFilter]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Floating Header */}
      <View style={styles.floatingHeader}>
        <SafeAreaView edges={['top']} style={styles.headerContent}>
          {/* Profile Switcher Trigger */}
          <Pressable 
            style={styles.profileHeaderBtn} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              bottomSheetRef.current?.expand();
            }}
          >
            <Image source={selectedProfile?.avatar} style={styles.headerAvatar} />
            <Text style={styles.headerProfileName} numberOfLines={1}>{selectedProfile?.name || 'User'}</Text>
            <Ionicons name="chevron-down" size={14} color="white" style={styles.headerCaret} />
          </Pressable>
          {/* Action Icons */}
          <View style={styles.headerIcons}>
            <GlassCircularButton onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Alert.alert('Casting', 'Looking for casting devices...');
            }}>
              <MaterialIcons name="cast" size={20} color="white" />
            </GlassCircularButton>
            <GlassCircularButton onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/search');
            }}>
              <Ionicons name="search" size={20} color="white" />
            </GlassCircularButton>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        scrollEventThrottle={16}
      >
        {/* Immersive Profile Ambient Gradient */}
        <LinearGradient
          colors={[`${profileColor}15`, 'transparent']}
          style={styles.profileGradient}
        />

        {/* Hero Section */}
        <View style={styles.heroContainer}>
          <Image source={{ uri: featuredGame.heroUrl || featuredGame.posterUrl }} style={styles.heroImage} />
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.4)', '#000000']}
            style={StyleSheet.absoluteFill}
            locations={[0, 0.55, 1]}
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle} numberOfLines={2}>{featuredGame.title}</Text>
            <Text style={styles.heroSubtitle}>{featuredGame.subtitle}</Text>
            <Text style={styles.heroDescription} numberOfLines={3}>{featuredGame.description}</Text>
            
            <View style={styles.heroButtons}>
              <Pressable 
                style={styles.playButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  router.push(`/games/${featuredGame.id}` as any);
                }}
              >
                <Ionicons name="play" size={20} color="black" />
                <Text style={styles.playButtonText}>Play Game</Text>
              </Pressable>
              
              <Pressable 
                style={styles.infoButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/games/${featuredGame.id}` as any);
                }}
              >
                <Ionicons name="information-circle-outline" size={22} color="white" />
                <Text style={styles.infoButtonText}>Info</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Category Pills / Filter bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsContainer}>
          {['All Games', 'Action', 'RPG', 'Indie', 'Strategy', 'Family'].map((filter) => (
            <GlassPillButton
              key={filter}
              isFocused={activeFilter === filter}
              activeColor={profileColor}
              onPress={() => {
                Haptics.selectionAsync();
                setActiveFilter(filter);
              }}
            >
              <Text style={[styles.listFilterText, activeFilter === filter && styles.listFilterTextActive]}>{filter}</Text>
            </GlassPillButton>
          ))}
        </ScrollView>

        {/* Game Sections */}
        <View style={styles.sectionsContainer}>
          {filteredSections.map((section, sectionIdx) => (
            <Animated.View 
              key={section.title} 
              entering={FadeInDown.delay(sectionIdx * 100).duration(500)} 
              style={styles.sectionCard}
            >
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowListContent}>
                {section.items.map((game) => (
                  <Pressable 
                    key={game.id} 
                    style={styles.gameCard}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      router.push(`/games/${game.id}` as any);
                    }}
                  >
                    <View style={styles.gameWrapper}>
                      <Image source={{ uri: game.posterUrl }} style={styles.gameImage} />
                      
                      {/* Badge overlays */}
                      {game.badge1 && (
                        <View style={[styles.badge, styles.badgeRed]}>
                          <Text style={styles.badgeText}>{game.badge1}</Text>
                        </View>
                      )}
                      {game.badge2 && !game.badge1 && (
                        <View style={[styles.badge, styles.badgeGray]}>
                          <Text style={styles.badgeText}>{game.badge2}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.gameTitle} numberOfLines={1}>{game.title}</Text>
                    <Text style={styles.gameSubtitle} numberOfLines={1}>{game.subtitle}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>
          ))}
        </View>

        <Text style={styles.footerSignature}>made by mzazimhenga ❤️</Text>
        {/* Extra spacing for Bottom Tabs */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Sheet for Profile Switcher */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.bottomSheetBackground}
        handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)' }}
      >
        <BottomSheetView style={styles.bottomSheetContent}>
          <Text style={styles.sheetHeaderTitle}>Switch Profile</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileSwitcherRow}>
            {profiles.map((p) => {
              const isActive = p.id === selectedProfile?.id;
              return (
                <Pressable
                  key={p.id}
                  style={styles.profileItem}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    selectProfile(p);
                    bottomSheetRef.current?.close();
                  }}
                >
                  <Image 
                    source={p.avatar} 
                    style={[styles.profileAvatar, isActive && { borderColor: 'white', borderWidth: 2 }]} 
                  />
                  <Text style={[styles.profileItemName, isActive && { color: 'white', fontWeight: 'bold' }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={styles.profileItem}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                bottomSheetRef.current?.close();
                router.replace('/profiles');
              }}
            >
              <View style={[styles.profileAvatar, styles.addProfileBtn]}>
                <Ionicons name="add" size={32} color="rgba(255,255,255,0.6)" />
              </View>
              <Text style={styles.profileItemName}>Manage</Text>
            </Pressable>
          </ScrollView>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
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
    backgroundColor: 'transparent',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  profileHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: width * 0.5,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  headerProfileName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    marginLeft: 8,
    marginRight: 4,
    letterSpacing: -0.5,
  },
  headerCaret: {
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  profileGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 250,
  },
  heroContainer: {
    width: '100%',
    height: 380,
    position: 'relative',
    backgroundColor: '#000000',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroContent: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroSubtitle: {
    color: '#e50914',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroDescription: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  heroButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  playButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    gap: 8,
  },
  infoButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  filterPillsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
    height: 66,
  },
  listFilterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  listFilterTextActive: {
    color: '#000000',
  },
  sectionsContainer: {
    gap: 16,
  },
  sectionCard: {
    backgroundColor: '#121212',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  rowListContent: {
    gap: 12,
  },
  gameCard: {
    width: 170,
  },
  gameWrapper: {
    width: 170,
    height: 100,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#1a1a1a',
    position: 'relative',
  },
  gameImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeRed: {
    backgroundColor: '#e50914',
  },
  badgeGray: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  gameTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  gameSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  footerSignature: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  bottomSheetBackground: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  bottomSheetContent: {
    padding: 16,
    flex: 1,
  },
  sheetHeaderTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  profileSwitcherRow: {
    paddingHorizontal: 8,
    paddingBottom: 16,
    gap: 16,
  },
  profileItem: {
    alignItems: 'center',
    width: 68,
  },
  profileAvatar: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#333333',
  },
  addProfileBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.3)',
  },
  profileItemName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
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

  /* ── Liquid Glass Pill Button Styles ── */
  glassPillContainer: {
    height: 34,
    borderRadius: 17,
    position: 'relative',
  },
  glassPillBody: {
    flex: 1,
    borderRadius: 17,
    overflow: 'hidden',
  },
  glassPillTintFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 15, 15, 0.42)',
  },
  glassPillRefraction: {
    position: 'absolute',
    top: 1.2,
    left: 2,
    right: 2,
    height: 8,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderTopWidth: 1.2,
    borderTopColor: 'rgba(255,255,255,0.4)',
  },
  glassPillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    borderTopColor: 'rgba(255,255,255,0.40)',
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  activePillGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
  },
  activePillAuraShadow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 17,
    backgroundColor: 'rgba(229, 9, 20, 0.01)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.8,
    shadowRadius: 14,
    elevation: 8,
  },
  glassPillContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
  },
});
