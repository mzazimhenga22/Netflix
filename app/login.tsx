import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Image, ActivityIndicator, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { COLORS, SPACING } from '../constants/theme';
import { Ionicons } from '@expo/vector-icons';

import { auth } from '../services/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { SubscriptionService } from '../services/SubscriptionService';
import { Alert } from 'react-native';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      
      <View style={styles.header}>
        <Image 
          source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg' }}
          style={styles.logo}
          resizeMode="contain"
        />
        <Pressable>
          <Text style={styles.helpText}>Help</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Sign In</Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Email or phone number"
            placeholderTextColor="#8C8C8C"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#8C8C8C"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
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
            pressed && { opacity: 0.8 }
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
  },
  logo: {
    width: 100,
    height: 30,
  },
  helpText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  title: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 25,
  },
  inputContainer: {
    backgroundColor: '#333333',
    borderRadius: 4,
    marginBottom: 16,
    height: 60,
    justifyContent: 'center',
  },
  input: {
    color: 'white',
    fontSize: 16,
    paddingHorizontal: 16,
    height: '100%',
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    height: '100%',
    justifyContent: 'center',
  },
  showHideText: {
    color: '#B3B3B3',
    fontSize: 14,
    fontWeight: '600',
  },
  signInButton: {
    backgroundColor: '#E50914',
    height: 50,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
  },
  signInButtonDisabled: {
    backgroundColor: 'rgba(229, 9, 20, 0.5)',
  },
  signInText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  codeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    height: 50,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  codeText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  forgotPassword: {
    alignItems: 'center',
    marginBottom: 30,
  },
  forgotText: {
    color: '#B3B3B3',
    fontSize: 15,
  },
  signupContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  signupPrompt: {
    color: '#B3B3B3',
    fontSize: 16,
  },
  signupLink: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  recaptchaText: {
    color: '#8C8C8C',
    fontSize: 13,
    lineHeight: 18,
  },
  learnMore: {
    color: '#0071EB',
  },
});
