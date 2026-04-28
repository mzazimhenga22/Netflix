import React, { forwardRef, useMemo } from 'react';
import { requireNativeComponent, ViewProps, NativeSyntheticEvent } from 'react-native';

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
  const [isFreePlan, setIsFreePlan] = React.useState(false);

  React.useEffect(() => {
    const { SubscriptionService } = require('../services/SubscriptionService');
    const unsub = SubscriptionService.listenToSubscription((sub: any) => {
      setIsFreePlan(sub.status !== 'active');
    });
    return () => unsub();
  }, []);

  const jsonContent = useMemo(() => {
    const processedContent = content.map(item => {
      const hash = String(item.id).split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
      const isLocked = isFreePlan && (hash % 3 === 0);
      return { ...item, isLocked };
    });
    return JSON.stringify(processedContent);
  }, [content, isFreePlan]);

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
        const { Alert } = require('react-native');
        Alert.alert(
          'Upgrade Required',
          'This content is locked on the Free Plan. Scan the QR code on the main screen to upgrade.'
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
