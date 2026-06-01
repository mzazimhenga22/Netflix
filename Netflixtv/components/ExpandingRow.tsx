import React, { forwardRef, useMemo } from 'react';
import { requireNativeComponent, ViewProps, NativeSyntheticEvent, Alert } from 'react-native';
import { router } from 'expo-router';
import { isTitleLockedForSubscription } from '../services/contentAccess';
import { useProfile } from '../context/ProfileContext';

interface Movie {
  id: string | number;
  title?: string;
  name?: string;
  poster_path?: string;
  backdrop_path?: string;
  overview?: string;
  _progress?: number; // 0-1 progress for Continue Watching
  [key: string]: any;
}

interface ItemEvent {
  movie: string;
}

interface ExpandingRowProps extends ViewProps {
  title?: string;
  content: Movie[];
  focusedStreamUrl?: string;
  focusedStreamHeaders?: string;
  showRank?: boolean;
  preferredMovieId?: string;
  focusRequestToken?: number;
  onItemFocus?: (movie: Movie) => void;
  onItemPress?: (movie: Movie) => void;
}

interface NativeRowProps extends ViewProps {
  title?: string;
  content?: string;
  focusedStreamUrl?: string;
  focusedStreamHeaders?: string;
  showRank?: boolean;
  preferredMovieId?: string;
  focusRequestToken?: number;
  onItemFocus?: (event: NativeSyntheticEvent<ItemEvent>) => void;
  onItemPress?: (event: NativeSyntheticEvent<ItemEvent>) => void;
}

const TvRow = requireNativeComponent<NativeRowProps>('TvRow');

const ExpandingRow = forwardRef<any, ExpandingRowProps>(function ExpandingRow({
  title, content, focusedStreamUrl, focusedStreamHeaders,
  showRank, preferredMovieId, focusRequestToken, onItemFocus, onItemPress, style
}, ref) {
  // Use centralized subscription from ProfileContext instead of per-row listeners.
  // Previously each ExpandingRow created its own Firestore onSnapshot — on the Home
  // screen with 17 rows, that was 17 redundant listeners for the same document.
  const { subscriptionStatus } = useProfile();

  const jsonContent = useMemo(() => {
    const processedContent = content.map(item => {
      const isLocked = isTitleLockedForSubscription(item.id, subscriptionStatus);
      return { ...item, isLocked };
    });
    return JSON.stringify(processedContent);
  }, [content, subscriptionStatus]);

  const handleFocus = (event: NativeSyntheticEvent<ItemEvent>) => {
    if (onItemFocus) {
      try {
        const movie = JSON.parse(event.nativeEvent.movie);
        onItemFocus(movie);
      } catch (e) {
        console.error('Failed to parse focus event movie:', e);
      }
    }
  };

  const handlePress = (event: NativeSyntheticEvent<ItemEvent>) => {
    try {
      const movie = JSON.parse(event.nativeEvent.movie);
      if (movie.isLocked) {
        Alert.alert(
          'Upgrade Required',
          'This content is locked on the Free Plan. Upgrade your subscription to unlock all titles.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: '⬆ Upgrade Now',
              onPress: () => router.push('/upgrade' as any),
            },
          ]
        );
        return;
      }
      if (onItemPress) {
        onItemPress(movie);
      }
    } catch (e) {
      console.error('Failed to parse press event movie:', e);
    }
  };

  return (
    <TvRow
      ref={ref}
      title={title}
      content={jsonContent}
      focusedStreamUrl={focusedStreamUrl}
      focusedStreamHeaders={focusedStreamHeaders}
      showRank={showRank}
      preferredMovieId={preferredMovieId}
      focusRequestToken={focusRequestToken}
      onItemFocus={handleFocus}
      onItemPress={handlePress}
      style={[{ width: '100%', height: 420 }, style]}
    />
  );
});

export default React.memo(ExpandingRow);
