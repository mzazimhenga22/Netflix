import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  initializeAuth, 
} from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

// Synchronous require for React Native persistence as per project memory
const getReactNativePersistence = Platform.OS !== 'web' 
  ? require('firebase/auth').getReactNativePersistence 
  : null;

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB4GOl2RKNTna6anAJKkLjr43A_F4Vv1yE",
  authDomain: "movieflixreactnative.firebaseapp.com",
  projectId: "movieflixreactnative",
  storageBucket: "movieflixreactnative.firebasestorage.app",
  messagingSenderId: "792382812631",
  appId: "1:792382812631:web:f7cf50db59d6f06db5db92",
  measurementId: "G-1JFSNMPBNP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with persistence for React Native
let auth: ReturnType<typeof getAuth>;
if (Platform.OS !== 'web' && getReactNativePersistence) {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} else {
  auth = getAuth(app);
}

// Initialize Firestore with forced long polling for stability in mobile environments
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

const storage = getStorage(app);

export { app, auth, db, storage };
