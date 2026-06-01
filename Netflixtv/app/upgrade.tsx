import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import Animated, { FadeIn, FadeInDown, FadeInRight, useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { auth } from '../services/firebase';
import { SubscriptionService, SubscriptionStatus } from '../services/SubscriptionService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Plan {
  id: string;
  name: string;
  price: number;
  quality: string;
  resolution: string;
  devices: number;
  badge?: string;
  color: string;
}

const PLANS: Plan[] = [
  { id: 'basic', name: 'Basic', price: 300, quality: 'Good', resolution: '720p', devices: 1, color: '#6B7280' },
  { id: 'standard', name: 'Standard', price: 500, quality: 'Great', resolution: '1080p', devices: 2, badge: 'POPULAR', color: '#3B82F6' },
  { id: 'premium', name: 'Premium', price: 1000, quality: 'Best', resolution: '4K+HDR', devices: 4, badge: 'BEST VALUE', color: '#E50914' },
];

const FEATURES = [
  { icon: 'checkmark-circle', label: 'Monthly price' },
  { icon: 'tv-outline', label: 'Video quality' },
  { icon: 'resize-outline', label: 'Resolution' },
  { icon: 'phone-portrait-outline', label: 'Devices' },
  { icon: 'download-outline', label: 'Downloads' },
  { icon: 'people-outline', label: 'Watch on TV' },
];

export default function UpgradeScreen() {
  const router = useRouter();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan>(PLANS[2]); // Default to Premium
  const [payHeroUrl, setPayHeroUrl] = useState<string | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // Listen to subscription — auto-navigate back when user upgrades
  useEffect(() => {
    const unsub = SubscriptionService.listenToSubscription((sub) => {
      setSubscription(sub);
      if (sub.status === 'active') {
        // Subscription activated! Go back automatically.
        router.back();
      }
    });
    return () => unsub();
  }, [router]);

  // Generate payment URL when selected plan changes or retry is clicked
  useEffect(() => {
    if (!auth.currentUser || isFetchingUrl) return;

    let isMounted = true;
    setIsFetchingUrl(true);
    setPayHeroUrl(null); // Clear previous QR while fetching

    SubscriptionService.initializePayHeroTransaction(auth.currentUser.uid, selectedPlan.price)
      .then((url) => {
        if (!isMounted) return;
        if (url && typeof url === 'string' && url.length > 0) {
          setPayHeroUrl(url);
        } else {
          setPayHeroUrl(null);
        }
      })
      .catch((err) => {
        console.warn('[Upgrade] Failed to generate URL:', err);
        if (!isMounted) return;
        setPayHeroUrl(null);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsFetchingUrl(false);
      });

    return () => { isMounted = false; };
  }, [selectedPlan.id, retryTick]); // Re-run when plan changes

  const handleRetry = useCallback(() => {
    setPayHeroUrl(null);
    setIsFetchingUrl(false);
    setRetryTick((t) => t + 1);
  }, []);

  const isLoading = subscription?.status === 'loading';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1a0506', '#0d0a0a', '#000000']}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle Netflix red glow in top-right */}
      <View style={styles.ambientGlow} />

      {/* Back Button */}
      <Pressable
        onPress={() => router.back()}
        style={({ focused }) => [
          styles.backButton,
          focused && styles.backButtonFocused,
        ]}
      >
        <Ionicons name="arrow-back" size={28} color="white" />
      </Pressable>

      <ScrollView 
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeIn.duration(600)} style={styles.header}>
          <View style={styles.headerRow}>
            <Image
              source={require('../assets/images/netflix-n-logo.svg')}
              style={styles.logo}
              contentFit="contain"
            />
            <Text style={styles.headerTitle}>Choose Your Plan</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            Stream unlimited movies and TV shows. Upgrade or downgrade anytime.
          </Text>
        </Animated.View>

        {/* Plan Cards Row */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.planRow}>
          {PLANS.map((plan, index) => {
            const isSelected = selectedPlan.id === plan.id;
            return (
              <Pressable
                key={plan.id}
                onPress={() => setSelectedPlan(plan)}
                style={({ focused }) => [
                  styles.planCard,
                  isSelected && [styles.planCardSelected, { borderColor: plan.color }],
                  focused && styles.planCardFocused,
                ]}
                hasTVPreferredFocus={plan.id === 'premium'}
              >
                {/* Badge */}
                {plan.badge && (
                  <View style={[styles.planBadge, { backgroundColor: plan.color }]}>
                    <Text style={styles.planBadgeText}>{plan.badge}</Text>
                  </View>
                )}

                {/* Gradient accent on selected */}
                {isSelected && (
                  <LinearGradient
                    colors={[`${plan.color}25`, 'transparent']}
                    style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
                  />
                )}

                <Text style={[styles.planName, isSelected && { color: plan.color }]}>
                  {plan.name}
                </Text>
                
                <Text style={styles.planPrice}>
                  KES {plan.price}
                  <Text style={styles.planInterval}>/mo</Text>
                </Text>

                <View style={styles.planDivider} />

                <View style={styles.planFeatures}>
                  <View style={styles.featureRow}>
                    <MaterialCommunityIcons name="quality-high" size={18} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.featureText}>{plan.quality} quality</Text>
                  </View>
                  <View style={styles.featureRow}>
                    <Ionicons name="resize-outline" size={18} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.featureText}>{plan.resolution}</Text>
                  </View>
                  <View style={styles.featureRow}>
                    <Ionicons name="tv-outline" size={18} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.featureText}>{plan.devices} {plan.devices > 1 ? 'devices' : 'device'}</Text>
                  </View>
                  <View style={styles.featureRow}>
                    <Ionicons name="download-outline" size={18} color="rgba(255,255,255,0.5)" />
                    <Text style={styles.featureText}>{plan.id === 'basic' ? 'No' : plan.id === 'standard' ? '5' : 'Unlimited'} downloads</Text>
                  </View>
                </View>

                {/* Selection indicator */}
                {isSelected && (
                  <View style={[styles.selectedIndicator, { backgroundColor: plan.color }]}>
                    <Ionicons name="checkmark" size={18} color="white" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </Animated.View>

        {/* Payment Section */}
        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.paymentSection}>
          <View style={styles.paymentCard}>
            <LinearGradient
              colors={[`${selectedPlan.color}12`, 'rgba(255,255,255,0.03)', 'transparent']}
              style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />

            {/* Left: Payment info */}
            <View style={styles.paymentInfo}>
              <Text style={styles.paymentTitle}>Complete Your Upgrade</Text>
              <Text style={styles.paymentPlan}>
                <Text style={{ color: selectedPlan.color, fontWeight: '900' }}>{selectedPlan.name}</Text>
                {' '}plan — KES {selectedPlan.price}/month
              </Text>
              
              <View style={styles.paymentSteps}>
                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
                  <Text style={styles.stepText}>Scan the QR code with your phone camera</Text>
                </View>
                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
                  <Text style={styles.stepText}>Complete payment via M-Pesa</Text>
                </View>
                <View style={styles.stepRow}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>3</Text></View>
                  <Text style={styles.stepText}>Your TV unlocks automatically ✓</Text>
                </View>
              </View>
            </View>

            {/* Right: QR Code */}
            <View style={styles.qrSection}>
              {isLoading ? (
                <View style={styles.qrPlaceholder}>
                  <ActivityIndicator size="large" color="#E50914" />
                  <Text style={styles.qrLoadingText}>Verifying subscription...</Text>
                </View>
              ) : payHeroUrl && payHeroUrl.length > 0 ? (
                <View style={styles.qrCodeBox}>
                  <View style={styles.qrWrapper}>
                    <QRCode
                      value={payHeroUrl}
                      size={200}
                      color="black"
                      backgroundColor="white"
                    />
                  </View>
                  <Text style={styles.qrHint}>Scan to pay</Text>
                </View>
              ) : isFetchingUrl ? (
                <View style={styles.qrPlaceholder}>
                  <ActivityIndicator size="large" color={selectedPlan.color} />
                  <Text style={styles.qrLoadingText}>Generating payment link...</Text>
                </View>
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Pressable
                    onPress={handleRetry}
                    style={({ focused }) => [
                      styles.retryButton,
                      focused && styles.retryButtonFocused,
                    ]}
                    hasTVPreferredFocus={false}
                  >
                    <Ionicons name="refresh" size={22} color="white" />
                    <Text style={styles.retryText}>Generate QR</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>

          {subscription?.status === 'active' && (
            <Animated.View entering={FadeIn} style={styles.activeNotice}>
              <Ionicons name="checkmark-circle" size={24} color="#46d369" />
              <Text style={styles.activeText}>Your subscription is active!</Text>
            </Animated.View>
          )}
        </Animated.View>

        {/* Fine print */}
        <Text style={styles.finePrint}>
          Payment is processed securely via PayHero. By subscribing, you agree to our Terms of Service.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  ambientGlow: {
    position: 'absolute',
    top: -200,
    right: -200,
    width: 500,
    height: 500,
    borderRadius: 250,
    backgroundColor: 'rgba(229,9,20,0.06)',
  },
  scrollContainer: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: 30,
    left: 40,
    zIndex: 100,
    padding: 12,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backButtonFocused: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    transform: [{ scale: 1.1 }],
    borderColor: 'white',
  },
  content: {
    paddingHorizontal: 80,
    paddingTop: 50,
    paddingBottom: 60,
  },

  // ─── Header ───
  header: {
    marginBottom: 40,
    marginTop: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  logo: {
    width: 36,
    height: 55,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 18,
    lineHeight: 26,
    maxWidth: 600,
    marginLeft: 52,
  },

  // ─── Plan Cards ───
  planRow: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 40,
  },
  planCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 28,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  planCardSelected: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  planCardFocused: {
    transform: [{ scale: 1.03 }],
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  planBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderBottomLeftRadius: 12,
  },
  planBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  planName: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  planPrice: {
    color: 'white',
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 18,
  },
  planInterval: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
  },
  planDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 18,
  },
  planFeatures: {
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
    fontWeight: '500',
  },
  selectedIndicator: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textSelected: {
    color: '#FFFFFF',
  },

  // ─── Payment Section ───
  paymentSection: {
    marginBottom: 30,
  },
  paymentCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 40,
    overflow: 'hidden',
    alignItems: 'center',
  },
  paymentInfo: {
    flex: 1,
    paddingRight: 40,
  },
  paymentTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 10,
  },
  paymentPlan: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 19,
    fontWeight: '500',
    marginBottom: 30,
  },
  paymentSteps: {
    gap: 18,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(229,9,20,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(229,9,20,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#E50914',
    fontSize: 16,
    fontWeight: '800',
  },
  stepText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 17,
    fontWeight: '500',
    flex: 1,
  },

  // ─── QR Code ───
  qrSection: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 260,
  },
  qrCodeBox: {
    alignItems: 'center',
  },
  qrWrapper: {
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 16,
    // Subtle shadow for depth
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
  },
  qrHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    minHeight: 240,
    minWidth: 240,
  },
  qrLoadingText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 15,
    fontWeight: '500',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E50914',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 10,
  },
  retryButtonFocused: {
    backgroundColor: '#ff1a25',
    transform: [{ scale: 1.06 }],
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
  },
  retryText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  activeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: 'rgba(70,211,105,0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(70,211,105,0.25)',
    alignSelf: 'center',
  },
  activeText: {
    color: '#46d369',
    fontSize: 18,
    fontWeight: '700',
  },
  finePrint: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 500,
    alignSelf: 'center',
    lineHeight: 20,
  },
});
