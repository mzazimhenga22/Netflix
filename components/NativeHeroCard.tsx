import React from 'react';
import { requireNativeComponent, ViewProps, StyleSheet, useWindowDimensions } from 'react-native';

interface NativeHeroCardProps extends ViewProps {
  item: {
    id: string;
    title: string;
    imageUrl: string;
    nLogoUrl: string;
    categories: string[];
    isInMyList?: boolean;
  };
  onPlayPress?: (event: { nativeEvent: { id: string } }) => void;
  onListPress?: (event: { nativeEvent: { id: string } }) => void;
}

const PhoneHeroView = requireNativeComponent<NativeHeroCardProps>('PhoneHeroView');

export const NativeHeroCard = (props: NativeHeroCardProps) => {
  const { width, height } = useWindowDimensions();
  // Ensure the hero card looks great on all phone sizes by dynamically sizing it.
  // Standard Netflix ratio usually covers ~80% of screen height or a 1.4x aspect ratio on width.
  const dynamicHeight = Math.min(height * 0.75, width * 1.45);

  return (
    <PhoneHeroView 
      {...props} 
      style={[styles.container, { height: dynamicHeight }, props.style]} 
    />
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
  }
});
