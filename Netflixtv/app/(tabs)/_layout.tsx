import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import TvTopNav from '../../components/TvTopNav';
import { usePageColor } from '../../context/PageColorContext';
import { TvFocusBridgeProvider } from '../../context/TvFocusBridgeContext';

export const TV_TOP_NAV_HEIGHT = 80;
export const TV_TOP_NAV_TOP_PADDING = 10;
export const TV_TOP_NAV_CONTENT_OFFSET = 18;
export const TV_TOP_NAV_TOTAL_OFFSET = TV_TOP_NAV_HEIGHT + TV_TOP_NAV_TOP_PADDING + TV_TOP_NAV_CONTENT_OFFSET;

export default function TabLayout() {
  return <TabLayoutContent />;
}

function TabLayoutContent() {
  const { pageColor } = usePageColor();

  const animatedStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: withTiming(pageColor, { duration: 800 }),
    };
  });

  return (
    <TvFocusBridgeProvider>
      <Animated.View style={[styles.container, animatedStyle]}>
        <LinearGradient
          colors={[`${pageColor}E6`, `${pageColor}66`, 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.navAura}
          pointerEvents="none"
        />

        <View style={styles.content}>
          <Tabs
            tabBar={() => null}
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: 'transparent' },
              animation: 'fade',
            }}
          />
        </View>

        <View style={styles.navWrapper}>
          <TvTopNav />
        </View>
      </Animated.View>
    </TvFocusBridgeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    width: '100%',
    paddingTop: TV_TOP_NAV_TOTAL_OFFSET,
  },
  navWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  navAura: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    zIndex: 900,
  },
});
