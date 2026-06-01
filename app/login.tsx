import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, ActivityIndicator, Platform, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { COLORS, SPACING } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Image as ExpoImage } from 'expo-image';
import { auth } from '../services/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { SubscriptionService } from '../services/SubscriptionService';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isFocusedEmail, setIsFocusedEmail] = useState(false);
  const [isFocusedPassword, setIsFocusedPassword] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      
      const sub = await SubscriptionService.getSubscription();
      if (sub.status === 'active') {
        router.replace('/profiles');
      } else {
        router.replace('/subscription');
      }
    } catch (error: any) {
      console.error(error);
      let errorMessage = 'Failed to sign in. Please check your credentials.';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No user found with this email.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email format.';
      }
      Alert.alert('Login Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Background Graphic Collage with blur */}
      <View style={StyleSheet.absoluteFill}>
        <ExpoImage
          source={{ uri: 'https://assets.nflxext.com/ffe/siteui/vlv3/ab180a27-b661-44d7-a6d9-940cb32f2f4a/7fb6287d-854d-4a18-80f2-77eb9bfeec3a/US-en-20231009-popsignuptwoweeks-perspective_alpha_website_large.jpg' }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={5}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.92)']}
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
          <Pressable style={styles.helpButton}>
            <Text style={styles.helpText}>Help</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <Animated.View entering={FadeInUp.duration(600).delay(200)} style={styles.cardContainer}>
            <Text style={styles.title}>Sign In</Text>
            
            <View style={[styles.inputContainer, isFocusedEmail && styles.inputFocused]}>
              <TextInput
                style={styles.input}
                placeholder="Email or phone number"
                placeholderTextColor="#A0A0A0"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                onFocus={() => setIsFocusedEmail(true)}
                onBlur={() => setIsFocusedEmail(false)}
                selectionColor="#E50914"
              />
            </View>

            <View style={[styles.inputContainer, isFocusedPassword && styles.inputFocused]}>
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#A0A0A0"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onFocus={() => setIsFocusedPassword(true)}
                onBlur={() => setIsFocusedPassword(false)}
                selectionColor="#E50914"
              />
              <Pressable 
                style={styles.eyeIcon} 
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.showHideText}>{showPassword ? 'HIDE' : 'SHOW'}</Text>
              </Pressable>
            </View>

            <Pressable 
              style={({ pressed }) => [
                styles.signInButton,
                (!email || !password) && styles.signInButtonDisabled,
                pressed && { opacity: 0.85 }
              ]}
              onPress={handleLogin}
              disabled={!email || !password || loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.signInText}>Sign In</Text>
              )}
            </Pressable>

            <Pressable style={styles.codeButton}>
              <Text style={styles.codeText}>Use Sign-In Code</Text>
            </Pressable>

            <Pressable style={styles.forgotPassword}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </Pressable>

            <View style={styles.signupContainer}>
              <Text style={styles.signupPrompt}>New to Netflix? </Text>
              <Pressable onPress={() => router.push('/signup')}>
                <Text style={styles.signupLink}>Sign up now.</Text>
              </Pressable>
            </View>

            <Text style={styles.recaptchaText}>
              Sign in is protected by Google reCAPTCHA to ensure you're not a bot. <Text style={styles.learnMore}>Learn more.</Text>
            </Text>
          </Animated.View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// Simple absolute wrapper for clean platform Safe Area View
function SafeAreaView({ style, children }: any) {
  const { top } = require('react-native-safe-area-context').useSafeAreaInsets();
  return (
    <View style={[{ paddingTop: top, flex: 1 }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 15,
  },
  logo: {
    width: 105,
    height: 35,
  },
  helpButton: {
    padding: 6,
  },
  helpText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  cardContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    borderRadius: 8,
    padding: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  title: {
    color: 'white',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 24,
    letterSpacing: -0.5,
  },
  inputContainer: {
    backgroundColor: '#333333',
    borderRadius: 6,
    marginBottom: 16,
    height: 56,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputFocused: {
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: '#3a3a3a',
  },
  input: {
    color: 'white',
    fontSize: 16,
    paddingHorizontal: 16,
    height: '100%',
    fontWeight: '500',
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    height: '100%',
    justifyContent: 'center',
  },
  showHideText: {
    color: '#B3B3B3',
    fontSize: 13,
    fontWeight: '700',
  },
  signInButton: {
    backgroundColor: '#E50914',
    height: 52,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  signInButtonDisabled: {
    backgroundColor: 'rgba(229, 9, 20, 0.4)',
    shadowOpacity: 0,
    elevation: 0,
  },
  signInText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
  },
  codeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    height: 52,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  codeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
  },
  forgotPassword: {
    alignItems: 'center',
    marginBottom: 24,
  },
  forgotText: {
    color: '#B3B3B3',
    fontSize: 14,
    fontWeight: '500',
  },
  signupContainer: {
    flexDirection: 'row',
    marginBottom: 24,
    justifyContent: 'center',
  },
  signupPrompt: {
    color: '#B3B3B3',
    fontSize: 15.5,
  },
  signupLink: {
    color: 'white',
    fontSize: 15.5,
    fontWeight: '800',
  },
  recaptchaText: {
    color: '#8C8C8C',
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
  },
  learnMore: {
    color: '#0071EB',
    fontWeight: '600',
  },
});
