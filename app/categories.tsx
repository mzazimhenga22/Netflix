import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

const CATEGORIES = [
  'Home', 'My List', 'Available for Download', 'Hindi', 'Tamil', 'Telugu', 'Malayalam', 'Marathi', 'English', 
  'Action', 'Anime', 'Award-Winning', 'Children & Family', 'Comedies', 'Documentaries', 'Dramas', 'Fantasy', 
  'Horror', 'Music & Musicals', 'Reality TV', 'Romance', 'Sci-Fi', 'Stand-Up Comedy', 'Thriller'
];

export default function CategoriesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {CATEGORIES.map((category, index) => (
          <Animated.View 
            key={category} 
            entering={FadeIn.delay(index * 30)}
          >
            <Pressable 
              style={styles.categoryItem} 
              onPress={() => router.back()}
            >
              <Text style={[
                styles.categoryText, 
                category === 'Home' && styles.activeCategoryText
              ]}>
                {category}
              </Text>
            </Pressable>
          </Animated.View>
        ))}
      </ScrollView>

      {/* Close Button */}
      <Animated.View entering={SlideInDown.duration(400)} style={styles.closeContainer}>
        <Pressable style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="close" size={30} color="black" />
        </Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  scrollContent: {
    alignItems: 'center',
    paddingVertical: 100,
  },
  categoryItem: {
    paddingVertical: 15,
    width: '100%',
    alignItems: 'center',
  },
  categoryText: {
    color: COLORS.textSecondary,
    fontSize: 18,
    fontWeight: '500',
  },
  activeCategoryText: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
  },
  closeContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  closeButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  }
});
