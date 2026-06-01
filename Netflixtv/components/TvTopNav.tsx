import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, findNodeHandle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useProfile } from '../context/ProfileContext';
import { usePageColor } from '../context/PageColorContext';
import { useTvFocusBridge } from '../context/TvFocusBridgeContext';
import { Image } from 'expo-image';
import Animated, { FadeInLeft, FadeOutLeft, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const NAV_ITEMS = [
  { label: 'Search', icon: 'search', path: '/search', type: 'nav' },
  { label: 'Home', path: '/', type: 'nav' },
  { label: 'New & Hot', path: '/new-hot', type: 'nav' },
  { label: 'Shows', path: '/shows', type: 'nav' },
  { label: 'Movies', path: '/movies', type: 'nav' },
  { label: 'My Netflix', path: '/my-netflix', type: 'nav' },
] as const;

export default function TvTopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { selectedProfile, profiles, selectProfile, subscriptionStatus, maxProfilesAllowed } = useProfile();
  const { pageColor } = usePageColor();
  const { heroFocusTag, setNavFocusTag } = useTvFocusBridge();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navRefs = useRef<Array<any>>([]);
  
  // Focus Management Refs
  const profileBtnRef = useRef<any>(null);
  const firstProfileRef = useRef<any>(null);
  const [profileBtnTag, setProfileBtnTag] = useState<number | null>(null);
  const [firstNavTag, setFirstNavTag] = useState<number | null>(null);

  const isPlanRestricted = subscriptionStatus?.status !== 'active';

  const handlePress = useCallback((item: (typeof NAV_ITEMS)[number]) => {
    if (item.type === 'nav') {
      router.navigate(item.path as any);
    }
  }, [router]);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Manage focus when opening/closing the sidebar modal
  useEffect(() => {
    if (isSidebarOpen) {
      const timeout = setTimeout(() => {
        firstProfileRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeout);
    } else {
      const timeout = setTimeout(() => {
        profileBtnRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isSidebarOpen]);

  useEffect(() => {
    const activeIndex = NAV_ITEMS.findIndex((item) => (
      pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))
    ));

    if (activeIndex < 0) return;

    const activeTag = findNodeHandle(navRefs.current[activeIndex]);
    if (typeof activeTag === 'number') {
      setNavFocusTag(activeTag);
    }
  }, [pathname, setNavFocusTag]);

  return (
    <View style={styles.container}>
      <Modal
        visible={isSidebarOpen}
        transparent
        animationType="none"
        onRequestClose={() => setIsSidebarOpen(false)}
      >
        <View style={styles.sidebarOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsSidebarOpen(false)}
            focusable={false}
            importantForAccessibility="no"
          >
            <Animated.View entering={FadeIn.duration(400)} style={StyleSheet.absoluteFill}>
              <LinearGradient
                colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.4)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </Pressable>

          <Animated.View
            entering={FadeInLeft.duration(400).springify().damping(25)}
            exiting={FadeOutLeft.duration(300)}
            style={styles.sidebar}
          >
            <LinearGradient
              colors={['#141414', '#000000']}
              style={StyleSheet.absoluteFill}
            />

            <View style={styles.sidebarInner}>
              <View style={styles.sidebarHeader}>
                <Text style={styles.sidebarTitle}>Switch Profile</Text>
              </View>
              <View style={styles.sidebarProfiles}>
                {profiles.map((p, index) => {
                  const isLocked = isPlanRestricted && index >= maxProfilesAllowed;
                  
                  return (
                    <Pressable
                      key={p.id}
                      ref={(node) => {
                        if (index === 0) firstProfileRef.current = node;
                      }}
                      focusable={true}
                      style={({ focused }) => [
                        styles.sidebarProfileItem,
                        focused && styles.sidebarProfileItemFocused,
                        p.id === selectedProfile?.id && styles.sidebarProfileItemActive,
                        isLocked && { opacity: 0.5 }
                      ]}
                      onPress={() => {
                        if (isLocked) {
                          setIsSidebarOpen(false);
                          router.push('/upgrade');
                          return;
                        }
                        selectProfile(p);
                        setIsSidebarOpen(false);
                      }}
                    >
                      <View>
                        <Image source={p.avatar} style={styles.sidebarAvatar} contentFit="cover" />
                        {isLocked && (
                          <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderRadius: 4 }}>
                            <Ionicons name="lock-closed" size={24} color="white" />
                          </View>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sidebarProfileName}>{p.name}</Text>
                        {isLocked && <Text style={{ color: '#E50914', fontSize: 12, fontWeight: 'bold', marginTop: 4 }}>UPGRADE TO UNLOCK</Text>}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.sidebarFooter}>
                <Pressable
                  focusable={true}
                  style={({ focused }) => [styles.exitBtn, focused && styles.exitBtnFocused]}
                  onPress={() => {
                    setIsSidebarOpen(false);
                    router.replace('/profiles');
                  }}
                >
                  <Ionicons name="people-outline" size={24} color="white" />
                  <Text style={styles.exitBtnText}>Manage Profiles</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <View style={styles.leftSection}>
        <Pressable
          ref={(node) => {
            profileBtnRef.current = node;
            const tag = findNodeHandle(node);
            if (tag && tag !== profileBtnTag) setProfileBtnTag(tag);
          }}
          onPress={toggleSidebar}
          focusable={true}
          nextFocusRight={firstNavTag ?? undefined}
          nextFocusDown={heroFocusTag ?? undefined}
          style={({ focused }) => [styles.profileBtn, focused && styles.profileBtnFocused]}
        >
          <Image
            source={selectedProfile?.avatar}
            style={styles.profileBox}
            contentFit="cover"
          />
          <Ionicons name="caret-down" size={12} color="rgba(255,255,255,0.6)" style={{ marginLeft: 4 }} />
        </Pressable>
      </View>

      <View style={[styles.navShell, { shadowColor: pageColor }]}>
        <LinearGradient
          colors={[`${pageColor}33`, `${pageColor}66`, `${pageColor}22`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={['rgba(255,255,255,0.05)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.navContent}>
          {NAV_ITEMS.map((item, index) => {
            const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
            const isFocused = focusedIndex === index;

            return (
              <Pressable
                key={item.label}
                ref={(node) => {
                  navRefs.current[index] = node;
                  if (index === 0) {
                    const tag = findNodeHandle(node);
                    if (tag && tag !== firstNavTag) setFirstNavTag(tag);
                  }
                }}
                focusable={true}
                onFocus={() => {
                  setFocusedIndex(index);
                  const tag = findNodeHandle(navRefs.current[index]);
                  if (typeof tag === 'number') {
                    setNavFocusTag(tag);
                  }
                }}
                onBlur={() => setFocusedIndex(null)}
                onPress={() => handlePress(item)}
                nextFocusLeft={index === 0 ? (profileBtnTag ?? undefined) : undefined}
                nextFocusDown={heroFocusTag ?? undefined}
                style={styles.navItemContainer}
              >
                {({ focused }) => (
                  <Animated.View
                    entering={FadeIn.duration(300)}
                    style={[
                      styles.navItem,
                      isActive && styles.navItemActive,
                      focused && styles.navItemFocused,
                      item.label === 'Search' && styles.searchNavItem
                    ]}
                  >
                    {item.label === 'Search' ? (
                      <Ionicons
                        name="search"
                        size={24}
                        color={isActive ? '#050505' : (isFocused ? '#fff' : 'rgba(255,255,255,0.8)')}
                      />
                    ) : (
                      <Text style={[
                        styles.navLabel,
                        isActive && styles.navLabelActive,
                        isFocused && !isActive && styles.navLabelFocused
                      ]}>
                        {item.label}
                      </Text>
                    )}
                  </Animated.View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.rightSection}>
        <Image
          source={require('../assets/images/netflix-n-logo.svg')}
          style={styles.nLogo}
          contentFit="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 80,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    zIndex: 1000,
    paddingTop: 15,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 120, // Give more room for the profile at the edge
    justifyContent: 'flex-start',
  },
  navShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 12,
    paddingHorizontal: 10,
    minHeight: 56,
  },
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    gap: 8, // Tighter gap for animated items
  },
  navItemContainer: {
    borderRadius: 30,
    overflow: 'hidden',
  },
  navItem: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
    backgroundColor: 'transparent', // Default
  },
  searchNavItem: {
    paddingHorizontal: 15,
  },
  navItemFocused: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    transform: [{ scale: 1.04 }],
  },
  navItemActive: {
    backgroundColor: '#fff',
  },
  navLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  navLabelActive: {
    color: '#050505',
    fontWeight: '800',
  },
  navLabelFocused: {
    color: '#fff',
  },
  rightSection: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    width: 120, // Balance the profile on the other side
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  profileBtnFocused: {
    transform: [{ scale: 1.06 }],
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  profileBox: {
    width: 32,
    height: 32,
    borderRadius: 4,
  },
  nLogo: {
    width: 25,
    height: 40,
  },
  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 2000,
  },
  sidebar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 450,
    backgroundColor: '#141414',
    zIndex: 2001,
    shadowColor: '#000',
    shadowOffset: { width: 10, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  sidebarInner: {
    flex: 1,
    padding: 60,
  },
  sidebarHeader: {
    marginBottom: 40,
    paddingTop: 20,
  },
  sidebarTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  sidebarProfiles: {
    flex: 1,
    gap: 35,
  },
  sidebarProfileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 15,
  },
  sidebarProfileItemFocused: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  sidebarProfileItemActive: {
    borderLeftWidth: 4,
    borderLeftColor: '#E50914',
  },
  sidebarAvatar: {
    width: 50,
    height: 50,
    borderRadius: 4,
  },
  sidebarProfileName: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  sidebarFooter: {
    marginTop: 'auto',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 20,
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    padding: 15,
    borderRadius: 8,
  },
  exitBtnFocused: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  exitBtnText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  }
});
