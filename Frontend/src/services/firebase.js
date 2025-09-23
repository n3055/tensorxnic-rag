// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCWsuymXvSuXlrn1HLXVkjr-Ps_45S6C6k",
    authDomain: "ragflow-909e7.firebaseapp.com",
    projectId: "ragflow-909e7",
    storageBucket: "ragflow-909e7.firebasestorage.app",
    messagingSenderId: "651569300020",
    appId: "1:651569300020:web:a9f80bc75833c6c5cb0061",
    measurementId: "G-C08BWQJWDY"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth=getAuth(app);
const firestore = getFirestore(app);

export {app,auth, firestore };