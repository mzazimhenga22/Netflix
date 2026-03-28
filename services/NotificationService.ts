import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications are handled when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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
        date,
      },
      identifier: `reminder_${id}` // unique ID so we can cancel it later
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
}
