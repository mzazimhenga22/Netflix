import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useFilter, ContentFilter } from '../context/FilterContext';
import { useProfile } from '../context/ProfileContext';
import { Image } from 'expo-image';
import Animated, { FadeInLeft, FadeOutLeft } from 'react-native-reanimated';

const NAV_ITEMS = [
  { label: 'Search', icon: 'search', path: '/search', type: 'nav' },
  { label: 'Home', path: '/', type: 'filter', filter: 'all' as ContentFilter },
  { label: 'Shows', path: '/', type: 'filter', filter: 'tv' as ContentFilter },
  { label: 'Movies', path: '/', type: 'filter', filter: 'movie' as ContentFilter },
  { label: 'My Netflix', path: '/my-netflix', type: 'nav' },
];

export default function TvTopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { filter, setFilter } = useFilter();
  const { selectedProfile, profiles, selectProfile } = useProfile();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handlePress = useCallback((item: typeof NAV_ITEMS[0]) => {
    if (item.type === 'nav') {
      router.push(item.path as any);
    } else if (item.type === 'filter') {
      setFilter(item.filter!);
      if (pathname !== '/(tabs)' && pathname !== '/' && pathname !== '/index') {
        router.push('/(tabs)');
      }
    }
  }, [pathname, router, setFilter]);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <View style={styles.container}>
      {/* importantForAccessibility ensures individual nav items are focusable, not the container */}
      {isSidebarOpen && (
        <Pressable 
          style={styles.sidebarOverlay} 
          onPress={() => setIsSidebarOpen(false)}
        >
          <Animated.View 
            entering={FadeInLeft.duration(300)} 
            exiting={FadeOutLeft.duration(200)}
            style={styles.sidebar}
          >
            <View style={styles.sidebarHeader}>
               <Text style={styles.sidebarTitle}>Switch Profile</Text>
            </View>
            <View style={styles.sidebarProfiles}>
              {profiles.map((p) => (
                <Pressable
                  key={p.id}
                  style={({ focused }) => [
                    styles.sidebarProfileItem,
                    focused && styles.sidebarProfileItemFocused,
                    p.id === selectedProfile?.id && styles.sidebarProfileItemActive
                  ]}
                  onPress={() => {
                    selectProfile(p);
                    setIsSidebarOpen(false);
                  }}
                >
                  <Image source={p.avatar} style={styles.sidebarAvatar} contentFit="cover" />
                  <Text style={styles.sidebarProfileName}>{p.name}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.sidebarFooter}>
               <Pressable 
                style={({ focused }) => [styles.exitBtn, focused && styles.exitBtnFocused]}
                onPress={() => router.replace('/')}
               >
                 <Ionicons name="exit-outline" size={24} color="white" />
                 <Text style={styles.exitBtnText}>Exit Profiles</Text>
               </Pressable>
            </View>
          </Animated.View>
        </Pressable>
      )}

      {/* Left Section: Profile Icon */}
      <View style={styles.leftSection}>
        <Pressable 
          onPress={toggleSidebar}
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

      {/* Center Section: Navigation */}
      <View style={styles.navContent}>
        {NAV_ITEMS.map((item, index) => {
          const isHomeRoute = pathname === '/' || pathname === '/index' || pathname === '(tabs)';
          const isFilterActive = item.type === 'filter' && filter === item.filter && isHomeRoute;
          const isNavActive = item.type === 'nav' && (pathname === item.path || pathname.includes(item.path));
          const isActive = isFilterActive || isNavActive;
          const isFocused = focusedIndex === index;

          return (
            <Pressable
              key={item.label}
              onFocus={() => setFocusedIndex(index)}
              onBlur={() => setFocusedIndex(null)}
              onPress={() => handlePress(item)}
              style={({ focused }) => [
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
                  color={isActive ? '#000' : (isFocused ? '#fff' : 'rgba(255,255,255,0.8)')} 
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
            </Pressable>
          );
        })}
      </View>
      
      {/* Right Section: Logo */}
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
    paddingHorizontal: 40,
    backgroundColor: 'transparent',
    zIndex: 1000,
    paddingTop: 10,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    gap: 30,
  },
  navItem: {
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  searchNavItem: {
    paddingHorizontal: 15,
  },
  navItemFocused: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  navItemActive: {
    backgroundColor: '#fff',
  },
  navLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 20,
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#000',
    fontWeight: 'bold',
  },
  navLabelFocused: {
    color: '#fff',
  },
  rightSection: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileBtnFocused: {
    transform: [{ scale: 1.1 }],
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
    width: 300,
    backgroundColor: '#141414',
    padding: 30,
    zIndex: 2001,
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
