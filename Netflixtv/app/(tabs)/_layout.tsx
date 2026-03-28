import { View, StyleSheet } from 'react-native';
import { Slot } from 'expo-router';
import TvTopNav from '../../components/TvTopNav';

export default function TabLayout() {
  return (
    <View style={styles.container}>
      {/* Top Navigation for TV 2025 Layout — in-flow for focus traversal */}
      <TvTopNav />
      
      {/* Main Screen Content — overlaps nav via negative margin for visual effect */}
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    marginTop: -80, // Overlap content behind the transparent nav bar
  }
});
