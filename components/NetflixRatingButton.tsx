import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ThumbDownIcon, ThumbUpIcon, DoubleThumbUpIcon } from './NetflixThumbs';
import { RatingsService, RatingValue } from '../services/RatingsService';
import { useProfile } from '../context/ProfileContext';
import { LiquidGlassCircle, LiquidGlassPill } from './LiquidGlass';

interface Props {
  item?: {
    id: string;
    title?: string;
    type?: string;
    poster_path?: string;
  };
}

export default function NetflixRatingButton({ item }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<RatingValue>('none');
  const { selectedProfile } = useProfile();

  useEffect(() => {
    if (!selectedProfile || !item?.id) return;
    const unsubscribe = RatingsService.subscribeToRating(selectedProfile.id, item.id, (fetchedRating) => {
      setRating(fetchedRating);
    });
    return () => unsubscribe();
  }, [selectedProfile, item?.id]);

  const popupStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isOpen ? 1 : 0, { duration: 150 }),
      transform: [
        { scale: withSpring(isOpen ? 1 : 0.8, { damping: 15 }) },
        { translateY: withSpring(isOpen ? 0 : 20, { damping: 15 }) }
      ],
      pointerEvents: isOpen ? 'auto' : 'none',
    };
  });

  const handleRate = (newRating: RatingValue) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRating(newRating);
    setIsOpen(false);
    
    if (selectedProfile && item?.id) {
       RatingsService.setRating(selectedProfile.id, {
         id: item.id,
         title: item.title,
         type: item.type || 'movie',
         poster_path: item.poster_path
       }, newRating);
     }
  };

  const getActiveIcon = () => {
    if (rating === 'dislike') return <ThumbDownIcon size={24} color="#e50914" filled={true} />;
    if (rating === 'love') return <DoubleThumbUpIcon size={24} color="#e50914" filled={true} />;
    if (rating === 'like') return <ThumbUpIcon size={24} color="#e50914" filled={true} />;
    return <ThumbUpIcon size={24} color="white" filled={false} />;
  };

  return (
    <View style={styles.wrapper}>
      {/* Expanded Floating Pill Overlay */}
      {isOpen && (
        <Pressable style={styles.overlayDismiss} onPress={() => setIsOpen(false)} />
      )}

      <Animated.View style={[styles.floatingPopup, popupStyle]}>
        <LiquidGlassPill style={StyleSheet.absoluteFillObject} />
        <Pressable style={styles.popupOption} onPress={() => handleRate('dislike')}>
          <LiquidGlassCircle size={40}>
            <ThumbDownIcon size={22} color="white" />
          </LiquidGlassCircle>
          <Text style={styles.optionLabel}>Not for me</Text>
        </Pressable>

        <Pressable style={styles.popupOption} onPress={() => handleRate('like')}>
          <LiquidGlassCircle size={40}>
            <ThumbUpIcon size={22} color="white" />
          </LiquidGlassCircle>
          <Text style={styles.optionLabel}>I like this</Text>
        </Pressable>

        <Pressable style={styles.popupOption} onPress={() => handleRate('love')}>
          <LiquidGlassCircle size={40}>
            <DoubleThumbUpIcon size={22} color="white" />
          </LiquidGlassCircle>
          <Text style={styles.optionLabel}>Love this!</Text>
        </Pressable>
      </Animated.View>

      {/* Main Action Button */}
      <Pressable 
        style={styles.mainBtn} 
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setIsOpen(!isOpen);
        }}
      >
        {isOpen ? (
          <LiquidGlassCircle size={48}>
            <Ionicons name="close" size={22} color="white" />
          </LiquidGlassCircle>
        ) : (
          <LiquidGlassCircle size={48}>
            {getActiveIcon()}
          </LiquidGlassCircle>
        )}
        <Text style={[styles.mainText, isOpen && { color: 'white' }]}>Rate</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 999,
  },
  overlayDismiss: {
    position: 'absolute',
    top: -1000,
    bottom: -1000,
    left: -1000,
    right: -1000,
    zIndex: 998,
  },
  floatingPopup: {
    position: 'absolute',
    bottom: 75,
    width: 290,
    backgroundColor: 'transparent',
    borderRadius: 35,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
    zIndex: 999,
    overflow: 'hidden',
  },
  popupOption: {
    alignItems: 'center',
    width: 85,
    gap: 8,
  },
  iconContainer: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionLabel: {
    color: '#E0E0E0',
    fontSize: 10.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  mainBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 75,
    height: 60,
  },
  iconWrapper: {
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIconOuterRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#e50914',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  mainText: {
    color: '#A0A0A0',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
});
