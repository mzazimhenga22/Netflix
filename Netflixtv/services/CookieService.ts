import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { NativeModules } from "react-native";

const COOKIE_DOC_PATH = "config/netmirror";

export interface NetMirrorCookies {
  net22Cookie: string;
  net52Cookie: string;
  updatedAt?: number;
}

/**
 * Service to manage NetMirror cookies via Firebase Firestore.
 * This allows real-time updates to the app without rebuilding the APK.
 * 
 * PERMANENT SOLUTION:
 *   1. On app start → syncCookies() from Firestore (fast)
 *   2. On Firestore update → subscribeToUpdates() injects in real-time
 *   3. On cookie expiry/poison → refreshCookiesFromDevice() self-heals
 *      by opening hidden WebViews to net22/net52, extracting fresh cookies,
 *      then pushing them to Firestore for all devices
 */
export const CookieService = {
  /**
   * Fetches cookies once and injects them into the native module.
   */
  async syncCookies(): Promise<boolean> {
    try {
      const docRef = doc(db, COOKIE_DOC_PATH);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as NetMirrorCookies;
        return await this.injectCookies(data);
      }
      console.warn("[CookieService] No cookies found in Firestore at", COOKIE_DOC_PATH);
      return false;
    } catch (error) {
      console.error("[CookieService] Sync failed:", error);
      return false;
    }
  },

  /**
   * Listens for real-time cookie updates from Firestore.
   * Useful if you update cookies while the app is running.
   */
  subscribeToUpdates(callback?: (data: NetMirrorCookies) => void) {
    const docRef = doc(db, COOKIE_DOC_PATH);
    return onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as NetMirrorCookies;
        this.injectCookies(data);
        if (callback) callback(data);
      }
    });
  },

  /**
   * Utility to update cookies in Firestore (e.g., from a management script).
   */
  async updateCookies(cookies: Partial<NetMirrorCookies>): Promise<void> {
    const docRef = doc(db, COOKIE_DOC_PATH);
    await setDoc(docRef, {
      ...cookies,
      updatedAt: Date.now(),
    }, { merge: true });
    console.log("[CookieService] Firestore updated with fresh cookies");
  },

  /**
   * 🔄 SELF-HEALING: Opens hidden WebViews on the device to net22.cc and net52.cc,
   * extracts fresh session cookies from Android's CookieManager, injects them
   * into the native module, and pushes them to Firestore for all other devices.
   * 
   * Call this when you detect expired/poisoned cookies (e.g., 220884 errors).
   */
  async refreshCookiesFromDevice(): Promise<boolean> {
    const { TvNativeModule } = NativeModules;
    if (!TvNativeModule?.refreshNetMirrorCookies) {
      console.warn("[CookieService] refreshNetMirrorCookies not available on this platform");
      return false;
    }

    try {
      console.log("[CookieService] 🔄 Starting self-healing cookie refresh...");
      const result = await TvNativeModule.refreshNetMirrorCookies();
      
      if (result?.success) {
        console.log("[CookieService] ✅ Self-healing succeeded!");
        
        // Push fresh cookies to Firestore so ALL devices get them
        const updates: Partial<NetMirrorCookies> = {};
        if (result.net22Cookie) {
          updates.net22Cookie = result.net22Cookie;
          console.log("[CookieService] Net22: " + result.net22Cookie.substring(0, 50) + "...");
        }
        if (result.net52Cookie) {
          updates.net52Cookie = result.net52Cookie;
          console.log("[CookieService] Net52: " + result.net52Cookie.substring(0, 50) + "...");
        }
        
        if (Object.keys(updates).length > 0) {
          await this.updateCookies(updates);
          console.log("[CookieService] ✅ Fresh cookies pushed to Firestore for all devices");
        }
        return true;
      } else {
        console.warn("[CookieService] Self-healing returned no cookies");
        return false;
      }
    } catch (error) {
      console.error("[CookieService] 🔄 Self-healing failed:", error);
      return false;
    }
  },

  /**
   * Internal helper to talk to the Native Module.
   */
  async injectCookies(data: NetMirrorCookies): Promise<boolean> {
    const { TvNativeModule } = NativeModules;
    if (TvNativeModule?.setNetMirrorCookies) {
      try {
        await TvNativeModule.setNetMirrorCookies(
          data.net22Cookie || "",
          data.net52Cookie || ""
        );
        console.log("[CookieService] Native Module successfully updated with Firestore cookies");
        return true;
      } catch (e) {
        console.error("[CookieService] Native injection failed:", e);
      }
    } else {
      console.warn("[CookieService] Native module setNetMirrorCookies not found");
    }
    return false;
  }
};
