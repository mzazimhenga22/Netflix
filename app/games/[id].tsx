import React from 'react';
import { View, StyleSheet, StatusBar, requireNativeComponent, ViewProps, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { GameService } from '../../services/GameService';

interface GameDetailsNativeViewProps extends ViewProps {
  gameData?: {
    id: string;
    title: string;
    subtitle: string;
    description: string;
    heroUrl: string;
    posterUrl: string;
  };
  onBackClick?: (event: any) => void;
}

const GameDetailsNativeView = requireNativeComponent<GameDetailsNativeViewProps>('GameDetailsNativeView');

export default function GameDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [gameData, setGameData] = React.useState<GameDetailsNativeViewProps['gameData']>();
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        const details = await GameService.getGameDetails(String(id));
        if (mounted) {
          setGameData(details);
        }
      } catch (error) {
        console.warn('[GameDetailsScreen] Failed to load game details:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    if (id) {
      load();
    }
    return () => {
      mounted = false;
    };
  }, [id]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {loading && !gameData ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      ) : (
        <GameDetailsNativeView 
          style={StyleSheet.absoluteFill}
          gameData={gameData}
          onBackClick={() => router.back()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
});
