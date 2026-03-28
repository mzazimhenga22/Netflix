import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  initializeAuth, 
  getReactNativePersistence 
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

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
let auth;
if (Platform.OS !== 'web') {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} else {
  auth = getAuth(app);
}

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
