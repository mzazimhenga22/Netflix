import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Modal, Pressable, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

interface PaystackCheckoutModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

export interface PaystackCheckoutModalRef {
  present: (url: string) => void;
  dismiss: () => void;
}

export const PaystackCheckoutModal = forwardRef<PaystackCheckoutModalRef, PaystackCheckoutModalProps>(
  ({ onSuccess, onClose }, ref) => {
    const [visible, setVisible] = useState(false);
    const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      present: (url: string) => {
        setCheckoutUrl(url);
        setVisible(true);
      },
      dismiss: () => {
        setVisible(false);
        setCheckoutUrl(null);
      }
    }));

    const handleNavigationStateChange = (navState: any) => {
      // Paystack success detection
      if (navState.url && (navState.url.includes('status=success') || navState.url.includes('trxref='))) {
        onSuccess();
      }
    };

    const handleClose = () => {
      setVisible(false);
      setCheckoutUrl(null);
      onClose();
    };

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
      >
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="white" />
            </Pressable>
          </View>
          
          <View style={styles.webviewContainer}>
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
        </SafeAreaView>
      </Modal>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 15,
    backgroundColor: '#121212',
  },
  closeButton: {
    padding: 5,
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
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
