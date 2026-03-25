import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, KeyboardAvoidingView, Image, ActivityIndicator, Platform } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function SignupScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignup = () => {
    if (!email || !password) return;
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      router.replace('/profiles');
    }, 1200);
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
        <Pressable onPress={() => router.push('/login')}>
          <Text style={styles.signInLinkText}>Sign In</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Ready to watch?</Text>
        <Text style={styles.subtitle}>Enter your email to create or restart your membership.</Text>
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Email address"
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
            placeholder="Add a password"
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
            styles.signupButton,
            (!email || !password) && styles.signupButtonDisabled,
            pressed && { opacity: 0.8 }
          ]}
          onPress={handleSignup}
          disabled={!email || !password || loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.signupText}>Get Started</Text>
          )}
        </Pressable>

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
  signInLinkText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
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
    marginBottom: 10,
  },
  subtitle: {
    color: '#B3B3B3',
    fontSize: 16,
    marginBottom: 30,
    lineHeight: 22,
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
  signupButton: {
    backgroundColor: '#E50914',
    height: 50,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  signupButtonDisabled: {
    backgroundColor: 'rgba(229, 9, 20, 0.5)',
  },
  signupText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
