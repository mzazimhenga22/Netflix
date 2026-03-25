import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Pressable, Dimensions } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeInRight } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

const READY_TO_WATCH = [
  { id: '1', title: 'Squid Game: Challenge', type: 'Episode 4', image: 'https://image.tmdb.org/t/p/w500/x2LSRm21uTEx2PqYmbtHQmQp0X3.jpg' },
  { id: '2', title: 'The Night Agent', type: 'Series', image: 'https://image.tmdb.org/t/p/w500/7vjaCdZnxEzk9vYVdxpY9p79DfG.jpg' },
  { id: '3', title: 'Extraction 2', type: 'Movie', image: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ao.jpg' },
];

const StorageBar = () => (
  <View style={styles.storageContainer}>
    <View style={styles.storageHeader}>
      <Text style={styles.storageLabel}>iPhone Storage</Text>
      <Text style={styles.storageValue}>12.4 GB used</Text>
    </View>
    <View style={styles.progressBarBg}>
      <View style={[styles.progressFill, { width: '15%', backgroundColor: '#E50914' }]} />
      <View style={[styles.progressFill, { width: '10%', backgroundColor: '#0071eb' }]} />
    </View>
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: '#E50914' }]} />
        <Text style={styles.legendText}>Netflix</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: '#0071eb' }]} />
        <Text style={styles.legendText}>Other</Text>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.dot, { backgroundColor: '#333' }]} />
        <Text style={styles.legendText}>Free</Text>
      </View>
    </View>
  </View>
);

export default function DownloadsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Modern Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={28} color="white" />
          </Pressable>
          <Text style={styles.headerTitle}>Downloads</Text>
          <View style={styles.headerIcons}>
            <MaterialCommunityIcons name="cast" size={24} color="white" />
            <Ionicons name="search" size={24} color="white" />
          </View>
        </View>
        
        <View style={styles.smartRow}>
          <View style={styles.smartBadge}>
            <MaterialCommunityIcons name="auto-fix" size={14} color="#0071eb" />
            <Text style={styles.smartText}>Smart Downloads: On</Text>
          </View>
          <Pressable style={styles.clearBtn}>
            <Text style={styles.clearText}>Manage</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <StorageBar />

        {/* Predictive AI Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ready to watch offline</Text>
          <Text style={styles.sectionSub}>Content we&apos;ve saved based on your taste.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent}>
            {READY_TO_WATCH.map((item, index) => (
              <Animated.View 
                key={item.id} 
                entering={FadeInRight.delay(index * 100)}
                style={styles.readyCard}
              >
                <Image source={{ uri: item.image }} style={styles.readyImage} />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.9)']}
                  style={styles.readyGradient}
                />
                <View style={styles.readyInfo}>
                  <Text style={styles.readyTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.readyMeta}>{item.type}</Text>
                </View>
                <View style={styles.playReady}>
                  <Ionicons name="play" size={18} color="black" />
                </View>
              </Animated.View>
            ))}
          </ScrollView>
        </View>

        {/* Manual Downloads */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Downloads</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </View>
          
          <Animated.View entering={FadeInUp.delay(300)} style={styles.manualItem}>
            <Image source={{ uri: 'https://image.tmdb.org/t/p/w500/v9mRl9m9m9m9m9m9m9m9m9m.jpg' }} style={styles.manualImage} />
            <View style={styles.manualInfo}>
              <Text style={styles.manualTitle}>The Night Agent</Text>
              <Text style={styles.manualMeta}>10 Episodes • 2.4 GB</Text>
            </View>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={18} color="#0071eb" />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(450)} style={styles.manualItem}>
            <Image source={{ uri: 'https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ao.jpg' }} style={styles.manualImage} />
            <View style={styles.manualInfo}>
              <Text style={styles.manualTitle}>Extraction 2</Text>
              <Text style={styles.manualMeta}>Movie • 1.8 GB</Text>
            </View>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={18} color="#0071eb" />
            </View>
          </Animated.View>
        </View>

        {/* Discovery CTA */}
        <View style={styles.discoveryBox}>
          <MaterialCommunityIcons name="download-multiple" size={48} color="#333" />
          <Text style={styles.discoveryTitle}>More to Save</Text>
          <Text style={styles.discoveryDesc}>Always have something to watch when you&apos;re offline or traveling.</Text>
          <Pressable style={styles.discoveryBtn} onPress={() => router.push('/(tabs)/home')}>
            <Text style={styles.discoveryBtnText}>Explore More</Text>
          </Pressable>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: 15,
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    flex: 1,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 20,
  },
  smartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  smartBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 113, 235, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
    gap: 6,
  },
  smartText: {
    color: '#0071eb',
    fontSize: 12,
    fontWeight: 'bold',
  },
  clearBtn: {
    padding: 5,
  },
  clearText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  storageContainer: {
    padding: SPACING.md,
    backgroundColor: '#111',
    margin: SPACING.md,
    borderRadius: 12,
  },
  storageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  storageLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  storageValue: {
    color: COLORS.textSecondary,
    fontSize: 12,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#222',
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 15,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  section: {
    marginTop: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: 15,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: SPACING.md,
  },
  sectionSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    paddingHorizontal: SPACING.md,
    marginTop: 2,
    marginBottom: 15,
  },
  railContent: {
    paddingHorizontal: SPACING.md,
    gap: 15,
  },
  readyCard: {
    width: 220,
    height: 125,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#222',
  },
  readyImage: {
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  readyGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  readyInfo: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 40,
  },
  readyTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  readyMeta: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  playReady: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: 20,
    gap: 15,
  },
  manualImage: {
    width: 120,
    height: 70,
    borderRadius: 6,
    backgroundColor: '#222',
  },
  manualInfo: {
    flex: 1,
  },
  manualTitle: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  manualMeta: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 113, 235, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  discoveryBox: {
    alignItems: 'center',
    padding: SPACING.xl,
    marginTop: SPACING.xl,
  },
  discoveryTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 15,
  },
  discoveryDesc: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  discoveryBtn: {
    marginTop: 20,
    backgroundColor: '#fff',
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 4,
  },
  discoveryBtnText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
