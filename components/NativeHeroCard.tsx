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
  const { width } = useWindowDimensions();
  return (
    <PhoneHeroView 
      {...props} 
      style={[styles.container, props.style]} 
    />
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 720,
    alignItems: 'center',
  }
});
