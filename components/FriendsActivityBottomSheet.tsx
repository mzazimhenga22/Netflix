import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  TextInput, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { 
  BottomSheetModal, 
  BottomSheetView,
  BottomSheetTextInput,
  BottomSheetFlatList
} from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSequence, 
  withDelay, 
  runOnJS,
  FadeInUp,
  FadeOutDown
} from 'react-native-reanimated';
import { COLORS } from '../constants/theme';
import { useProfile } from '../context/ProfileContext';
import { FriendsService, FriendActivity, FRIEND_AVATARS } from '../services/friends';

interface FriendsActivityBottomSheetProps {
  sheetRef: React.RefObject<BottomSheetModal>;
  tmdbId: string;
  movieTitle: string;
}

const STICKERS = ['🔥', '😮', '🍿', '😢', '👏', '😱', '❤️', '👀', '💯', '😂'];

export const FriendsActivityBottomSheet = React.memo(({ 
  sheetRef, 
  tmdbId, 
  movieTitle 
}: FriendsActivityBottomSheetProps) => {
  const { selectedProfile } = useProfile();
  const [activities, setActivities] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const lastActivityCountRef = useRef(0);

  // Firestore real-time listener
  useEffect(() => {
    if (!tmdbId) return;

    setLoading(true);
    const unsubscribe = FriendsService.subscribeToMovieActivity(tmdbId, (data) => {
      setActivities(data);
      setLoading(false);

      // Detect new stickers/reactions sent by friends in real time and trigger floating reactions
      if (lastActivityCountRef.current > 0 && data.length > lastActivityCountRef.current) {
        const newItems = data.slice(lastActivityCountRef.current);
        newItems.forEach(item => {
          if (item.type === 'sticker' || item.type === 'reaction') {
            triggerFloatingReaction(item.content);
          }
        });
      }
      lastActivityCountRef.current = data.length;
    });

    return () => unsubscribe();
  }, [tmdbId]);

  const snapPoints = useMemo(() => ['65%', '90%'], []);

  const triggerFloatingReaction = useCallback((emoji: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    // Random horizontal distribution starting from center of screen
    const screenWidth = Dimensions.get('window').width;
    const randomX = (Math.random() - 0.5) * (screenWidth * 0.6); 
    
    setFloatingReactions(prev => [...prev, { id, emoji, x: randomX }]);
  }, []);

  const removeFloatingReaction = useCallback((id: string) => {
    setFloatingReactions(prev => prev.filter(r => r.id !== id));
  }, []);

  const handleSendComment = async () => {
    if (!commentText.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const textToSend = commentText;
    setCommentText('');
    
    await FriendsService.sendMovieActivity(
      tmdbId, 
      'comment', 
      textToSend, 
      selectedProfile
    );
  };

  const handleSendSticker = async (sticker: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    triggerFloatingReaction(sticker);
    
    await FriendsService.sendMovieActivity(
      tmdbId, 
      'sticker', 
      sticker, 
      selectedProfile
    );
  };

  const renderActivityRow = ({ item }: { item: FriendActivity }) => {
    const avatarUri = FRIEND_AVATARS[item.avatarId] || 'https://ui-avatars.com/api/?name=User';
    
    if (item.type === 'sticker' || item.type === 'reaction') {
      return (
        <Animated.View entering={FadeInUp} style={styles.activityStickerRow}>
          <Image source={{ uri: avatarUri }} style={styles.avatarMini} />
          <View style={styles.stickerBubble}>
            <Text style={styles.userName}>{item.userName}</Text>
            <Text style={styles.stickerEmoji}>{item.content}</Text>
          </View>
        </Animated.View>
      );
    }

    return (
      <Animated.View entering={FadeInUp} style={styles.activityCommentRow}>
        <Image source={{ uri: avatarUri }} style={styles.avatarMedium} />
        <View style={styles.commentContent}>
          <View style={styles.commentHeader}>
            <Text style={styles.userName}>{item.userName}</Text>
            <Text style={styles.timeText}>Just now</Text>
          </View>
          <Text style={styles.commentBody}>{item.content}</Text>
        </View>
      </Animated.View>
    );
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      index={0}
      snapPoints={snapPoints}
      backgroundStyle={styles.bottomSheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <View style={{ flex: 1 }}>
        {/* Floating Reactions Layer */}
        <View style={styles.floatingLayer} pointerEvents="none">
          {floatingReactions.map((r) => (
            <FloatingReactionItem 
              key={r.id} 
              id={r.id} 
              emoji={r.emoji} 
              xOffset={r.x} 
              onComplete={removeFloatingReaction} 
            />
          ))}
        </View>

        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>Group Activity</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{movieTitle}</Text>
        </View>

        {loading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loaderText}>Syncing room activity...</Text>
          </View>
        ) : (
          <BottomSheetFlatList
            data={activities}
            renderItem={renderActivityRow}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {/* Sticker Selector Row */}
        <View style={styles.stickerBar}>
          <ScrollViewHorizontal />
          <FlatList
            horizontal
            data={STICKERS}
            keyExtractor={(item) => item}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.stickerScrollList}
            renderItem={({ item }) => (
              <Pressable 
                onPress={() => handleSendSticker(item)}
                style={({ pressed }) => [
                  styles.stickerItem,
                  pressed && { transform: [{ scale: 1.25 }] }
                ]}
              >
                <Text style={styles.stickerText}>{item}</Text>
              </Pressable>
            )}
          />
        </View>

        {/* Comment Input Footer */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.inputFooter}>
            <View style={styles.inputContainer}>
              <BottomSheetTextInput
                value={commentText}
                onChangeText={setCommentText}
                placeholder="Send comments to friends..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                style={styles.textInput}
                multiline
              />
              <Pressable 
                onPress={handleSendComment}
                style={[
                  styles.sendBtn,
                  !commentText.trim() && { opacity: 0.4 }
                ]}
                disabled={!commentText.trim()}
              >
                <Feather name="send" size={18} color="white" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </BottomSheetModal>
  );
});

// Horizontal scroll dummy declaration helper
const ScrollViewHorizontal = () => null;

/**
 * Animated component for flying/floating reactions
 */
interface FloatingReactionItemProps {
  id: string;
  emoji: string;
  xOffset: number;
  onComplete: (id: string) => void;
}

const FloatingReactionItem = React.memo(({ 
  id, 
  emoji, 
  xOffset, 
  onComplete 
}: FloatingReactionItemProps) => {
  const animatedY = useSharedValue(0);
  const animatedScale = useSharedValue(0.4);
  const animatedOpacity = useSharedValue(1);

  useEffect(() => {
    // Sequence: pop up quickly, float upwards, drift laterally, and fade out
    animatedScale.value = withTiming(1.3, { duration: 250 });
    animatedY.value = withTiming(-380, { duration: 1800 }, (isFinished) => {
      if (isFinished) {
        runOnJS(onComplete)(id);
      }
    });
    animatedOpacity.value = withDelay(1200, withTiming(0, { duration: 600 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateY: animatedY.value },
        { translateX: xOffset },
        { scale: animatedScale.value }
      ],
      opacity: animatedOpacity.value,
    };
  });

  return (
    <Animated.View style={[styles.floatingEmoji, animatedStyle]}>
      <Text style={{ fontSize: 42 }}>{emoji}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  bottomSheetBackground: {
    backgroundColor: 'rgba(20, 20, 20, 0.94)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleIndicator: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 44,
  },
  floatingLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  floatingEmoji: {
    position: 'absolute',
    bottom: 80,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '500',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  loaderText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 12,
  },
  listContent: {
    padding: 20,
    paddingBottom: 120,
    gap: 16,
  },
  activityCommentRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  activityStickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 6,
  },
  avatarMedium: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#222',
  },
  avatarMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#222',
  },
  commentContent: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userName: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    fontWeight: '700',
  },
  timeText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  commentBody: {
    color: '#DFDFDF',
    fontSize: 14,
    lineHeight: 19,
  },
  stickerBubble: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stickerEmoji: {
    fontSize: 22,
  },
  stickerBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#161616',
    paddingVertical: 10,
  },
  stickerScrollList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  stickerItem: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
  },
  stickerText: {
    fontSize: 28,
  },
  inputFooter: {
    backgroundColor: '#121212',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 6,
    height: 42,
  },
  textInput: {
    flex: 1,
    color: 'white',
    fontSize: 14,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
