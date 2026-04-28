import { Tabs } from 'expo-router';
import React from 'react';
import * as Haptics from 'expo-haptics';
import { StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../_layout';
import { useProfile } from '../../context/ProfileContext';
import Animated, { SharedTransition, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

// const customTransition = SharedTransition.custom((values) => {
//   'worklet';
//   return {
//     height: withSpring(values.targetHeight, { damping: 15, stiffness: 100 }),
//     width: withSpring(values.targetWidth, { damping: 15, stiffness: 100 }),
//     originX: withSpring(values.targetOriginX, { damping: 15, stiffness: 100 }),
//     originY: withSpring(values.targetOriginY, { damping: 15, stiffness: 100 }),
//   };
// });

export default function TabLayout() {
  const { selectedProfile } = useProfile();
  const { themeColor } = useTheme();

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#808080',
        sceneStyle: {
          backgroundColor: '#000000',
        },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: 60,
          paddingBottom: 8,
        },
        tabBarHideOnKeyboard: true,
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            <LinearGradient
              colors={['transparent', themeColor]}
              locations={[0.1, 1]}
              style={{ position: 'absolute', top: -30, left: 0, right: 0, height: 30 }}
              pointerEvents="none"
            />
            <View style={{ flex: 1, backgroundColor: themeColor }} />
          </View>
        ),
        headerShown: false,
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
          ),
        }}
        listeners={{
          tabPress: () => Haptics.selectionAsync(),
        }}
      />
      <Tabs.Screen
        name="games"
        options={{
          title: 'Games',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "game-controller" : "game-controller-outline"} size={24} color={color} />
          ),
        }}
        listeners={{
          tabPress: () => Haptics.selectionAsync(),
        }}
      />
      <Tabs.Screen
        name="new"
        options={{
          title: 'New & Hot',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "play-box-multiple" : "play-box-multiple-outline"} size={24} color={color} />
          ),
        }}
        listeners={{
          tabPress: () => Haptics.selectionAsync(),
        }}
      />
      <Tabs.Screen
        name="clips"
        options={{
          title: 'Clips',
          tabBarIcon: ({ color, focused }) => (
            <MaterialCommunityIcons name={focused ? "creation" : "creation-outline"} size={24} color={color} />
          ),
        }}
        listeners={{
          tabPress: () => Haptics.selectionAsync(),
        }}
      />
      <Tabs.Screen
        name="my-netflix"
        options={{
          title: 'My Netflix',
          tabBarIcon: ({ color, focused }) => (
            <Animated.Image 
              source={selectedProfile?.avatar} 
              style={[
                styles.tabAvatar, 
                { borderColor: focused ? 'white' : 'transparent' }
              ]} 
            />
          ),
        }}
        listeners={{
          tabPress: () => {
            Haptics.selectionAsync();
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabAvatar: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 1.5,
  }
});
