import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

/**
 * Small animated equalizer bars — appears when a teaser is playing.
 * Netflix-style "now playing" indicator.
 */
export default function TeaserIndicator({ visible }: { visible: boolean }) {
  const bar1 = useSharedValue(0.3);
  const bar2 = useSharedValue(0.6);
  const bar3 = useSharedValue(0.4);

  useEffect(() => {
    if (visible) {
      bar1.value = withRepeat(
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }), -1, true
      );
      bar2.value = withRepeat(
        withDelay(100, withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })), -1, true
      );
      bar3.value = withRepeat(
        withDelay(200, withTiming(1, { duration: 350, easing: Easing.inOut(Easing.ease) })), -1, true
      );
    } else {
      bar1.value = withTiming(0.3, { duration: 200 });
      bar2.value = withTiming(0.3, { duration: 200 });
      bar3.value = withTiming(0.3, { duration: 200 });
    }
  }, [visible]);

  const style1 = useAnimatedStyle(() => ({ transform: [{ scaleY: bar1.value }] }));
  const style2 = useAnimatedStyle(() => ({ transform: [{ scaleY: bar2.value }] }));
  const style3 = useAnimatedStyle(() => ({ transform: [{ scaleY: bar3.value }] }));

  if (!visible) return null;

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.bar, style1]} />
      <Animated.View style={[styles.bar, style2]} />
      <Animated.View style={[styles.bar, style3]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 14,
    gap: 2,
    paddingHorizontal: 2,
  },
  bar: {
    width: 3,
    height: 14,
    backgroundColor: '#E50914',
    borderRadius: 1,
  },
});
