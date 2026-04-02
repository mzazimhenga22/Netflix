import React from 'react';
import { requireNativeComponent, ViewProps } from 'react-native';

interface PhoneRowNativeProps extends ViewProps {
  data: {
    id: string;
    title: string;
    imageUrl: string;
    type?: string;
  }[];
  variant?: 'poster' | 'landscape' | 'square';
  onSelect?: (event: { nativeEvent: { id: string; mediaType: string } }) => void;
}

export const PhoneRowNativeComponent = requireNativeComponent<PhoneRowNativeProps>('PhoneRowView');

export const PhoneRowNative = (props: Omit<PhoneRowNativeProps, 'onSelect'> & { onSelect?: (id: string, type: string) => void }) => {
  return (
    <PhoneRowNativeComponent 
      {...props} 
      onSelect={(e) => {
        if (props.onSelect) {
          props.onSelect(e.nativeEvent.id, e.nativeEvent.mediaType);
        }
      }}
    />
  );
};
