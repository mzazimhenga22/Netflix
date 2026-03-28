import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue } from 'react-native-reanimated';

interface CategoryPillProps {
  categories: { id: number, name: string }[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

export default function TvCategoryPills({ categories, selectedId, onSelect }: CategoryPillProps) {
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
         <Pill 
            label="All" 
            isSelected={selectedId === null} 
            onPress={() => onSelect(null)} 
         />
         {categories.map((cat) => (
            <Pill 
              key={cat.id} 
              label={cat.name} 
              isSelected={selectedId === cat.id} 
              onPress={() => onSelect(cat.id)} 
            />
         ))}
      </ScrollView>
    </View>
  );
}

function Pill({ label, isSelected, onPress }: { label: string, isSelected: boolean, onPress: () => void }) {
  const isFocused = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isFocused.value ? 1.05 : 1) }],
    backgroundColor: isFocused.value ? 'white' : (isSelected ? 'white' : 'rgba(255,255,255,0.1)'),
    borderColor: isFocused.value ? 'white' : 'transparent',
  }));

  const textStyle = useAnimatedStyle(() => ({
    color: isFocused.value ? 'black' : (isSelected ? 'black' : 'rgba(255,255,255,0.7)'),
  }));

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => { isFocused.value = 1; }}
      onBlur={() => { isFocused.value = 0; }}
      style={styles.pillContainer}
    >
      <Animated.View style={[styles.pill, animatedStyle]}>
        <Animated.Text style={[styles.pillText, textStyle]}>{label}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 40,
    marginTop: -20,
    zIndex: 100,
  },
  scrollContent: {
    paddingHorizontal: 60,
    gap: 15,
  },
  pillContainer: {
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 18,
    fontWeight: 'bold',
  }
});
