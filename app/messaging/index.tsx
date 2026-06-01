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
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile, AVATAR_MAP } from '../../context/ProfileContext';
import { FriendsService, Friend } from '../../services/friends';
import { MessagingService, ChatRoom } from '../../services/messaging';
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
        colors={['#180f2b', '#000']}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating Gradient Blurs */}
      <View style={styles.blurBlob1} pointerEvents="none" />
      <View style={styles.blurBlob2} pointerEvents="none" />

      {/* Header */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top, 16) }]}>
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
          <Text style={styles.headerTitle}>Messages</Text>
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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Friends Quick Presence List */}
            {friends.length > 0 && (
              <View style={styles.presenceSection}>
                <Text style={styles.sectionTitle}>Friends Online</Text>
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
                          <ExpoImage
                            source={AVATAR_MAP[item.avatarId] || AVATAR_MAP.avatar1}
                            style={styles.avatarImage}
                          />
                          {isOnline && (
                            <View
                              style={[
                                styles.presenceDot,
                                { backgroundColor: item.status === 'watching' ? '#10B981' : '#F59E0B' }
                              ]}
                            />
                          )}
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

            <Text style={[styles.sectionTitle, { marginHorizontal: SPACING.md, marginTop: 8 }]}>
              Conversations
            </Text>
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

          return (
            <Animated.View entering={FadeInDown.delay(index * 80).duration(350)}>
              <Pressable
                onPress={() => handleOpenExistingChat(item)}
                style={styles.chatRowContainer}
              >
                <LiquidGlassPill borderRadius={16} style={styles.glassCard}>
                  <View style={styles.cardContent}>
                    {/* Avatar with dynamic status indicator */}
                    <View style={styles.cardAvatarWrapper}>
                      <ExpoImage
                        source={AVATAR_MAP[friendDetails.avatarId] || AVATAR_MAP.avatar1}
                        style={styles.cardAvatar}
                      />
                      {isOnline && (
                        <View
                          style={[
                            styles.presenceDot,
                            {
                              width: 12,
                              height: 12,
                              bottom: 0,
                              right: 0,
                              borderWidth: 2,
                              borderColor: '#1f1635',
                              backgroundColor: matchedFriend?.status === 'watching' ? '#10B981' : '#F59E0B'
                            }
                          ]}
                        />
                      )}
                    </View>

                    {/* Chat Text Details */}
                    <View style={styles.chatDetails}>
                      <View style={styles.chatTitleRow}>
                        <Text style={styles.friendName} numberOfLines={1}>
                          {friendDetails.name}
                        </Text>
                        {item.lastMessage && (
                          <Text style={styles.chatTime}>
                            {getRelativeTime(item.lastMessage.timestamp)}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.lastMessageText} numberOfLines={1}>
                        {item.lastMessage
                          ? (item.lastMessage.senderId === currentUid ? 'You: ' : '') + item.lastMessage.text
                          : 'Start a conversation'}
                      </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
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
    backgroundColor: 'rgba(139, 92, 246, 0.18)',
    opacity: 0.8,
  },
  blurBlob2: {
    position: 'absolute',
    bottom: 200,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(236, 72, 153, 0.08)',
    opacity: 0.5,
  },
  headerContainer: {
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(24, 15, 43, 0.4)',
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
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.2,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    height: 42,
    paddingHorizontal: 12,
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
    marginBottom: 20,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginHorizontal: SPACING.md,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  presenceListContent: {
    paddingHorizontal: SPACING.md,
    gap: 16,
  },
  presenceBubble: {
    alignItems: 'center',
    width: 60,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
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
    color: '#E5E5E5',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
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
    padding: 14,
  },
  cardAvatarWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  cardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  friendName: {
    color: 'white',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  chatTime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  lastMessageText: {
    color: 'rgba(255,255,255,0.6)',
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
  }
});
