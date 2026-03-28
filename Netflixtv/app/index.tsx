import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Dimensions, 
  ImageBackground,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  FadeIn, 
  FadeInUp,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { fetchTrending, getBackdropUrl } from '../services/tmdb';
import { auth } from '../services/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import TvKeyboard from '../components/TvKeyboard';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const router = useRouter();
  const [featured, setFeatured] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState('');
  
  // Focus states for TV D-Pad
  const [focusedField, setFocusedField] = useState<'email' | 'password' | 'signIn' | 'keyboard'>('email');
  const emailScale = useSharedValue(1);
  const passwordScale = useSharedValue(1);
  const signInScale = useSharedValue(1);

  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/profiles');
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    async function loadFeatured() {
      try {
        const trending = await fetchTrending('movie');
        if (trending && trending.length > 0) {
          setFeatured(trending[Math.floor(Math.random() * 5)]);
        }
      } catch (error) {
        console.error("Failed to load background:", error);
      }
    }
    loadFeatured();
  }, []);

  // Handle focus animations
  useEffect(() => {
    emailScale.value = withSpring(focusedField === 'email' ? 1.05 : 1);
    passwordScale.value = withSpring(focusedField === 'password' ? 1.05 : 1);
    signInScale.value = withSpring(focusedField === 'signIn' ? 1.05 : 1);
  }, [focusedField]);

  const emailStyle = useAnimatedStyle(() => ({
    transform: [{ scale: emailScale.value }],
    borderColor: focusedField === 'email' ? '#fff' : 'rgba(255,255,255,0.2)',
    backgroundColor: focusedField === 'email' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
  }));

  const passwordStyle = useAnimatedStyle(() => ({
    transform: [{ scale: passwordScale.value }],
    borderColor: focusedField === 'password' ? '#fff' : 'rgba(255,255,255,0.2)',
    backgroundColor: focusedField === 'password' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
  }));

  const signInStyle = useAnimatedStyle(() => ({
    transform: [{ scale: signInScale.value }],
    backgroundColor: focusedField === 'signIn' ? '#E50914' : '#b00710',
  }));

  const handleSignIn = async () => {
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError('');
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      console.error("Login failed:", err);
      setIsLoggingIn(false);
      setError(err.message || 'Authentication failed. Please try again.');
    }
  };

  const onKeyPress = (key: string) => {
    if (focusedField === 'email' || focusedField === 'keyboard') {
      setEmail(prev => prev + key);
    } else if (focusedField === 'password') {
      setPassword(prev => prev + key);
    }
  };

  const onBackspace = () => {
    if (focusedField === 'email' || focusedField === 'keyboard') {
      setEmail(prev => prev.slice(0, -1));
    } else if (focusedField === 'password') {
      setPassword(prev => prev.slice(0, -1));
    }
  };

  const onClear = () => {
    if (focusedField === 'email' || focusedField === 'keyboard') {
      setEmail('');
    } else if (focusedField === 'password') {
      setPassword('');
    }
  };

  return (
    <View style={styles.container}>
      <ImageBackground 
        source={featured ? { uri: getBackdropUrl(featured.backdrop_path) } : require('../assets/1000446947.jpg')} 
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.95)', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
          style={styles.gradientOverlay}
        />
        
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
             <Animated.View entering={FadeInUp.delay(200)} style={styles.header}>
                <Text style={styles.netflixLogoText}>NETFLIX</Text>
             </Animated.View>
  
             <View style={styles.loginCard}>
                <Text style={styles.titleText}>Sign In</Text>
                
                {error ? (
                  <Animated.View entering={FadeIn} style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </Animated.View>
                ) : null}

                <View style={styles.sideBySide}>
                  <View style={styles.formSection}>
                    <View style={styles.inputSection}>
                      <Animated.View style={[styles.inputWrapper, emailStyle]}>
                          <TextInput
                            ref={emailInputRef}
                            style={styles.input}
                            placeholder="Email or phone number"
                            placeholderTextColor="rgba(255,255,255,0.5)"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            onFocus={() => setFocusedField('email')}
                            onSubmitEditing={() => passwordInputRef.current?.focus()}
                          />
                      </Animated.View>

                      <Animated.View style={[styles.inputWrapper, passwordStyle]}>
                          <TextInput
                            ref={passwordInputRef}
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor="rgba(255,255,255,0.5)"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            onFocus={() => setFocusedField('password')}
                            onSubmitEditing={handleSignIn}
                          />
                      </Animated.View>

                      <TouchableOpacity 
                        activeOpacity={0.9}
                        onFocus={() => setFocusedField('signIn')}
                        onPress={handleSignIn}
                        style={styles.signInBtnWrapper}
                      >
                        <Animated.View style={[styles.signInBtn, signInStyle]}>
                            {isLoggingIn ? (
                              <ActivityIndicator color="white" />
                            ) : (
                              <Text style={styles.signInBtnText}>Sign In</Text>
                            )}
                        </Animated.View>
                      </TouchableOpacity>

                      <View style={styles.helpRow}>
                          <Text style={styles.helpText}>Need help?</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.keyboardDivider} />

                  <View style={styles.keyboardSection}>
                    <TvKeyboard 
                      onKeyPress={onKeyPress}
                      onBackspace={onBackspace}
                      onClear={onClear}
                    />
                  </View>
                </View>

                <View style={styles.signupBox}>
                   <Text style={styles.signupText}>New to Netflix?</Text>
                   <Text style={styles.signupCallout}>Please download the MovieFlix app on your phone to sign up.</Text>
                </View>
             </View>
          </View>
        </ScrollView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    paddingVertical: 100,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: height,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    position: 'absolute',
    top: 60,
    left: 60,
  },
  netflixLogoText: {
    color: '#E50914',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
  },
  loginCard: {
    width: 1000,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 60,
    borderRadius: 8,
  },
  sideBySide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
  },
  formSection: {
    flex: 1,
    paddingRight: 60,
  },
  keyboardDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    height: '100%',
  },
  titleText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  errorContainer: {
    backgroundColor: '#e87c03',
    padding: 15,
    borderRadius: 4,
    marginBottom: 20,
  },
  errorText: {
    color: 'white',
    fontSize: 14,
  },
  inputSection: {
    width: '100%',
  },
  inputWrapper: {
    width: '100%',
    height: 60,
    borderRadius: 4,
    borderWidth: 2,
    marginBottom: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  input: {
    color: 'white',
    fontSize: 18,
    height: '100%',
  },
  signInBtnWrapper: {
    width: '100%',
    marginTop: 20,
  },
  signInBtn: {
    width: '100%',
    height: 60,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInBtnText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  helpRow: {
    marginTop: 15,
    alignItems: 'center',
  },
  helpText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  keyboardSection: {
    flex: 1,
    paddingLeft: 60,
  },
  signupBox: {
    marginTop: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 30,
  },
  signupText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    marginBottom: 10,
  },
  signupCallout: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '500',
  }
});
