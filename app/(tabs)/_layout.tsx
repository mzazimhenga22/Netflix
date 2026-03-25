import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useProfile } from '../_layout';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

export default function TabLayout() {
  const { selectedAvatar } = useProfile();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#808080',
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          height: 60,
          paddingBottom: 8,
        },
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
      />
      <Tabs.Screen
        name="games"
        options={{
          title: 'Games',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "game-controller" : "game-controller-outline"} size={24} color={color} />
          ),
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
      />
      <Tabs.Screen
        name="my-netflix"
        options={{
          title: 'My Netflix',
          tabBarIcon: ({ color, focused }) => (
            <Animated.Image 
              source={selectedAvatar} 
              style={[
                styles.tabAvatar, 
                { borderColor: focused ? 'white' : 'transparent' }
              ]} 
              sharedTransitionTag="avatar"
            />
          ),
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
