import React, { useCallback } from 'react';
import { View, StyleSheet, StatusBar, requireNativeComponent, ViewProps } from 'react-native';
import { useTheme } from '../_layout';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

interface GamesNativeViewProps extends ViewProps {
  onSearchClick?: (event: any) => void;
  onGamePress?: (event: { nativeEvent: { id: string } }) => void;
}

const GamesNativeView = requireNativeComponent<GamesNativeViewProps>('GamesNativeView');

export default function GamesScreen() {
  const { setThemeColor } = useTheme();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      setThemeColor('#000000');
    }, [])
  );

  const handleSearchClick = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Navigate to search if needed
  };

  const handleGamePress = (event: { nativeEvent: { id: string } }) => {
    const { id } = event.nativeEvent;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
     router.push(`/games/${id}` as any);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <GamesNativeView 
        style={StyleSheet.absoluteFill} 
        onSearchClick={handleSearchClick}
        onGamePress={handleGamePress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000000' 
  },
});
