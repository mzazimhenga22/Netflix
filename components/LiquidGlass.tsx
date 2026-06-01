import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

interface GlassCircleProps {
  children: React.ReactNode;
  size?: number;
  style?: any;
}

export const LiquidGlassCircle = ({ children, size = 36, style }: GlassCircleProps) => {
  const radius = size / 2;
  return (
    <View style={[{ width: size, height: size, borderRadius: radius }, style]}>
      {/* Shadow */}
      <View style={{
        ...StyleSheet.absoluteFillObject,
        borderRadius: radius,
        backgroundColor: 'rgba(0,0,0,0.01)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 8,
      }} />
      <View style={{
        flex: 1,
        borderRadius: radius,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        {/* Blur */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 60 : 70}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        {/* Dark tint */}
        <View style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(15, 15, 15, 0.42)',
        }} />
        {/* Specular highlight */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.35)',
            'rgba(255,255,255,0.10)',
            'transparent',
            'rgba(255,255,255,0.05)',
          ]}
          locations={[0, 0.3, 0.6, 1]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Glass border */}
        <View style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: radius,
          borderWidth: 1.5,
          borderColor: 'rgba(255,255,255,0.20)',
          borderTopColor: 'rgba(255,255,255,0.50)',
          borderBottomColor: 'rgba(255,255,255,0.04)',
        }} pointerEvents="none" />
        {children}
      </View>
    </View>
  );
};

interface GlassPillProps {
  children: React.ReactNode;
  style?: any;
  borderRadius?: number;
}

export const LiquidGlassPill = ({ children, style, borderRadius = 22 }: GlassPillProps) => (
  <View style={[{ borderRadius, overflow: 'hidden' }, style]}>
    {/* Shadow */}
    <View style={{
      ...StyleSheet.absoluteFillObject,
      borderRadius,
      backgroundColor: 'rgba(0,0,0,0.01)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    }} />
    <View style={{
      flexGrow: 1,
      borderRadius,
      overflow: 'hidden',
    }}>
      {/* Blur */}
      <BlurView
        intensity={Platform.OS === 'ios' ? 55 : 65}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      {/* Dark tint */}
      <View style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(15, 15, 15, 0.42)',
      }} />
      {/* Specular */}
      <LinearGradient
        colors={[
          'rgba(255,255,255,0.30)',
          'rgba(255,255,255,0.08)',
          'transparent',
          'rgba(255,255,255,0.04)',
        ]}
        locations={[0, 0.3, 0.6, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Glass border */}
      <View style={{
        ...StyleSheet.absoluteFillObject,
        borderRadius,
        borderWidth: 1.5,
        borderColor: 'rgba(255,255,255,0.18)',
        borderTopColor: 'rgba(255,255,255,0.40)',
        borderBottomColor: 'rgba(255,255,255,0.04)',
      }} pointerEvents="none" />
      {children}
    </View>
  </View>
);
