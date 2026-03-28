import React from 'react';
import Svg, { Path, G, Rect } from 'react-native-svg';

interface IconProps {
  color?: string;
  size?: number;
}

export const ThumbDownIcon = ({ color = 'white', size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h5v11h-5" />
  </Svg>
);

export const ThumbUpIcon = ({ color = 'white', size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H2V11h5" />
  </Svg>
);

export const DoubleThumbUpIcon = ({ color = 'white', size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {/* First Thumb (Background) */}
    <G opacity={0.6} transform="translate(6, 0)">
      <Path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H2V11h5" />
    </G>
    {/* Second Thumb (Foreground) */}
    <G transform="translate(-2, 2)">
      <Rect x="1" y="10" width="22" height="13" fill="black" opacity={0.8} stroke="none" />
      <Path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H2V11h5" />
    </G>
  </Svg>
);
