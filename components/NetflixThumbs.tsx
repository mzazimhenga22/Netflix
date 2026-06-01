import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  color?: string;
  size?: number;
  filled?: boolean;
}

export const ThumbDownIcon = ({ color = 'white', size = 24, filled = false }: IconProps) => (
  <MaterialCommunityIcons 
    name={filled ? 'thumb-down' : 'thumb-down-outline'} 
    size={size} 
    color={color} 
  />
);

export const ThumbUpIcon = ({ color = 'white', size = 24, filled = false }: IconProps) => (
  <MaterialCommunityIcons 
    name={filled ? 'thumb-up' : 'thumb-up-outline'} 
    size={size} 
    color={color} 
  />
);

export const DoubleThumbUpIcon = ({ color = 'white', size = 24, filled = false }: IconProps) => {
  return (
    <View style={{ width: size * 1.3, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: size * 1.3, height: size, position: 'relative' }}>
        {/* Background thumb (offset right and up, lower opacity) */}
        <MaterialCommunityIcons
          name={filled ? 'thumb-up' : 'thumb-up-outline'}
          size={size}
          color={color}
          style={{
            position: 'absolute',
            right: 0,
            top: -size * 0.12,
            opacity: 0.55,
          }}
        />
        {/* Mask shape to cover the background lines intersecting the foreground thumb */}
        <MaterialCommunityIcons
          name="thumb-up"
          size={size}
          color="#141414" // matches overlay pill background
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
          }}
        />
        {/* Foreground thumb */}
        <MaterialCommunityIcons
          name={filled ? 'thumb-up' : 'thumb-up-outline'}
          size={size}
          color={color}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
          }}
        />
      </View>
    </View>
  );
};

export const NetflixDownloadIcon = ({ color = 'white', size = 22, style }: IconProps & { style?: any }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
    <Path
      d="M12 3v13M7 11.5l5 5 5-5"
      stroke={color}
      strokeWidth={2.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Path
      d="M4 20h16"
      stroke={color}
      strokeWidth={2.3}
      strokeLinecap="round"
    />
  </Svg>
);
