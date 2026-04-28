import React, { useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, SafeAreaView, Alert, Image } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { SubscriptionService } from '../services/SubscriptionService';
import * as Haptics from 'expo-haptics';
import { auth } from '../services/firebase';
import { PayHeroCheckoutModal, PayHeroCheckoutModalRef } from '../components/PaystackCheckoutModal';


const PLANS = [
  {
    id: 'basic',
    name: 'Basic',
    price: 'KES 300 / mo',
    resolution: '720p',
    devices: 'Phone, Tablet',
    profiles: '2 profiles',
    amount: 300,
    planCode: 'PLN_basic_test', // Replace with real Paystack plan code
  },
  {
    id: 'standard',
    name: 'Standard',
    price: 'KES 500 / mo',
    resolution: '1080p',
    devices: 'Phone, Tablet, TV',
    profiles: '4 profiles',
    amount: 500,
    planCode: 'PLN_standard_test', // Replace with real Paystack plan code
  },
  {
    id: 'premium',
    name: 'Premium',
    price: 'KES 700 / mo',
    resolution: '4K + HDR',
    devices: 'Phone, Tablet, TV, Browser',
    profiles: '5 profiles',
    amount: 700,
    planCode: 'PLN_premium_test', // Replace with real Paystack plan code
  }
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState(PLANS[1]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Ref for the Native Modal
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
      
      // Initialize transaction via Pay Hero
      const url = await SubscriptionService.initializePayHeroTransaction(
        user.uid,
        selectedPlan.amount
      );

      setIsLoading(false);

      if (url) {
        // Show the native modal with the Paystack URL
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
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={styles.header}>
        <Image 
          source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg' }}
          style={styles.logo}
          resizeMode="contain"
        />
        <Pressable onPress={() => { auth.signOut(); router.replace('/login'); }}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Choose the plan that's right for you</Text>
        <View style={styles.perks}>
          <View style={styles.perkRow}>
            <Ionicons name="checkmark" size={24} color="#e50914" />
            <Text style={styles.perkText}>Watch all you want. Ad-free.</Text>
          </View>
          <View style={styles.perkRow}>
            <Ionicons name="checkmark" size={24} color="#e50914" />
            <Text style={styles.perkText}>Recommendations just for you.</Text>
          </View>
          <View style={styles.perkRow}>
            <Ionicons name="checkmark" size={24} color="#e50914" />
            <Text style={styles.perkText}>Change or cancel your plan anytime.</Text>
          </View>
        </View>

        <View style={styles.cardsContainer}>
          {PLANS.map((plan) => {
            const isSelected = selectedPlan.id === plan.id;
            return (
              <Pressable 
                key={plan.id}
                style={[styles.planCard, isSelected && styles.planCardSelected]}
                onPress={() => handleSelectPlan(plan)}
              >
                <Text style={[styles.planName, isSelected && styles.planNameSelected]}>{plan.name}</Text>
                <Text style={styles.planPrice}>{plan.price}</Text>
                
                <View style={styles.planDetailRow}>
                  <Text style={styles.planDetailLabel}>Video Quality</Text>
                  <Text style={styles.planDetailValue}>{plan.resolution}</Text>
                </View>
                
                <View style={styles.planDetailRow}>
                  <Text style={styles.planDetailLabel}>Devices</Text>
                  <Text style={styles.planDetailValue}>{plan.devices}</Text>
                </View>

                <View style={[styles.planDetailRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.planDetailLabel}>Profiles</Text>
                  <Text style={styles.planDetailValue}>{plan.profiles}</Text>
                </View>
                
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={16} color="white" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.termsText}>
          By continuing, you agree to our Terms of Use and Privacy Statement. You will be billed securely via Pay Hero / M-Pesa.
        </Text>
        <Pressable 
          style={[styles.payButton, isLoading && { opacity: 0.6 }]} 
          onPress={handleCheckout}
          disabled={isLoading}
        >
          <Text style={styles.payButtonText}>{isLoading ? 'Please wait...' : 'Continue to Payment'}</Text>
        </Pressable>
      </View>

      {/* PayHero Native Modal WebView */}
      <PayHeroCheckoutModal
        ref={checkoutModalRef}
        onSuccess={handlePaymentSuccess}
        onClose={() => {}}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ebebeb',
  },
  logo: { width: 100, height: 30 },
  signOutText: { color: 'black', fontSize: 16, fontWeight: 'bold' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  title: { color: 'black', fontSize: 24, fontWeight: 'bold', marginBottom: 20, marginTop: 10 },
  perks: { marginBottom: 30 },
  perkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 },
  perkText: { color: '#333', fontSize: 16, flex: 1 },
  cardsContainer: { gap: 15 },
  planCard: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 20,
    position: 'relative',
    backgroundColor: '#fff',
  },
  planCardSelected: {
    borderColor: '#e50914',
    borderWidth: 2,
    backgroundColor: '#fffafa',
  },
  planName: { color: 'black', fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  planNameSelected: { color: '#e50914' },
  planPrice: { color: '#666', fontSize: 16, marginBottom: 20 },
  planDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  planDetailLabel: { color: '#666', fontSize: 14 },
  planDetailValue: { color: '#000', fontSize: 14, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  checkBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#e50914',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#ebebeb',
  },
  termsText: { color: '#666', fontSize: 11, textAlign: 'center', marginBottom: 15 },
  payButton: { backgroundColor: '#e50914', height: 50, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
  payButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});
