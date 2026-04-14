import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure how notifications are handled when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface NetflixNotification {
  id: string;
  title: string;
  desc: string;
  date: string;
  image?: string;
  type: string;
  isRead: boolean;
}

const getNotificationsKey = (profileId: string) => `notifications_${profileId}`;

export class NotificationService {
  /**
   * Permissions: Always request before scheduling.
   */
  static async requestPermissions() {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    // Android-specific channel setup
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return finalStatus === 'granted';
  }

  /**
   * Scheduled Alerts: For upcoming movie releases.
   */
  static async scheduleReleaseReminder(id: string, title: string, releaseDate: string) {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return null;

    // Parse release date (TMDB format: YYYY-MM-DD or similar)
    const date = new Date(releaseDate);
    
    // Schedule for 9:00 AM on the release day
    date.setHours(9, 0, 0, 0);

    // If release is today or in the past, don't schedule an "upcoming" alert
    if (date.getTime() < Date.now()) {
        console.log(`[NotificationService] Release date ${releaseDate} is in the past, skipping reminder.`);
        return null;
    }

    console.log(`[NotificationService] Scheduling reminder for ${title} on ${date.toDateString()}`);

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "🍿 Now on Netflix!",
        body: `${title} is now available to watch.`,
        data: { id, type: 'release' },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
      },
    });
  }

  static async cancelReleaseReminder(id: string) {
    await Notifications.cancelScheduledNotificationAsync(`reminder_${id}`);
    console.log(`[NotificationService] Canceled reminder for ${id}`);
  }

  /**
   * Immediate Alerts: For download completion or failures.
   */
  static async notifyDownloadComplete(title: string) {
    await this.requestPermissions();
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "📥 Download Complete",
        body: `${title} is ready to watch offline.`,
        sound: true,
        priority: 'high',
      },
      trigger: null, // immediate
    });
  }

  static async notifyDownloadFailed(title: string) {
    await this.requestPermissions();
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: "❌ Download Failed",
        body: `Something went wrong downloading ${title}.`,
        sound: true,
      },
      trigger: null,
    });
  }

  // Local in-app notifications feed
  static subscribeToNotifications(profileId: string, cb: (items: NetflixNotification[]) => void) {
    let active = true;

    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(getNotificationsKey(profileId));
        const items: NetflixNotification[] = raw ? JSON.parse(raw) : [];
        if (active) cb(items);
      } catch {
        if (active) cb([]);
      }
    };

    load();
    const interval = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }

  static async seedMockNotifications(profileId: string) {
    const key = getNotificationsKey(profileId);
    const raw = await AsyncStorage.getItem(key);
    const existing: NetflixNotification[] = raw ? JSON.parse(raw) : [];
    if (existing.length > 0) return;

    const now = new Date();
    const mock: NetflixNotification[] = [
      {
        id: `n_${Date.now()}_1`,
        title: 'New Episode Available',
        desc: 'A new episode in your continue watching list is out now.',
        date: now.toLocaleDateString(),
        type: 'New',
        isRead: false,
      },
      {
        id: `n_${Date.now()}_2`,
        title: 'Download Complete',
        desc: 'Your recent download is ready for offline viewing.',
        date: now.toLocaleDateString(),
        type: 'Downloads',
        isRead: false,
      },
    ];
    await AsyncStorage.setItem(key, JSON.stringify(mock));
  }

  static async markAsRead(profileId: string, id: string) {
    const key = getNotificationsKey(profileId);
    const raw = await AsyncStorage.getItem(key);
    const items: NetflixNotification[] = raw ? JSON.parse(raw) : [];
    const updated = items.map(item => item.id === id ? { ...item, isRead: true } : item);
    await AsyncStorage.setItem(key, JSON.stringify(updated));
  }
}
