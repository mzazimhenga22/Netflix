import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { SubscriptionService } from '../services/SubscriptionService';
import * as Haptics from 'expo-haptics';
import { auth } from '../services/firebase';
import { PayHeroCheckoutModal, PayHeroCheckoutModalRef } from '../components/PaystackCheckoutModal';
import { COLORS, SPACING } from '../constants/theme';

const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 'KES 300 / mo',
    resolution: '720p',
    devices: 'Phone, Tablet',
    profiles: '2 profiles',
    amount: 300,
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 'KES 500 / mo',
    resolution: '1080p',
    devices: 'Phone, Tablet, TV',
    profiles: '4 profiles',
    amount: 500,
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'KES 700 / mo',
    resolution: '4K + HDR',
    devices: 'Phone, Tablet, TV, Browser',
    profiles: '5 profiles',
    amount: 700,
  }
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState(PLANS[1]);
  const [isLoading, setIsLoading] = useState(false);
  const checkoutModalRef = useRef<PayHeroCheckoutModalRef>(null);

  const handleSelectPlan = (plan: any) => {
    Haptics.selectionAsync();
    setSelectedPlan(plan);
  };

  const handleCheckout = async () => {
    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        Alert.alert('Sign In Required', 'You must be signed in with an email to subscribe.');
        return;
      }

      setIsLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      const url = await SubscriptionService.initializePayHeroTransaction(
        user.uid,
        selectedPlan.amount
      );

      setIsLoading(false);

      if (url) {
        checkoutModalRef.current?.present(url);
      } else {
        Alert.alert('Error', 'Could not initialize payment. Please check your internet connection.');
      }
    } catch (e: any) {
      setIsLoading(false);
      console.error('[Subscription] Checkout error:', e);
      Alert.alert('Error', e?.message || 'Something went wrong during checkout.');
    }
  };

  const handlePaymentSuccess = async () => {
    checkoutModalRef.current?.dismiss();
    await SubscriptionService.activateSubscription(selectedPlan.id, selectedPlan.name);
    Alert.alert('Success!', `You're now subscribed to the ${selectedPlan.name} plan.`, [
      { text: 'OK', onPress: () => router.replace('/profiles') }
    ]);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Ambient background glow */}
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient
          colors={['rgba(229, 9, 20, 0.15)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(229, 9, 20, 0.05)']}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.header}>
          <ExpoImage 
            source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg' }}
            style={styles.logo}
            contentFit="contain"
          />
          <Pressable 
            style={styles.signOutButton}
            onPress={() => { 
              auth.signOut(); 
              router.replace('/login'); 
            }}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.Text entering={FadeInUp.duration(600).delay(100)} style={styles.title}>
            Choose the plan that's right for you
          </Animated.Text>
          
          <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.perks}>
            <View style={styles.perkRow}>
              <View style={styles.checkContainer}>
                <Ionicons name="checkmark" size={16} color="white" />
              </View>
              <Text style={styles.perkText}>Watch all you want. Ad-free.</Text>
            </View>
            <View style={styles.perkRow}>
              <View style={styles.checkContainer}>
                <Ionicons name="checkmark" size={16} color="white" />
              </View>
              <Text style={styles.perkText}>Includes Spotify Premium Access!</Text>
            </View>
            <View style={styles.perkRow}>
              <View style={styles.checkContainer}>
                <Ionicons name="checkmark" size={16} color="white" />
              </View>
              <Text style={styles.perkText}>Recommendations just for you.</Text>
            </View>
            <View style={styles.perkRow}>
              <View style={styles.checkContainer}>
                <Ionicons name="checkmark" size={16} color="white" />
              </View>
              <Text style={styles.perkText}>Change or cancel your plan anytime.</Text>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(700).delay(350)} style={styles.cardsContainer}>
            {PLANS.map((plan, index) => {
              const isSelected = selectedPlan.id === plan.id;
              return (
                <Pressable 
                  key={plan.id}
                  style={[
                    styles.planCard, 
                    isSelected && styles.planCardSelected,
                    { transform: [{ scale: isSelected ? 1.01 : 1 }] }
                  ]}
                  onPress={() => handleSelectPlan(plan)}
                >
                  <View style={styles.cardHeader}>
                    <View>
                      <Text style={[styles.planName, isSelected && styles.planNameSelected]}>
                        {plan.name}
                      </Text>
                      <Text style={styles.planPrice}>{plan.price}</Text>
                    </View>
                    {isSelected && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>Active</Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.planDetailRow}>
                    <Text style={styles.planDetailLabel}>Video Quality</Text>
                    <Text style={styles.planDetailValue}>{plan.resolution}</Text>
                  </View>
                  
                  <View style={styles.planDetailRow}>
                    <Text style={styles.planDetailLabel}>Devices</Text>
                    <Text style={styles.planDetailValue}>{plan.devices}</Text>
                  </View>

                  <View style={[styles.planDetailRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                    <Text style={styles.planDetailLabel}>Profiles</Text>
                    <Text style={styles.planDetailValue}>{plan.profiles}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Animated.View>
        </ScrollView>

        <Animated.View entering={FadeInDown.duration(600).delay(500)} style={styles.footer}>
          <Text style={styles.termsText}>
            By continuing, you agree to our Terms of Use and Privacy Statement. You will be billed securely via Pay Hero / M-Pesa.
          </Text>
          <Pressable 
            style={[styles.payButton, isLoading && { opacity: 0.6 }]} 
            onPress={handleCheckout}
            disabled={isLoading}
          >
            <Text style={styles.payButtonText}>
              {isLoading ? 'Please wait...' : `Continue with ${selectedPlan.name}`}
            </Text>
          </Pressable>
        </Animated.View>
      </SafeAreaView>

      <PayHeroCheckoutModal
        ref={checkoutModalRef}
        onSuccess={handlePaymentSuccess}
        onClose={() => {}}
      />
    </View>
  );
}

// Simple absolute wrapper for clean platform Safe Area View
function SafeAreaView({ style, children }: any) {
  const { top, bottom } = require('react-native-safe-area-context').useSafeAreaInsets();
  return (
    <View style={[{ paddingTop: top, paddingBottom: bottom, flex: 1 }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000000' 
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 15,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  logo: { 
    width: 105, 
    height: 35 
  },
  signOutButton: {
    padding: 6,
  },
  signOutText: { 
    color: 'white', 
    fontSize: 15, 
    fontWeight: '700' 
  },
  scrollContent: { 
    padding: 24, 
    paddingBottom: 150 
  },
  title: { 
    color: 'white', 
    fontSize: 26, 
    fontWeight: '900', 
    marginBottom: 20, 
    marginTop: 10,
    letterSpacing: -0.5,
  },
  perks: { 
    marginBottom: 28 
  },
  perkRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 14, 
    gap: 12 
  },
  checkContainer: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e50914',
    justifyContent: 'center',
    alignItems: 'center',
  },
  perkText: { 
    color: '#E0E0E0', 
    fontSize: 15.5, 
    fontWeight: '600',
    flex: 1 
  },
  cardsContainer: { 
    gap: 16 
  },
  planCard: {
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 10,
    padding: 20,
    position: 'relative',
    backgroundColor: 'rgba(20, 20, 20, 0.85)',
  },
  planCardSelected: {
    borderColor: '#e50914',
    borderWidth: 2,
    backgroundColor: 'rgba(229, 9, 20, 0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  planName: { 
    color: 'white', 
    fontSize: 20, 
    fontWeight: '900', 
    marginBottom: 4 
  },
  planNameSelected: { 
    color: '#e50914' 
  },
  planPrice: { 
    color: '#B3B3B3', 
    fontSize: 16,
    fontWeight: '600',
  },
  selectedBadge: {
    backgroundColor: '#e50914',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  selectedBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
  },
  planDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  planDetailLabel: { 
    color: '#B3B3B3', 
    fontSize: 14,
    fontWeight: '500',
  },
  planDetailValue: { 
    color: 'white', 
    fontSize: 14, 
    fontWeight: '700', 
    maxWidth: '60%', 
    textAlign: 'right' 
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    padding: 24,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  termsText: { 
    color: '#8C8C8C', 
    fontSize: 12, 
    textAlign: 'center', 
    marginBottom: 16,
    lineHeight: 18,
  },
  payButton: { 
    backgroundColor: '#e50914', 
    height: 52, 
    borderRadius: 6, 
    justifyContent: 'center', 
    alignItems: 'center',
    shadowColor: '#e50914',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  payButtonText: { 
    color: 'white', 
    fontSize: 17, 
    fontWeight: '800' 
  },
});
