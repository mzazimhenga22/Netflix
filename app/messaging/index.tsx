import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Platform,
  useWindowDimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { 
  FadeInDown, 
  FadeIn, 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing, 
  interpolate,
  interpolateColor
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useProfile, AVATAR_MAP } from '../../context/ProfileContext';
import { FriendsService, Friend } from '../../services/friends';
import { MessagingService, ChatRoom } from '../../services/messaging';
import { fetchMovieDetails, getBackdropUrl } from '../../services/tmdb';
import { LiquidGlassPill } from '../../components/LiquidGlass';
import { COLORS, SPACING } from '../../constants/theme';

export default function MessagingInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { selectedProfile } = useProfile();

  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [chats, setChats] = useState<ChatRoom[]>([]);

  // continuous timer for lava lamp aura
  const auraTime = useSharedValue(0);
  useEffect(() => {
    auraTime.value = withRepeat(
      withTiming(1, { duration: 15000, easing: Easing.linear }),
      -1,
      true
    );
  }, [auraTime]);

  // Shared values for drifting blobs
  const blob1X = useSharedValue(0);
  const blob1Y = useSharedValue(0);
  const blob2X = useSharedValue(0);
  const blob2Y = useSharedValue(0);
  const blob3X = useSharedValue(0);
  const blob3Y = useSharedValue(0);

  useEffect(() => {
    blob1X.value = withRepeat(withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.ease) }), -1, true);
    blob1Y.value = withRepeat(withTiming(1, { duration: 22000, easing: Easing.inOut(Easing.ease) }), -1, true);
    blob2X.value = withRepeat(withTiming(1, { duration: 25000, easing: Easing.inOut(Easing.ease) }), -1, true);
    blob2Y.value = withRepeat(withTiming(1, { duration: 19000, easing: Easing.inOut(Easing.ease) }), -1, true);
    blob3X.value = withRepeat(withTiming(1, { duration: 21000, easing: Easing.inOut(Easing.ease) }), -1, true);
    blob3Y.value = withRepeat(withTiming(1, { duration: 26000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);

  const blob1Style = useAnimatedStyle(() => {
    const tx = interpolate(blob1X.value, [0, 1], [-width * 0.2, width * 0.3]);
    const ty = interpolate(blob1Y.value, [0, 1], [-50, 200]);
    const scale = interpolate(blob1X.value, [0, 1], [0.9, 1.25]);
    const color = interpolateColor(auraTime.value, [0, 1], ['#4a0e17', '#2e050a']); // Deep burgundy to dark crimson
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      backgroundColor: color,
    };
  });

  const blob2Style = useAnimatedStyle(() => {
    const tx = interpolate(blob2X.value, [0, 1], [-width * 0.35, width * 0.2]);
    const ty = interpolate(blob2Y.value, [0, 1], [150, 450]);
    const scale = interpolate(blob2Y.value, [0, 1], [0.95, 1.2]);
    const color = interpolateColor(auraTime.value, [0, 1], ['#1b052b', '#12032e']); // Deep purple to indigo
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      backgroundColor: color,
    };
  });

  const blob3Style = useAnimatedStyle(() => {
    const tx = interpolate(blob3X.value, [0, 1], [-width * 0.1, width * 0.25]);
    const ty = interpolate(blob3Y.value, [0, 1], [300, 600]);
    const scale = interpolate(blob3X.value, [0, 1], [0.85, 1.15]);
    const color = interpolateColor(auraTime.value, [0, 1], ['#0e4a3b', '#032e23']); // Deep teal to forest green
    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      backgroundColor: color,
    };
  });

  // Featured Friend logic (prioritizes co-watchers)
  const featuredFriend = useMemo(() => {
    if (friends.length === 0) return null;
    const watchingFriend = friends.find(f => f.status === 'watching' && f.watchingTmdbId);
    if (watchingFriend) return watchingFriend;
    const onlineFriend = friends.find(f => f.status === 'online');
    if (onlineFriend) return onlineFriend;
    return friends[0];
  }, [friends]);

  const [featuredBackdrop, setFeaturedBackdrop] = useState<string | null>(null);

  useEffect(() => {
    if (!featuredFriend || featuredFriend.status !== 'watching' || !featuredFriend.watchingTmdbId) {
      setFeaturedBackdrop(null);
      return;
    }

    let isMounted = true;
    const loadBackdrop = async () => {
      try {
        const details = await fetchMovieDetails(featuredFriend.watchingTmdbId!, 'tv');
        if (isMounted && details?.backdrop_path) {
          setFeaturedBackdrop(getBackdropUrl(details.backdrop_path));
        }
      } catch (err) {
        try {
          const details = await fetchMovieDetails(featuredFriend.watchingTmdbId!, 'movie');
          if (isMounted && details?.backdrop_path) {
            setFeaturedBackdrop(getBackdropUrl(details.backdrop_path));
          }
        } catch (_) {}
      }
    };
    loadBackdrop();
    return () => {
      isMounted = false;
    };
  }, [featuredFriend]);

  // Fetch friends list and active chats from Firestore
  useEffect(() => {
    // Friends list for presence row
    const unsubscribeFriends = FriendsService.subscribeToFriends((data) => {
      setFriends(data);
    });

    // Active chats for history list
    const unsubscribeChats = MessagingService.subscribeToChats((data) => {
      setChats(data);
    });

    return () => {
      unsubscribeFriends();
      unsubscribeChats();
    };
  }, []);

  // Filter conversations list by search query (checks friend's name)
  const filteredChats = useMemo(() => {
    return chats.filter(chat => {
      const otherParticipant = Object.entries(chat.participants).find(
        ([uid]) => uid !== (selectedProfile?.id || 'guest')
      );
      if (!otherParticipant) return false;
      const otherUser = otherParticipant[1];
      return otherUser.name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [chats, searchQuery, selectedProfile]);

  // Format relative timestamp
  const getRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleOpenChat = async (friend: Friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const chatId = await MessagingService.getOrCreateChatRoom(friend, selectedProfile);
    router.push({
      pathname: '/messaging/chat/[id]',
      params: { id: chatId, name: friend.name, friendId: friend.uid }
    });
  };

  const handleOpenExistingChat = (chat: ChatRoom) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentUid = selectedProfile?.id || 'guest';
    const otherParticipant = Object.entries(chat.participants).find(
      ([uid]) => uid !== currentUid
    );
    if (!otherParticipant) return;
    const [friendId, friendDetails] = otherParticipant;

    router.push({
      pathname: '/messaging/chat/[id]',
      params: { id: chat.id, name: friendDetails.name, friendId }
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#000', '#100a1c', '#000']}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating Animated Gradient Blurs */}
      <Animated.View style={[styles.blurBlob1, blob1Style]} pointerEvents="none" />
      <Animated.View style={[styles.blurBlob2, blob2Style]} pointerEvents="none" />
      <Animated.View style={[styles.blurBlob3, blob3Style]} pointerEvents="none" />

      {/* Header */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 16) }]}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 70 : 85}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.headerRow}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
          >
            <Ionicons name="chevron-back" size={24} color="white" />
          </Pressable>
          <Text style={styles.headerTitle}>MESSAGES</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Glass Search Bar */}
        <View style={styles.searchBarContainer}>
          <Feather name="search" size={18} color="rgba(255,255,255,0.4)" style={styles.searchIcon} />
          <TextInput
            placeholder="Search friends..."
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <FlatList
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 16) + 134, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Chat Hero Banner (Movie poster style) */}
            {featuredFriend && (
              <Animated.View entering={FadeIn.duration(600)} style={styles.heroContainer}>
                <View style={styles.heroPoster}>
                  {featuredBackdrop ? (
                    <ExpoImage
                      source={{ uri: featuredBackdrop }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : (
                    <LinearGradient
                      colors={['#1f1635', '#0f0a1c']}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  
                  {/* Subtle color highlight blur over poster */}
                  <View style={styles.heroPosterBlurOverlay} />

                  {/* Dark Vignette Gradients */}
                  <LinearGradient
                    colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.95)']}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* Hero Content */}
                  <View style={styles.heroContent}>
                    {/* Badge */}
                    <View style={styles.heroBadgeContainer}>
                      <View style={[
                        styles.heroStatusDot,
                        { backgroundColor: featuredFriend.status === 'watching' ? '#10B981' : '#F59E0B' }
                      ]} />
                      <Text style={styles.heroBadgeText}>
                        {featuredFriend.status === 'watching' ? 'NOW WATCHING' : 'CO-WATCHER ONLINE'}
                      </Text>
                    </View>

                    {/* Friend Name */}
                    <Text style={styles.heroTitle} numberOfLines={1}>
                      {featuredFriend.name.toUpperCase()}
                    </Text>

                    {/* Status Subtitle */}
                    <Text style={styles.heroSubtitle} numberOfLines={2}>
                      {featuredFriend.status === 'watching' 
                        ? `Watching: ${featuredFriend.watchingTitle}` 
                        : 'Active now • Ready to share and watch together'}
                    </Text>

                    {/* Actions */}
                    <View style={styles.heroActions}>
                      <Pressable 
                        style={styles.heroPlayButton}
                        onPress={() => handleOpenChat(featuredFriend)}
                      >
                        <LinearGradient
                          colors={['#ffffff', '#e2e2e2']}
                          style={StyleSheet.absoluteFill}
                        />
                        <Ionicons name="chatbubble-ellipses" size={18} color="black" style={{ zIndex: 1 }} />
                        <Text style={styles.heroPlayButtonText}>Chat Now</Text>
                      </Pressable>
                      
                      {featuredFriend.status === 'watching' && featuredFriend.watchingTmdbId && (
                        <Pressable 
                          style={styles.heroInfoButton}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            router.push({
                              pathname: "/movie/[id]",
                              params: { id: featuredFriend.watchingTmdbId, type: 'tv' }
                            });
                          }}
                        >
                          <BlurView
                            intensity={60}
                            tint="dark"
                            style={StyleSheet.absoluteFill}
                          />
                          <LinearGradient
                            colors={['rgba(255,255,255,0.18)', 'transparent', 'rgba(255,255,255,0.06)']}
                            style={StyleSheet.absoluteFill}
                          />
                          <Ionicons name="tv-outline" size={18} color="white" style={{ zIndex: 1 }} />
                          <Text style={styles.heroInfoButtonText}>Join Watch</Text>
                        </Pressable>
                      )}
                    </View>
                    {/* Bottom spacer to prevent active cast from overlapping the action buttons */}
                    <View style={{ height: 36 }} />
                  </View>
                </View>
              </Animated.View>
            )}

            {/* Friends Quick Presence List (Active Cast) */}
            {friends.length > 0 && (
              <View style={styles.presenceSection}>
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.85)', '#000']}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={styles.sectionTitleRow}>
                  <View style={styles.titleAccentBar} />
                  <Text style={styles.sectionTitle}>Active Cast</Text>
                </View>
                <FlatList
                  data={friends}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item) => item.uid}
                  contentContainerStyle={styles.presenceListContent}
                  renderItem={({ item }) => {
                    const isOnline = item.status === 'online' || item.status === 'watching';
                    return (
                      <Pressable
                        style={styles.presenceBubble}
                        onPress={() => handleOpenChat(item)}
                      >
                        <View style={styles.avatarWrapper}>
                          <View style={[
                            styles.avatarRing,
                            { 
                              borderColor: item.status === 'watching' ? '#10B981' : (item.status === 'online' ? '#F59E0B' : 'rgba(255,255,255,0.1)'),
                              shadowColor: item.status === 'watching' ? '#10B981' : '#F59E0B',
                            }
                          ]}>
                            <ExpoImage
                              source={AVATAR_MAP[item.avatarId] || AVATAR_MAP.avatar1}
                              style={styles.avatarImage}
                            />
                          </View>
                        </View>
                        <Text style={styles.presenceName} numberOfLines={1}>
                          {item.name.split(' ')[0]}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              </View>
            )}

            <View style={[styles.sectionTitleRow, { marginTop: 16 }]}>
              <View style={styles.titleAccentBar} />
              <Text style={styles.sectionTitle}>Recent Releases</Text>
            </View>
          </>
        }
        data={filteredChats}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Animated.View entering={FadeIn.delay(300)} style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIconContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="rgba(255,255,255,0.15)" />
            </View>
            <Text style={styles.emptyStateTitle}>No conversations yet</Text>
            <Text style={styles.emptyStateSub}>
              Tap on any of your online friends above to start a chat.
            </Text>
          </Animated.View>
        }
        renderItem={({ item, index }) => {
          const currentUid = selectedProfile?.id || 'guest';
          const otherParticipant = Object.entries(item.participants).find(
            ([uid]) => uid !== currentUid
          );
          if (!otherParticipant) return null;
          const [friendId, friendDetails] = otherParticipant;
          const matchedFriend = friends.find(f => f.uid === friendId);
          const isOnline = matchedFriend ? (matchedFriend.status === 'online' || matchedFriend.status === 'watching') : false;
          const isNew = item.lastMessage && item.lastMessage.senderId !== currentUid;

          // Determine card gradient colors based on status/activity to blend beautifully with the background
          const getCardGradientColors = () => {
            if (isNew) return ['rgba(229, 9, 20, 0.16)', 'rgba(15, 15, 15, 0.75)']; // Crimson/red glow for new messages
            if (matchedFriend?.status === 'watching') return ['rgba(16, 185, 129, 0.14)', 'rgba(15, 15, 15, 0.75)']; // Emerald green for co-watching
            if (isOnline) return ['rgba(245, 158, 11, 0.10)', 'rgba(15, 15, 15, 0.75)']; // Amber glow for online
            return ['rgba(139, 92, 246, 0.08)', 'rgba(15, 15, 15, 0.75)']; // Violet default glow
          };

          return (
            <Animated.View entering={FadeInDown.delay(index * 80).duration(350)}>
              <Pressable
                onPress={() => handleOpenExistingChat(item)}
                style={styles.chatRowContainer}
              >
                <LiquidGlassPill borderRadius={16} style={styles.glassCard}>
                  {/* Dynamic gradient overlay that blends with the ambient background blobs */}
                  <LinearGradient
                    colors={getCardGradientColors()}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {/* Convex specular highlight sheens on card top edge */}
                  <LinearGradient
                    colors={['rgba(255,255,255,0.14)', 'transparent']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 0.2 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  {/* Inner dark vignette border */}
                  <View style={{
                    ...StyleSheet.absoluteFillObject,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                    borderRadius: 16,
                  }} pointerEvents="none" />
                  <View style={styles.cardContent}>
                    {/* Avatar with dynamic status indicator */}
                    <View style={styles.cardAvatarWrapper}>
                      <View style={[
                        styles.cardAvatarRing,
                        {
                          borderColor: matchedFriend?.status === 'watching' ? '#10B981' : (isOnline ? '#F59E0B' : 'rgba(255,255,255,0.1)'),
                        }
                      ]}>
                        <ExpoImage
                          source={AVATAR_MAP[friendDetails.avatarId] || AVATAR_MAP.avatar1}
                          style={styles.cardAvatar}
                        />
                      </View>
                      {isOnline && (
                        <View
                          style={[
                            styles.presenceDot,
                            {
                              width: 14,
                              height: 14,
                              bottom: -2,
                              right: -2,
                              borderWidth: 2.5,
                              borderColor: '#0f0a1c',
                              backgroundColor: matchedFriend?.status === 'watching' ? '#10B981' : '#F59E0B'
                            }
                          ]}
                        />
                      )}
                    </View>

                    {/* Chat Text Details */}
                    <View style={styles.chatDetails}>
                      <View style={styles.chatTitleRow}>
                        <View style={styles.friendNameContainer}>
                          <Text style={styles.friendName} numberOfLines={1}>
                            {friendDetails.name}
                          </Text>
                          {isNew && (
                            <View style={styles.newBadge}>
                              <Text style={styles.newBadgeText}>NEW</Text>
                            </View>
                          )}
                        </View>
                        {item.lastMessage && (
                          <Text style={styles.chatTime}>
                            {getRelativeTime(item.lastMessage.timestamp)}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.lastMessageText} numberOfLines={2}>
                        {item.lastMessage
                          ? (item.lastMessage.senderId === currentUid ? 'You: ' : '') + item.lastMessage.text
                          : 'Start a conversation'}
                      </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.25)" />
                  </View>
                </LiquidGlassPill>
              </Pressable>
            </Animated.View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  blurBlob1: {
    position: 'absolute',
    top: 50,
    right: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    opacity: 0.8,
  },
  blurBlob2: {
    position: 'absolute',
    bottom: 200,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(229, 9, 20, 0.08)',
    opacity: 0.6,
  },
  blurBlob3: {
    position: 'absolute',
    top: 350,
    right: -100,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    opacity: 0.5,
  },
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    marginHorizontal: SPACING.md,
    gap: 8,
  },
  titleAccentBar: {
    width: 3.5,
    height: 14,
    borderRadius: 2,
    backgroundColor: '#E50914', // Premium Netflix Red vertical accent
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 22,
    height: 42,
    paddingHorizontal: 16,
    marginTop: 10,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: 'white',
    fontSize: 14,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  scrollContent: {
    paddingTop: 16,
  },
  presenceSection: {
    marginTop: -54, // Pull up to overlay the bottom of the hero poster card
    paddingTop: 16,
    paddingBottom: 4,
    marginBottom: 20,
    zIndex: 20,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  presenceListContent: {
    paddingHorizontal: SPACING.md,
    gap: 16,
  },
  presenceBubble: {
    alignItems: 'center',
    width: 64,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarRing: {
    padding: 2,
    borderRadius: 28,
    borderWidth: 2.5,
    backgroundColor: '#000',
  },
  avatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  presenceDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: '#000',
  },
  presenceName: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
    width: '100%',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  chatRowContainer: {
    marginHorizontal: SPACING.md,
    marginBottom: 12,
  },
  glassCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    minHeight: 92,
  },
  cardAvatarWrapper: {
    position: 'relative',
    marginRight: 16,
  },
  cardAvatarRing: {
    padding: 2,
    borderRadius: 34,
    borderWidth: 2,
    backgroundColor: '#000',
  },
  cardAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  chatDetails: {
    flex: 1,
    marginRight: 8,
  },
  chatTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  friendNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  friendName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  newBadge: {
    backgroundColor: '#E50914',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newBadgeText: {
    color: 'white',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  chatTime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  lastMessageText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-light' }),
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    marginTop: 60,
  },
  emptyStateIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyStateTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  emptyStateSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-light' }),
  },
  /* ── Chat Hero Banner Styles ── */
  heroContainer: {
    marginHorizontal: SPACING.md,
    marginBottom: 0,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#110d1a',
  },
  heroPoster: {
    width: '100%',
    height: 330, // Increased height for premium prominence
    position: 'relative',
    justifyContent: 'flex-end',
  },
  heroPosterBlurOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24, 15, 43, 0.12)',
  },
  heroContent: {
    padding: 20, // Increased padding
    zIndex: 10,
  },
  heroBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8, // Increased margin
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  heroBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.0, // Wider letter spacing
  },
  heroTitle: {
    color: '#fff',
    fontSize: 32, // Taller font size
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: -0.5,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13, // Slightly larger font size
    fontWeight: '600',
    marginBottom: 16,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
    textShadowColor: 'black',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroPlayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },
  heroPlayButtonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  heroInfoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroInfoButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
});
