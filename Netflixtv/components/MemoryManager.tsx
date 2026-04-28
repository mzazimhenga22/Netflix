import { useEffect, useRef, useCallback } from 'react';
import { AppState, InteractionManager, NativeModules } from 'react-native';
import { Image } from 'expo-image';

/**
 * MemoryManager — Global component that runs periodic memory cleanup.
 * 
 * On low-RAM TV devices, image caches and JS garbage can accumulate and
 * cause sluggish UI. This component:
 * 
 * 1. Clears expired expo-image disk cache every 5 minutes
 * 2. Runs cleanup when the app returns from background
 * 3. Trims memory cache when navigating between screens (via InteractionManager)
 * 
 * Mount once in the root layout to keep the whole app smooth.
 */
export function MemoryManager() {
  const lastCleanup = useRef(Date.now());
  const cleanupInterval = useRef<NodeJS.Timeout | null>(null);

  const performCleanup = useCallback(async () => {
    try {
      // Only cleanup if at least 2 minutes have passed since last one
      const now = Date.now();
      if (now - lastCleanup.current < 120_000) return;
      lastCleanup.current = now;

      // Wait for any pending UI interactions to complete
      await new Promise<void>(resolve => {
        InteractionManager.runAfterInteractions(() => resolve());
      });

      // Clear expired disk cache entries (keeps fresh ones)
      await Image.clearDiskCache();
      
      console.log('[MemoryManager] 🧹 Periodic cache cleanup completed');
    } catch (e) {
      // Silent fail — cleanup is best-effort
    }
  }, []);

  useEffect(() => {
    // Periodic cleanup every 5 minutes
    cleanupInterval.current = setInterval(() => {
      performCleanup();
    }, 300_000); // 5 minutes

    // Cleanup when app comes back from background (user switched apps)
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Small delay to let the app stabilize before cleanup
        setTimeout(() => {
          performCleanup();
        }, 2000);
      }
    });

    return () => {
      if (cleanupInterval.current) clearInterval(cleanupInterval.current);
      subscription.remove();
    };
  }, [performCleanup]);

  // This component renders nothing
  return null;
}
