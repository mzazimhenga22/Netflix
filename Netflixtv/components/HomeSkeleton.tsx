import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions, ScrollView } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  Easing, 
  withSequence 
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

export default function HomeSkeleton() {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <View style={styles.container}>
      {/* Hero Header Skeleton */}
      <Animated.View style={[styles.heroSkeleton, animatedStyle]} />
      
      <ScrollView style={styles.scroll} scrollEnabled={false} showsVerticalScrollIndicator={false}>
         <View style={{ marginTop: height * 0.7 }}>
           {/* Generate Row skeletons mimicking the exact ExpandingRow structure */}
           {[1, 2, 3].map(row => (
             <View key={row} style={styles.row}>
               <Animated.View style={[styles.rowTitle, animatedStyle]} />
               <View style={styles.cardsRow}>
                 {[1, 2, 3, 4, 5, 6].map(card => (
                   <Animated.View key={card} style={[styles.card, animatedStyle]} />
                 ))}
               </View>
             </View>
           ))}
         </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000' 
  },
  scroll: { 
    flex: 1 
  },
  heroSkeleton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.85,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  row: { 
    marginBottom: 40, 
    paddingLeft: 60 
  },
  rowTitle: {
    width: 250,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    marginBottom: 15,
  },
  cardsRow: { 
    flexDirection: 'row', 
    gap: 15 
  },
  card: {
    width: 220,
    height: 124,  // Matches TV Poster Card width/aspect ratio
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  }
});
