// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
const analytics = getAnalytics(app);