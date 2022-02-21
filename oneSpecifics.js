import ReactDOM from 'react-dom';

//Firebase Imports
// import {doc, collection, addDoc, setDoc, getDoc, deleteDoc, getDocs, onSnapshot} from "firebase/firestore";

//Emotion Imports
import {css} from '@emotion/css';

try {var firestore = await import('firebase/firestore');}
catch (warning) {
    // console.warn("No Firestore module imported. If this is intentional, please disregard this warning: ", warning)
}

export const ONESPECIFICS = {
	os: 'web', 
	css: css, 
	systemLanguage: (window.navigator.userLanguage || window.navigator.language || 'en').substring(0, 2),
	firestore: firestore
};
