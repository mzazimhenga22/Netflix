import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
  SafeAreaView
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, Feather } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProfile, AVATAR_MAP } from '../../../context/ProfileContext';
import { FriendsService, Friend } from '../../../services/friends';
import { MessagingService, Message } from '../../../services/messaging';
import { LiquidGlassPill } from '../../../components/LiquidGlass';
import { COLORS, SPACING } from '../../../constants/theme';

// ── MEMOIZED MESSAGE ROW ──
// As per project memory, we memoize ChatRow to avoid rendering overhead on fast inputs
const ChatRow = React.memo(({ item, currentUid, friendAvatar, onReply }: { item: Message; currentUid: string; friendAvatar: string; onReply: (message: Message) => void }) => {
  const isMe = item.senderId === currentUid;
  const router = useRouter();

  const formattedTime = useMemo(() => {
    try {
      const date = new Date(item.timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }, [item.timestamp]);

  // Check if message is a Movie share
  const isMovieShare = item.text.startsWith('[MOVIE_SHARE]:');
  const movieShareData = useMemo(() => {
    if (!isMovieShare) return null;
    try {
      const parts = item.text.split(':');
      const tmdbId = parts[1];
      const title = parts[2];
      const mediaType = parts[parts.length - 1];
      const posterPath = parts.slice(3, parts.length - 1).join(':');
      return { tmdbId, title, posterPath, mediaType };
    } catch (_) {
      return null;
    }
  }, [item.text, isMovieShare]);

  // Check if message is a Watch Party share
  const isPartyShare = item.text.startsWith('[PARTY_SHARE]:');
  const partyShareData = useMemo(() => {
    if (!isPartyShare) return null;
    try {
      const parts = item.text.split(':');
      return {
        partyId: parts[1],
        movieTitle: parts[2],
        mediaType: parts[3],
        tmdbId: parts[4]
      };
    } catch (_) {
      return null;
    }
  }, [item.text, isPartyShare]);

  const renderBubbleContent = () => {
    if (movieShareData) {
      return (
        <View style={styles.shareCard}>
          <View style={styles.shareBadge}>
            <Text style={styles.shareBadgeText}>🍿 Recommend</Text>
          </View>
          {movieShareData.posterPath ? (
            <ExpoImage source={{ uri: movieShareData.posterPath }} style={styles.sharePoster} contentFit="cover" />
          ) : null}
          <Text style={styles.shareTitle} numberOfLines={1}>{movieShareData.title}</Text>
          <Pressable
            style={styles.shareActionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({
                pathname: '/movie/[id]',
                params: { id: movieShareData.tmdbId, type: movieShareData.mediaType }
              });
            }}
          >
            <Ionicons name="film" size={12} color="black" />
            <Text style={styles.shareActionBtnText}>View Details</Text>
          </Pressable>
        </View>
      );
    }

    if (partyShareData) {
      return (
        <View style={styles.partyInviteCard}>
          <View style={styles.partyInviteHeader}>
            <Ionicons name="people" size={16} color="#E50914" />
            <View style={styles.partyInviteBadge}>
              <Text style={styles.partyInviteBadgeText}>Live Lobby</Text>
            </View>
          </View>
          <Text style={styles.partyInviteTitle} numberOfLines={1}>{partyShareData.movieTitle}</Text>
          <Text style={styles.partyInviteSub}>Join my Watch Party waiting room!</Text>
          <Pressable
            style={styles.partyInviteActionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              router.push({
                pathname: '/movie/[id]',
                params: {
                  id: partyShareData.tmdbId,
                  type: partyShareData.mediaType,
                  watchPartyId: partyShareData.partyId
                }
              });
            }}
          >
            <Ionicons name="play" size={12} color="white" />
            <Text style={styles.partyInviteActionBtnText}>Join Party</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <>
        <Text style={isMe ? styles.messageTextMe : styles.messageTextFriend}>{item.text}</Text>
        <Text style={isMe ? styles.messageTimeMe : styles.messageTimeFriend}>{formattedTime}</Text>
      </>
    );
  };

  const renderReplyQuote = () => {
    if (!item.replyToText) return null;
    const isReplyToMe = item.replyToSenderId === currentUid;
    return (
      <View style={[
        styles.replyQuoteBubble,
        isMe ? styles.replyQuoteBubbleMe : styles.replyQuoteBubbleFriend
      ]}>
        <Text style={[styles.replyQuoteSenderText, isMe ? styles.replyQuoteSenderMe : styles.replyQuoteSenderFriend]} numberOfLines={1}>
          {isReplyToMe ? 'You' : (item.replyToSenderName || 'Friend')}
        </Text>
        <Text style={styles.replyQuoteText} numberOfLines={1}>
          {item.replyToText}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.chatRow, isMe ? styles.chatRowRight : styles.chatRowLeft]}>
      {!isMe && (
        <ExpoImage
          source={AVATAR_MAP[friendAvatar] || AVATAR_MAP.avatar1}
          style={styles.chatRowAvatar}
        />
      )}

      {isMe && (
        <Pressable 
          onPress={() => onReply(item)} 
          style={styles.replyActionBtnRight}
        >
          <Ionicons name="arrow-undo-outline" size={16} color="rgba(255,255,255,0.35)" />
        </Pressable>
      )}

      <View style={styles.bubbleContainer}>
        <Pressable onLongPress={() => onReply(item)}>
          {isMe ? (
            (movieShareData || partyShareData) ? (
              renderBubbleContent()
            ) : (
              <LinearGradient
                colors={['#8B5CF6', '#EC4899']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.meBubble}
              >
                {renderReplyQuote()}
                {renderBubbleContent()}
              </LinearGradient>
            )
          ) : (
            (movieShareData || partyShareData) ? (
              renderBubbleContent()
            ) : (
              <LiquidGlassPill borderRadius={16} style={styles.friendBubble}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.03)', 'transparent']}
                  style={StyleSheet.absoluteFill}
                />
                {renderReplyQuote()}
                {renderBubbleContent()}
              </LiquidGlassPill>
            )
          )}
        </Pressable>
      </View>

      {!isMe && (
        <Pressable 
          onPress={() => onReply(item)} 
          style={styles.replyActionBtnLeft}
        >
          <Ionicons name="arrow-undo-outline" size={16} color="rgba(255,255,255,0.35)" />
        </Pressable>
      )}
    </View>
  );
});

export default function ChatScreen() {
  const { id: chatId, name: friendName, friendId } = useLocalSearchParams<{ id: string; name: string; friendId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedProfile } = useProfile();
  
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [friend, setFriend] = useState<Friend | null>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  
  const flatListRef = useRef<FlatList>(null);
  const currentUid = selectedProfile?.id || 'guest';

  // Subscribing to messages list in Firestore
  useEffect(() => {
    if (!chatId) return;
    const unsubscribe = MessagingService.subscribeToMessages(chatId, (data) => {
      // Invert list for the inverted FlatList (so index 0 is the newest message)
      setMessages([...data].reverse());
    });
    return () => unsubscribe();
  }, [chatId]);

  // Subscribing to Friend presence updates
  useEffect(() => {
    if (!friendId) return;
    const unsubscribe = FriendsService.subscribeToFriends((friendsList) => {
      const matched = friendsList.find(f => f.uid === friendId);
      if (matched) {
        setFriend(matched);
      }
    });
    return () => unsubscribe();
  }, [friendId]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const textToSend = inputText;
    setInputText('');
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const replyData = replyingToMessage ? {
      replyToId: replyingToMessage.id,
      replyToText: replyingToMessage.text,
      replyToSenderId: replyingToMessage.senderId,
      replyToSenderName: replyingToMessage.senderName,
    } : undefined;

    setReplyingToMessage(null);

    // Call service to write message to Firestore/mock
    await MessagingService.sendMessage(chatId, textToSend, selectedProfile, replyData);
  };

  const getFriendStatusText = () => {
    if (!friend) return 'Loading...';
    if (friend.status === 'watching') {
      return `📺 Watching ${friend.watchingTitle || 'something epic'}`;
    }
    return friend.status === 'online' ? '🟢 Online' : 'Offline';
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#130924', '#000']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.blurBlob} pointerEvents="none" />

      {/* Header Container */}
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

          {/* User info details */}
          <View style={styles.headerInfo}>
            <ExpoImage
              source={AVATAR_MAP[friend?.avatarId || 'avatar1'] || AVATAR_MAP.avatar1}
              style={styles.headerAvatar}
            />
            <View style={styles.headerTextWrapper}>
              <Text style={styles.headerName} numberOfLines={1}>
                {friendName || friend?.name || 'Friend'}
              </Text>
              <Text style={styles.headerStatus} numberOfLines={1}>
                {getFriendStatusText()}
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.headerActionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (friend?.watchingTmdbId) {
                router.push({
                  pathname: '/movie/[id]',
                  params: { id: friend.watchingTmdbId, type: 'tv' }
                });
              }
            }}
          >
            <Ionicons name="videocam" size={20} color={friend?.status === 'watching' ? '#10B981' : 'rgba(255,255,255,0.4)'} />
          </Pressable>
        </View>
      </View>

      {/* Messages Stream - Keyboard avoiding view container */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          inverted // loads messages from the bottom (standard for chat lists)
          contentContainerStyle={[styles.messagesList, { paddingBottom: 16 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ChatRow
              item={item}
              currentUid={currentUid}
              friendAvatar={friend?.avatarId || 'avatar1'}
              onReply={(msg) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setReplyingToMessage(msg);
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubbles" size={32} color="rgba(255,255,255,0.08)" />
              <Text style={styles.emptyText}>No messages here yet</Text>
              <Text style={styles.emptySub}>Send a message to say hello!</Text>
            </View>
          }
        />

        {/* Input area footer */}
        <View style={[styles.inputWrapper, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {replyingToMessage && (
            <Animated.View entering={FadeInUp.duration(200)} style={styles.replyPreviewBar}>
              <View style={styles.replyPreviewLine} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.replyPreviewSender} numberOfLines={1}>
                  Replying to {replyingToMessage.senderId === currentUid ? 'You' : (replyingToMessage.senderName || 'Friend')}
                </Text>
                <Text style={styles.replyPreviewText} numberOfLines={1}>
                  {replyingToMessage.text}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setReplyingToMessage(null);
                }}
                style={styles.closeReplyBtn}
              >
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.4)" />
              </Pressable>
            </Animated.View>
          )}

          <LiquidGlassPill borderRadius={24} style={styles.glassInputContainer}>
            <View style={styles.innerInputRow}>
              <TextInput
                placeholder="Type a message..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={inputText}
                onChangeText={setInputText}
                style={styles.inputField}
                multiline
                maxHeight={80}
              />
              <Pressable
                onPress={handleSend}
                disabled={!inputText.trim()}
                style={[
                  styles.sendButton,
                  !inputText.trim() && styles.sendButtonDisabled
                ]}
              >
                <LinearGradient
                  colors={['#8B5CF6', '#EC4899']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.sendButtonGradient}
                >
                  <Ionicons name="send" size={14} color="white" />
                </LinearGradient>
              </Pressable>
            </View>
          </LiquidGlassPill>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  blurBlob: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
    opacity: 0.7,
  },
  headerContainer: {
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(19, 9, 36, 0.5)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  headerTextWrapper: {
    marginLeft: 10,
    flex: 1,
  },
  headerName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  headerStatus: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  headerActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    paddingHorizontal: SPACING.md,
    paddingTop: 16,
    gap: 12,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: '100%',
  },
  chatRowRight: {
    justifyContent: 'flex-end',
  },
  chatRowLeft: {
    justifyContent: 'flex-start',
  },
  chatRowAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 2,
  },
  bubbleContainer: {
    maxWidth: '75%',
  },
  meBubble: {
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  friendBubble: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  messageTextMe: {
    color: 'white',
    fontSize: 14,
    lineHeight: 19,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  messageTextFriend: {
    color: 'white',
    fontSize: 14,
    lineHeight: 19,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  messageTimeMe: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    alignSelf: 'flex-end',
    marginTop: 4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-light' }),
  },
  messageTimeFriend: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    alignSelf: 'flex-end',
    marginTop: 4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-light' }),
  },
  inputWrapper: {
    paddingHorizontal: SPACING.md,
    paddingTop: 8,
    backgroundColor: '#000',
  },
  glassInputContainer: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  innerInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  inputField: {
    flex: 1,
    color: 'white',
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scaleY: -1 }], // match flatlist inversion
    paddingTop: 100,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 12,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  emptySub: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    marginTop: 4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-light' }),
  },
  shareCard: {
    width: 200,
    backgroundColor: 'rgba(25, 20, 35, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    overflow: 'hidden',
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  sharePoster: {
    width: '100%',
    height: 110,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#1a1a1a',
  },
  shareBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.4)',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  shareBadgeText: {
    color: '#A78BFA',
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  shareTitle: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  shareActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    paddingVertical: 6,
    gap: 4,
  },
  shareActionBtnText: {
    color: 'black',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  partyInviteCard: {
    width: 200,
    backgroundColor: 'rgba(229, 9, 20, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.25)',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  partyInviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  partyInviteBadge: {
    backgroundColor: '#E50914',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  partyInviteBadgeText: {
    color: 'white',
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  partyInviteTitle: {
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 4,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  partyInviteSub: {
    color: '#A3A3A3',
    fontSize: 10,
    marginBottom: 10,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  },
  partyInviteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E50914',
    borderRadius: 8,
    paddingVertical: 6,
    gap: 4,
  },
  partyInviteActionBtnText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  replyActionBtnRight: {
    marginRight: 8,
    alignSelf: 'center',
    padding: 6,
  },
  replyActionBtnLeft: {
    marginLeft: 8,
    alignSelf: 'center',
    padding: 6,
  },
  replyPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25, 20, 35, 0.75)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  replyPreviewLine: {
    width: 3,
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 1.5,
  },
  replyPreviewSender: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: '700',
  },
  replyPreviewText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  closeReplyBtn: {
    padding: 4,
  },
  replyQuoteBubble: {
    borderLeftWidth: 3,
    paddingLeft: 8,
    paddingVertical: 4,
    marginBottom: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.18)',
    width: '100%',
  },
  replyQuoteBubbleMe: {
    borderLeftColor: '#EC4899',
  },
  replyQuoteBubbleFriend: {
    borderLeftColor: '#8B5CF6',
  },
  replyQuoteSenderText: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2,
  },
  replyQuoteSenderMe: {
    color: '#F43F5E',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  replyQuoteSenderFriend: {
    color: '#A78BFA',
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium' }),
  },
  replyQuoteText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif' }),
  }
});
