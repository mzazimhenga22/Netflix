import React, { useState, useEffect } from 'react';
import { requireNativeComponent, ViewProps, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SubscriptionService } from '../services/SubscriptionService';
import { isContentLockedForFreePlan } from '../services/AccessControl';

interface PhoneRowNativeProps extends ViewProps {
  data: {
    id: string;
    title: string;
    imageUrl: string;
    type?: string;
    isLocked?: boolean;
  }[];
  variant?: 'poster' | 'landscape' | 'square';
  onSelect?: (event: { nativeEvent: { id: string; mediaType: string } }) => void;
  onLongPress?: (event: { nativeEvent: { id: string; mediaType: string } }) => void;
}

export const PhoneRowNativeComponent = requireNativeComponent<PhoneRowNativeProps>('PhoneRowView');

export const PhoneRowNative = (props: Omit<PhoneRowNativeProps, 'onSelect' | 'onLongPress'> & { onSelect?: (id: string, type: string) => void; onLongPress?: (id: string, type: string) => void }) => {
  const router = useRouter();
  const [isFreePlan, setIsFreePlan] = useState(false);

  useEffect(() => {
    const unsub = SubscriptionService.listenToSubscription((sub) => {
      setIsFreePlan(sub.status !== 'active');
    });
    return () => unsub();
  }, []);

  const processData = (data: any[]) => {
    if (!data) return [];
    return data.map(item => {
      const isLocked = isContentLockedForFreePlan(item.id, isFreePlan);
      return { ...item, isLocked };
    });
  };

  const handleSelect = (id: string, type: string) => {
    const isLocked = isContentLockedForFreePlan(id, isFreePlan);
    
    if (isLocked) {
      Alert.alert(
        'Upgrade Required',
        'This content is locked on the Free Plan. Upgrade your subscription to watch.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/subscription') }
        ]
      );
      return;
    }
    if (props.onSelect) {
      props.onSelect(id, type);
    }
  };

  const handleLongPress = (id: string, type: string) => {
    const isLocked = isContentLockedForFreePlan(id, isFreePlan);
    if (isLocked) return; // Prevent long press on locked items
    
    if (props.onLongPress) {
      props.onLongPress(id, type);
    }
  };

  return (
    <PhoneRowNativeComponent 
      {...props} 
      data={processData(props.data)}
      onSelect={(e) => handleSelect(e.nativeEvent.id, e.nativeEvent.mediaType)}
      onLongPress={(e) => handleLongPress(e.nativeEvent.id, e.nativeEvent.mediaType)}
    />
  );
};
