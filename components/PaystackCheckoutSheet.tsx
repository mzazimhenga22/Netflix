import React, { useCallback, useMemo, forwardRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { WebView } from 'react-native-webview';

interface PaystackCheckoutSheetProps {
  checkoutUrl: string | null;
  onSuccess: () => void;
  onClose: () => void;
}

export const PaystackCheckoutSheet = forwardRef<BottomSheetModal, PaystackCheckoutSheetProps>(
  ({ checkoutUrl, onSuccess, onClose }, ref) => {
    // Snap points for 3/4 screen height
    const snapPoints = useMemo(() => ['75%', '90%'], []);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.7}
        />
      ),
      []
    );

    const handleSheetChanges = useCallback((index: number) => {
      if (index === -1) {
        onClose();
      }
    }, [onClose]);

    const handleNavigationStateChange = (navState: any) => {
      // Paystack success detection
      if (navState.url && (navState.url.includes('status=success') || navState.url.includes('trxref='))) {
        onSuccess();
      }
    };

    return (
      <BottomSheetModal
        ref={ref}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.indicator}
      >
        <View style={styles.container}>
          {checkoutUrl ? (
            <WebView
              source={{ uri: checkoutUrl }}
              style={styles.webview}
              onNavigationStateChange={handleNavigationStateChange}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#E50914" />
                </View>
              )}
            />
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#E50914" />
            </View>
          )}
        </View>
      </BottomSheetModal>
    );
  }
);

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  indicator: {
    backgroundColor: '#333',
    width: 40,
  },
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  }
});
