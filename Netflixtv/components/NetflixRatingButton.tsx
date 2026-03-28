import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useAnimatedStyle, withTiming, withSpring, interpolate } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ThumbDownIcon, ThumbUpIcon, DoubleThumbUpIcon } from './NetflixThumbs';

type Rating = 'none' | 'dislike' | 'like' | 'love';

export default function NetflixRatingButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<Rating>('none');

  const containerStyle = useAnimatedStyle(() => {
    return {
      width: withSpring(isOpen ? 220 : 60, { damping: 15 }),
      backgroundColor: withTiming(isOpen ? 'rgba(30,30,30,0.95)' : 'transparent', { duration: 200 }),
      borderRadius: 30,
    };
  });

  const optionsStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isOpen ? 1 : 0, { duration: 200 }),
      transform: [
        { scale: withSpring(isOpen ? 1 : 0.8) },
        { translateY: withSpring(isOpen ? 0 : 10) }
      ],
    };
  });

  const handleRate = (newRating: Rating) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRating(newRating);
    setIsOpen(false);
  };

  const currentIcon = () => {
    if (rating === 'dislike') return <ThumbDownIcon size={24} color="white" />;
    if (rating === 'love') return <DoubleThumbUpIcon size={24} color="white" />;
    return <ThumbUpIcon size={24} color={rating === 'like' ? 'white' : '#fff'} />;
  };

  return (
    <View style={styles.wrapper}>
      {/* Expanded Rating Pill */}
      {isOpen && (
        <Pressable style={styles.overlay} onPress={() => setIsOpen(false)} />
      )}

      {/* Main Base Button (Always takes space) */}
      <View style={styles.mainBtn}>
        {currentIcon()}
        <Text style={styles.mainText}>Rate</Text>
      </View>

      {/* Expanding Overlay Button */}
      <Animated.View style={[styles.container, containerStyle]}>
        {!isOpen ? (
          <Pressable 
            style={[StyleSheet.absoluteFill, styles.mainBtn]} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsOpen(true);
            }}
          />
        ) : (
          <Animated.View style={[styles.optionsRow, optionsStyle]}>
            <Pressable style={styles.optionBtn} onPress={() => handleRate('dislike')}>
              <ThumbDownIcon size={28} color={rating === 'dislike' ? 'white' : '#808080'} />
            </Pressable>
            <Pressable style={styles.optionBtn} onPress={() => handleRate('like')}>
              <ThumbUpIcon size={28} color={rating === 'like' ? 'white' : '#808080'} />
            </Pressable>
            <Pressable style={styles.optionBtn} onPress={() => handleRate('love')}>
              <DoubleThumbUpIcon size={28} color={rating === 'love' ? 'white' : '#808080'} />
            </Pressable>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    width: 60,
    height: 60,
  },
  overlay: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
    zIndex: -1,
  },
  container: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'absolute',
    left: -10, // Adjust to cover the button seamlessly
    top: 0,
  },
  mainBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
  },
  mainText: {
    color: '#A0A0A0',
    fontSize: 12,
    marginTop: 6,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: 200,
    paddingHorizontal: 20,
    height: 60,
  },
  optionBtn: {
    padding: 10,
  }
});
