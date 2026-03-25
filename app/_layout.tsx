import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { createContext, useContext, useState } from 'react';

// Simple context to share the selected profile avatar
export const ProfileContext = createContext({
  selectedAvatar: require('../assets/avatars/avatar1.png'),
  setSelectedAvatar: (avatar: any) => {},
});

export function useProfile() {
  return useContext(ProfileContext);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [selectedAvatar, setSelectedAvatar] = useState(require('../assets/avatars/avatar1.png'));

  return (
    <ProfileContext.Provider value={{ selectedAvatar, setSelectedAvatar }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="profiles" />
          <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="movie/[id]" />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </ProfileContext.Provider>
  );
}
