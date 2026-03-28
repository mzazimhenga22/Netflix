import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth } from '../services/firebase';

export default function AccountScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="white" />
        </Pressable>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Banner */}
        <View style={styles.bannerContainer}>
          <Text style={styles.bannerTitle}>Membership & Billing</Text>
          <Text style={styles.bannerSubtitle}>Member Since {new Date().getFullYear()}</Text>
        </View>

        {/* Membership Details */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTextSecondary}>Email</Text>
            <Text style={styles.cardTextPrimary}>{user?.email || 'user@netflix.com'}</Text>
          </View>
          <View style={styles.divider} />
          
          <Pressable style={styles.cardRowInteractive}>
            <Text style={styles.cardTextSecondary}>Password</Text>
            <Text style={styles.cardTextPrimary}>********</Text>
            <Text style={styles.actionText}>Change password</Text>
          </Pressable>
          <View style={styles.divider} />
          
          <Pressable style={styles.cardRowInteractive}>
            <Text style={styles.cardTextSecondary}>Phone</Text>
            <Text style={styles.cardTextPrimary}>Not associated</Text>
            <Text style={styles.actionText}>Add phone number</Text>
          </Pressable>
        </View>

        {/* Billing */}
        <View style={styles.card}>
          <Pressable style={styles.cardRowInteractive}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="card" size={20} color="white" />
              <Text style={styles.cardTextSecondary}>•••• •••• •••• 1234</Text>
            </View>
            <Text style={styles.actionText}>Update payment info</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.cardRowInteractive}>
            <Text style={styles.cardTextSecondary}>Billing details</Text>
            <Text style={styles.actionText}>View</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.cardRowInteractive}>
            <Text style={styles.cardTextSecondary}>Redeem gift card or promo code</Text>
          </Pressable>
        </View>

        {/* Plan Details */}
        <View style={styles.bannerContainer}>
          <Text style={styles.bannerTitle}>Plan Details</Text>
        </View>
        <View style={styles.card}>
          <Pressable style={styles.cardRowInteractive}>
            <Text style={styles.cardTextPrimaryHeading}>Premium Ultra HD</Text>
            <Text style={styles.actionText}>Change plan</Text>
          </Pressable>
        </View>

        {/* Profile & Parental Controls */}
        <View style={styles.bannerContainer}>
          <Text style={styles.bannerTitle}>Profile & Parental Controls</Text>
        </View>
        <View style={styles.card}>
          <Pressable style={styles.cardRowInteractive} onPress={() => router.push('/profiles')}>
            <Text style={styles.cardTextPrimary}>Manage Profiles</Text>
            <Ionicons name="chevron-forward" size={20} color="#888" />
          </Pressable>
        </View>

        {/* Settings */}
        <View style={styles.bannerContainer}>
          <Text style={styles.bannerTitle}>Settings</Text>
        </View>
        <View style={styles.card}>
          <Pressable style={styles.cardRowInteractive}>
            <Text style={styles.cardTextPrimary}>Test participation</Text>
          </Pressable>
          <View style={styles.divider} />
          {/* @ts-ignore */}
          <Pressable style={styles.cardRowInteractive} onPress={() => router.push('/devices')}>
            <Text style={styles.cardTextPrimary}>Manage download devices</Text>
          </Pressable>
          <View style={styles.divider} />
          {/* @ts-ignore */}
          <Pressable style={styles.cardRowInteractive} onPress={() => router.push('/devices')}>
            <Text style={styles.cardTextPrimary}>Sign out of all devices</Text>
          </Pressable>
        </View>

        {/* Cancel Button */}
        <Pressable style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel Membership</Text>
        </Pressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: '#000',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  bannerContainer: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  bannerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bannerSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    marginTop: 4,
  },
  card: {
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#222',
  },
  cardRow: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  cardRowInteractive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  cardTextPrimaryHeading: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardTextPrimary: {
    color: 'white',
    fontSize: 16,
    marginTop: 2,
  },
  cardTextSecondary: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  actionText: {
    color: '#0071eb',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#222',
    marginLeft: 16,
  },
  cancelButton: {
    backgroundColor: '#e50914',
    marginHorizontal: 16,
    marginTop: 30,
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
