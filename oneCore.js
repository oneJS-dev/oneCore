/**
 * A functional programming oriented Javascript module. It allows to write your web app or native app using just plain functional vanilla JS.
 * This module provides optional features such as state management, routing, database access/storage and style theming.
 * Internally it leverages the power of React, Emotion and Firestore to provide this functionality.
 * @module oneCore
 */

//React Imports. Currently React does not provide ESM modules but UMD
import React from 'react';

//Web vs Native specific differences
import {ONESPECIFICS} from './oneSpecifics';

//Conditionally import Firestore
try {         
    if(ONESPECIFICS.os === 'android' || ONESPECIFICS.os === 'ios')
        var {doc, collection, addDoc, setDoc, getDoc, deleteDoc, getDocs, onSnapshot} = require('firebase/firestore');
    else if(ONESPECIFICS.os === 'web' && ONESPECIFICS.firestore) {
       var {doc, collection, addDoc, setDoc, getDoc, deleteDoc, getDocs, onSnapshot} = ONESPECIFICS.firestore;
    }
}
catch (warning) {
    console.warn("No Firestore module imported. If this is intentional, please disregard this warning: ", warning)
}
// export const fire = firebaseImports;
// console.log(fire);
// try {
    
//     // do stuff
// } catch (warning) {
//     // handleErr(ex);
// }

/**
* @description All the module internal global variables are properties of the ONEJS object. 
* @type {Object}
*/
var ONEJS = {
    //Database Module
    firestore: {},             //The firestore database to perform read/write operations
    idb: {},                   //The indexedDB database to perform read/write operations

    //State Module
    reactState: [],            //All the React variables part of the 'useState' hook
    reactSetState: [],         //All the React methods to set the state part of the 'useState' hook
    currentState: {},          //Current state of the app, containing the value of all state variables
    stateHistory: [],          //The history of modifications performed to the state
    stateHistorySize: 10,      //Maximum length for the stateHistory array. Limits the amout of modifications stored
    stateHistoryPosition: 0,   //Newest (current) state position is 0. Rewinding the state this value can be changed 

    //Components Module    
    memoizedComponents: [],    //React component structure is stored in this array using the name as index
    emotionCSSClasses: [],     //CSS classes compiled by emotion to avoid calling css() method on every state update

    //App Module
    appName: '',               //Name of the app. Used by indexedDB to avoid naming collisions
    appText: {},               //All the app texts to provide translation functionality
    os: window ? 'web' : (global ? 'native' : undefined),//Current operating system for the app
    theme: {default: {}},      //RN: Theme variable values for the different flavors
    style: {}, 
    iconGradients: {}
};


//=============================================================================
// LANGUAGE SETUP: All the app strings can be saved into a configuration
// object containing the different translations for the languages supported.
// The language module aims to simplify translation of the app when the user
// switches to a different language.
//=============================================================================

/** 
* @description Retrieves the user's local language based on the navigator configuration.
* @returns {String} Returns the user's local language.
*/
export const getLanguage = () => {
    const localLanguage = localStorage.getItem('oneLanguage'); //Maybe concatenate app name provided in app().
    const userLanguage = ONESPECIFICS.userLanguage;
    return localLanguage ?? userLanguage;
}
/** 
* @description Sets the language defined by the user.
* @param {String} languageISOCode - Chosen language in ISO format.
*/
export const setLanguage = (languageISOCode) => {
    localStorage.setItem('oneLanguage', languageISOCode);
}
/** 
* @description It is used to update the value of the language on user input change events.
* Use-case: Call function oninput or onchange events on the template.
* @param {Object} event - User event containing the target value to update the language.
* * @example
* ```javascript
* input({onchange: updateLanguage});//Everytime time the input changes updates the value of 'event' and therefore the language
* ```
*/
export const updateLanguage = (event) => {
    if(event?.target) setLanguage(event.target?.value);
}
/** 
* @description Reads the text for a certain language based on the text id. 
* Prerequisites: Define all the texts in a single object and provide it as the "text" parameter to the app() function.
* @param {String} id - The id of the text to be fetched.
* @param {String} [language=user's default language] - The id of the text to be fetched.
* @example
* App Function Text Object Example
* ```javascript
* appText = {title: 'My App',  home: {en: 'home', es: 'casa'}}
* ```
* @example
* Function Call
* ```javascript
* readText('home') //Return 'home' for 'en' and 'casa' for 'es'
* ```
* @returns {String} Returns the text string for the corresponding language.
* @todo  Create website to send JS object with text configuration: {home: 'home', button: 'your input'} and return {home: {en: 'home', es: 'casa'}, 
* button: {en: 'your input', es: 'su input'}}. Use a translator API.
*/
export const readText = (id, language=getLanguage()) => {
    if(!ONEJS.appText) {console.error('The text has not been setup in the app function.'); return;}
    if(!ONEJS.appText[id]) {console.error('No such id: ' + id); return;}
    if(language && !ONEJS.appText[id][language]) {console.error('No such language: ' + language); return;}

    if(typeof ONEJS.appText[id] === 'string') return ONEJS.appText[id];
    return ONEJS.appText[id][language];//TODO: If not retrieved for a certain language automatically translate
}

//=============================================================================
// ROUTING SETUP: Internal methods to provide routing functionality for web.
// Dynamic and declarative, just setup the url property of the View component
// in order to:
// 1. Toggle visibility: If the actual url matches the url visible property  
//                       the element is displayed. 
// 2. Toggle active:     If the actual url matches the url active property  
//                       the element is displayed.
// 3. Link routing:      The element changes the actual url to match the url
//                       link property.
// Example: 
// const template => [View({url: {visible: '/home'}})('Home Screen'),
//                    View({url: {link: '/home', active: 'home'}})([
//                    Button()('Redirect to home screen'))];
//=============================================================================

/** 
* @description Checks if the target url matches the actual page url.
* Principles: All url-s must start with '/' because all url-s are absolute.
* Naming: '*' represents any value for a given segment. At the end of the url, e.g.'/path/to/end/*' means any number of segments after
* Note: The page root has a url '/'. This can only be matched by target url '/' or '* /'
* Note: Actual url ignores anchors (root/home/#anchor/path === root/home)
* @param {String} url - The url to be compared with the actual url.
* @example
* Function Call for Actual Url = '/path/to/page'
* ```javascript
*   matchUrl('/* /* /page') //Matches
*   matchUrl('/* /to')      //Does not match
*   matchUrl('/* /to/*')    //Matches
* ```
* @returns {Boolean} Returns true if the target url matches the actual url, false otherwise.
*/
export const matchUrl = (url) => {
    if(!url) return false;
    //Filter added to remove the empty strings after split. E.g.: Root path is "/" and split converts to ['', '']. Filter turns into []
    const actualUrl = decodeURI(location.pathname + location.search).split('/').filter(Boolean); //this url will always start with '/'
    const targetUrl = url.split('/').filter(Boolean);
    if(targetUrl.length - actualUrl.length > 1 || (targetUrl.length - actualUrl.length === 1 && targetUrl[targetUrl.length-1] !== '*')) return false;
    //Return false if the target url does not match at any stage
    for (let i = 0; i < actualUrl.length; i++) {
        if(i === targetUrl.length - 1 && targetUrl === '*') return true;
        if(actualUrl[i] !== targetUrl[i] && targetUrl[i] !== '*') return false;
    }
    return true;
}

/** 
* @description If the url matches the current path, returns the value from the segment with ':'.
* Naming: '*' represents any value for a given segment. ':' represents the segment to extract the data from.
* Use case: Users can type any id in the url and retrieves the specific item from the database.
* @param {String} url - The url to extract data from.
* @example
* Function Call for Actual Url = '/path/to/page'
* ```javascript
    readUrlData('/* /: /page') //Returns 'to' (not 'to/page')
    readUrlData('/* /: ')      //Does not match, returns undefined
    readUrlData('/* /: /*')    //Returns 'to'
    readUrlData('/* /in/*')    //Does not match, returns undefined
* ```
* @returns {String} Returns the value from the segment with ':'.
*/
const readUrlData = url => {
    if(!matchUrl(url.replace(':', '*'))) return;
    const actualUrl = decodeURI(location.pathname + location.search).split('/').filter(Boolean);
    const targetUrl = url.split('/').filter(Boolean);
    for(let i = 0; i < targetUrl.length; i++) {
        if(targetUrl[i] === ':') return actualUrl[i];
    }
    return;
}

/** 
* @description Reads the current url to set the corresopnding state variable. Subscribes to url changes.
* Naming: '*' represents any value for a given segment. ':' represents the segment to extract the data from.
* Use case: Update the value of a state variable that uses url as source
* @param {String} url - The url to extract data from.
* @param {String} stateId - The state id where data will be stored.
* @example
* State Configuration:
* ```javascript
*   const state = {eventId: {source: {url: '/* /events/:'}}}
* ```
* Internal Function Call:
* ```javascript
*   //Actual url: '/path/events/event123'
*   readUrl('/* /events/:')('eventId'); //Sets eventId = 'event123'
* ```
*/
const readUrl = (url) => (stateId) => {
    write(stateId, readUrlData(url), 'url', 'update');
    window.addEventListener('urlChange',  (e) => { 
        write(stateId, readUrlData(url), 'url', 'update');
    }, false);
}

/** 
* @description Reads a database path with state variables '@stateId'. The '@stateId' variable holds the ID for the database item. Not used for url-s, in that case we can use the state variables directly.
* Use case: Return data from the database for a specific item. The @stateId variable should only be used at document level, even if it may work at collection level.
* Naming: '@stateId' represents the variable to be replaced with the value.
* Note: The function name says 'Path' rather than 'Url' since it reads database paths rather than the DOM http url.
* @param {String} path - The path to read @stateId from.
* @example
* ```javascript 
*   const state = {eventId: 'event123', myEvent: source{firestore: {'events/@eventId'}} }
*   readPathWithState('events/@eventId') //eventId = 'event123', Returns 'events/event123'
*   readPathWithState('events/@eventId') //eventId = undefined, Returns undefined
* ``` 
* @returns {String} Returns the path after replacing the '@stateId' with the corresponding value.
* @todo Discarded idea: Besides @stateId, we could also implement :, to combine and retrieve the value for both the state and url data. (Creates confusion, final decision is to only use state variables)
*/
const readPathWithState = (path) => {
    let finalPath = path;
    //Path Includes State Variable
    if(finalPath.includes('@')) {
        const stateId = readStateId(finalPath); 
        if(read(stateId) != null) finalPath = finalPath.replace('@' + stateId, read(stateId).toString());
        else return;//Returns undefined so that 'source/storage' functions avoid reading/writing from/to database
    }
    return finalPath;
}
/** 
* @description Reads the name (not the value) from the state variable in the path.
* Use case: Internal function to read the state id in a string. 
* Note: Only limited to one state variable per string.
* @param {String} path - The path to read state id name from.
* @example
* ```javascript 
*   readStateId('users/@userId');// returns 'userId'
*   readStateId('users/');// returns undefined
* ``` 
* @returns {String} Returns the name of the state variable in the path.
*/
const readStateId = (path) => {
    if(!path.includes('@')) return;//Returns undefined
    const splitPath = path.toString().split('@');//splitPath = ['users/', 'userId/other']//The second half is the one containing the variable name
    return splitPath[1].substring(0, splitPath[1].search('/') > 0 ? splitPath[1].search('/') : splitPath[1].length);//From start until next '/' is found or string end
}

//=============================================================================
// FIREBASE SETUP: This is an optional module that allows the user to work with
// the Firebase Firestore database in a declarative way.
// 1. Setup the firestore database in the index.js file
// const config = {apiKey: "---randomKey---", authDomain: "myApp.firebaseapp.com",
// const firebaseApp = initializeApp(config);//Initialize firebase      
// const firestoreDB = getFirestore();// Initialize Cloud Firestore after Firebase
// 2. Setup the state configuration to use firestore as the source or storge option
// const state = {events: {default: [], source: {firestore: 'events'}, 
//     storage: {firestore: 'events'}}, ...};
// 3. Intialize the app() function with the firestore database
// app({template: template, state: state, firestore:firestoreDB});
//
//=============================================================================

/** 
* @description Pull data from the firestore database on request. It can be a single document or full collection.
* Use case: Triggered by firestore read to pull data for dynamic paths (depending on the state)
* @param {String} path - The firestore path to read data from (even path: document, odd path: collection).
* @param {String} stateId - The state id of the variable that will be updated with the data from the database.
* @example
* ```javascript 
*   const state = {eventId: 'event123', myEvent: source{firestore: {'events/@eventId'}} }
*   firestoreGetDataOnce('events/@eventId')(myEvent);// If eventId = 'event123', sets myEvent = {obj} which is the database value for the path = 'events/event123'
* ``` 
*/
const firestoreGetDataOnce = async (path, stateId) => {
    if(!read(readStateId(path))) return; //If the state is not defined return undefined
    if(path.split('/').length % 2 === 0) {
        const docRef = doc(ONEJS.firestore, readPathWithState(path));
        try {
            const docSnap = await getDoc(docRef);
            if(docSnap.exists()) {write(stateId, docSnap.data(), 'firestore', 'update');} 
            else {console.error("No such document!");}//doc.data() will be undefined in this case
        }
        catch (error) {console.error("Error getting document:", error);}
    }
    else {
        const collRef = collection(ONEJS.firestore, readPathWithState(path));
        try {                    
            const collSnap = await getDocs(collRef);//doc.data() is never undefined for query doc snapshots
            const result = [];
            collSnap.forEach((doc) => {result.push({...{id:doc.id}, ...doc.data()})});//Adding the id to the result array for each document
            write(stateId, result, 'firestore', 'update');
        } catch (error) {console.error("Error reading snapshot: ", error);}                
    }         
}

/** 
* @description Reads a document or collection of documents from Firestore database and sets the corresponding state variable.
* Naming: Even number of segments in path for documents or even for collections (group of documents)
* @param {String} path - The firestore path to read data from.
* @param {String} stateId - The state id of the variable that will be updated with the data from the database.
* @param {String} context - The context that is requesting this data. This function writes the state using the 'firestore' context, this way read/write loops can be avoided
* @example
* Static Path Examples:
* ```javascript 
*    path = events           //Returns array of events []
*    path = events/event123  //Returns event object with id = event123 {}
* ```
* Dynamic Path Examples:
* ```javascript 
*   path = @collectionId    //Returns array of events []. This is not recommended for security reasons, state variables in the path should be at document level
*   path = events/@eventId  //Replaces @eventId (calling readPathWithState) with state variable value and returns event object
* ``` 
* @todo Discarded idea: Besides @stateId, we could also implement :, to combine and retrieve the value for both the state and url data. (Creates confusion as paths and urls are not the same)
*/
const firestoreRead = (path) => (stateId, context='') => {
    if(context === 'firestore') return;
    if(!path) return;
    else if(path.includes('@') && context === 'initialize') {//Subscribes for state changes during 'setupState' initialization
        window.addEventListener(readStateId(path) + 'stateChange',  async (e) => {firestoreGetDataOnce(path, stateId);}, false);//Called on state updates
        firestoreGetDataOnce(path, stateId);//Pulls data once for the first time
    }
    else if(context === 'initialize'){//Subscribe to firestore updates using 'onSnapshot'
        //If the path is even, Firestore DOCUMENT is retrieved
        if(path.split('/').length % 2 === 0) {
            try {const unsubscribe = onSnapshot(doc(ONEJS.firestore, path), (doc) => {write(stateId, doc.data(), 'firestore', 'update');});}
            catch (error) {console.error("Error reading snapshot: ", error);}
        }
        //If the path is odd, Firestore COLLECTION is retrieved (list of documents within a collection)
        else {
            try {
                const unsubscribe = onSnapshot(collection(ONEJS.firestore, path), (snapshot) => {
                    const result = [];
                    snapshot.forEach((doc) => {result.push({...{id:doc.id}, ...doc.data()})});  //Adding the id to the result array for each document
                    write(stateId, result, 'firestore', 'update'); //If storage is also set we will run into conflicts
                });
            } catch (error) {console.error("Error reading snapshot: ", error);}
        }
    } 
    else {  // Called for paths with state variables and stateId with source and storage. In these cases when the write function updates the stateId, since data
            // is not synced with 'onSnapshot', the 'source' function is called to pull the just stored data again from the database.
            // This is required since adding new data to the database generates a new id that needs to be retrieved for the app.
        firestoreGetDataOnce(path, stateId);
    }     
}

/** 
* @description Writes a document to Firestore database. For document paths, updates the document value. For collections, pushes document to collection.
* Naming: Even number of segments in path for documents or even for collections (group of documents)
* @param {String} path - The firestore path to store data to.
* @param {*} data - The data to be stored.
* @param {String} context - The context that is requesting the storage. The read function can request a write with 'firestore' context. 
* The write function will call the storage function. Thanks to context the firestoreWrite function exits, this way read/write loops can be avoided.
* @param {String} documentId - Optional for collections. If the document id is specified, rather than pushing a new document, the corresponding documentId document is updated.
* @example
* ```javascript 
*   path = events;  documentID = 'event123'  
*                            data = {event}; //Updates {event123} with {event}
*   path = events;           data = {event}; //Pushes {event} to [events] collection
*   path = events/event123;  data = {event}; //Updates {event123} with {event}
*   path = @collection       data = {event}; //Warning: Not a good pattern to use variables at collection level for security reasons. 
*                                            //Replaces @collection with state variable value and adds a new document to the collection.
* ```
*/
const firestoreWrite = (path) => async (data, context = '', documentId) => {
    if(context === 'firestore') return;//This means firestore has read a value and is updating the state, no need to write to the database 
    if(!path) return;
    const finalPath = documentId != null ? readPathWithState(path).concat('/', documentId.toString()) : readPathWithState(path);
    //If the path is even, modify the document
    if(finalPath.split('/').length % 2 === 0) {
        try {const docRef = await setDoc(doc(ONEJS.firestore, finalPath), {...{timestamp: new Date().getTime()}, ...data});}
        catch(error) {console.error("Error writing document: ", error);} 
    }
    //If the path is odd, push document to collection. The id is automatically generade by firestore in the database
    else {
        try {const docRef = await addDoc(collection(ONEJS.firestore, finalPath), {...{timestamp: new Date().getTime()}, ...data});}
        catch(error) {console.error("Error purshing to collection: ", error);}
    }
}
/** 
* @description Removes a document from the Firestore database. It can remove collections of documents but it is strongly not advised.
* Naming: Even number of segments in path for documents or even for collections (group of documents)
* @param {String} path - The firestore path to the document. Number of segments should be even. Warning: If the path is odd, it will clear the entire collection.
* @param {String} documentId - Optional for collections. If the document id is specified, the corresponding document with id equal to documentId will be removed.
* @example
* ```javascript 
*   path = events;           data = {event}; //Removes entire events collection. Not advised.
*   path = events/event123;  data = {event}; //Removes document with id 'event123'
*   path = events/@eventId;  data = {event}; //Replaces @eventId (calling readPathWithState) with state variable value and removes document
* ```
*/
const firestoreRemove = (path) => async (documentId) => {
    if(!path) return;
    const finalPath = documentId != null ? readPathWithState(path).concat('/', documentId.toString()) : readPathWithState(path);
    //If the path is even, remove the document
    if(finalPath.split('/').length % 2 === 0) {
        try {const docRef = await deleteDoc(doc(ONEJS.firestore, finalPath));}
        catch(error) {console.error("Error removing document: ", error);} 
    }
    //If the path is odd, delete entire collection
    else {
        //To delete an entire collection or subcollection in Cloud Firestore, 
        //retrieve all the documents within the collection or subcollection and delete them
        //Deleting collections from a Web client is not recommended.
        const collRef = collection(ONEJS.firestore, readPathWithState(path));
        try {                    
            const collSnap = await getDocs(collRef);
            collSnap.forEach(async docData => await deleteDoc(doc(ONEJS.firestore, finalPath + '/' + docData.id)));
        } catch (error) {console.error("Error reading snapshot: ", error);}  
    }    
}


//=============================================================================
// INDEXED DATABASE SETUP: This is an optional module that allows the user to work
// with the web-native indexedDB database in a declarative way.
// 1. Setup the state configuration to use firestore as the source or storge option
// const state = {events: {default: [], source: {indexedDB: 'events'}, 
//     storage: {indexedDB: 'events'}}, ...};
// 2. Intialize the app() function with the firestore database
// app({template: template, state: state});
//
//=============================================================================

/** 
* @description Reads document/collection from indexedDB API.
* Naming: 2 number of segments in path for documents or 1 for collections (group of documents). As opposed to firebase, there are no nested collections.
* Use-case: Online storage (Firestore) is oriented to store information from all users. Local storage aims to store information from current user only (e.g: Settings).
* References: 
* [Google Tutorial]{@link https://developers.google.com/web/ilt/pwa/working-with-indexeddb}
* [W3 Tutorial]{https://www.w3.org/TR/IndexedDB-2/}
* [Can I Use]{https://caniuse.com/#feat=indexeddb2}
* @param {String} path - The indexedDB path to the document or collection to be retrieved.
* @param {String} stateId - The id of the state variable that will store the retrieved data.
* @param {String} context - The context that is requesting this data. This function writes the state using the 'indexedDB' context, 
* it will exit if read is called again with 'indexedDB' context. This way read/write loops can be avoided

* @example
* Static Path Examples:
* ```javascript 
*    path = events           //Returns array of events []
*    path = events/event123  //Returns event object with id = event123 {}
* ```
* Dynamic Path Examples:
* ```javascript 
*   path = @collectionId    //Returns array of events []. This is not recommended for security reasons, state variables in the path should be at document level
*   path = events/@eventId  //Replaces @eventId (calling readPathWithState) with state variable value and returns event object
* ``` 
*/
const indexedDBRead = (path) => (stateId, context='') => {
    if(context === 'indexedDB') return;
    if(!path) return;
    if(path.includes('@') && context === 'initialize') {//Subscribes for state changes during 'setupState' initialization
        window.addEventListener(readStateId(path) + 'stateChange',  async (e) => {//Note: e.detail also contains the newState
            if(!read(readStateId(path))) return;//If the state is not defined return.
            const pathSegments = readPathWithState(path).split('/').filter(Boolean);
            try {
                const transaction = ONEJS.idb.transaction(pathSegments[0], 'readonly');
                const store = transaction.objectStore(pathSegments[0]);
                const request = pathSegments.length > 1 ? store.get(pathSegments[1]) : store.getAll();//Depending of path segments, read entire collection or specific document
                request.onsuccess = function(data) {write(stateId, request.result, 'indexedDB', 'update');};
                request.onerror = function(e) {console.error('Error: ', e.target.error.name);};
            } 
            catch(error) {console.error("Error getting document:", error);}
        }, false);
    }
    // As opposed to Firestore's 'onSnapshot' method, there is no option to observe changes in indexedDB. Therefore the 'read' function
    // is triggered everytime the 'write' function is called.
    const pathSegments = readPathWithState(path).split('/').filter(Boolean);
    try {
        const transaction = ONEJS.idb.transaction(pathSegments[0], 'readonly');
        const store = transaction.objectStore(pathSegments[0]);
        const request = pathSegments.length > 1 ? store.get(pathSegments[1]) : store.getAll();//Depending of path segments, read entire collection or specific document
        request.onsuccess = function(data) {write(stateId, request.result, 'indexedDB', 'update');};
        request.onerror = function(e) {console.error('Error: ', e.target.error.name);};
    }
    catch(error) {console.error("Error getting document:", error);}
} 
/** 
* @description Writes a document to indexedDB database. For document paths, updates the document value. For collections, pushes document to collection.
* Naming: 2 number of segments in path for documents or 1 for collections (group of documents). As opposed to firebase, there are no nested collections.
* @param {String} path - The indexedDB path to store data to.
* @param {*} data - The data to be stored.
* @param {String} context - The context that is requesting the storage. The read function can request a write with 'indexedDB' context. 
* The write function will call the storage function. Thanks to context the indexedDBWrite function exits, this way read/write loops can be avoided.
* @param {String} documentId - Optional for collections. If the document id is specified, rather than pushing a new document, the corresponding documentId document is updated.
* @example
* ```javascript 
*   path = events;  documentID = 'event123'  
*                            data = {event}; //Updates {event123} with {event}
*   path = events;           data = {event}; //Pushes {event} to [events] collection
*   path = events/event123;  data = {event}; //Updates {event123} with {event}
*   path = @collection       data = {event}; //Warning: Not a good pattern to use variables at collection level for security reasons. 
*                                            //Replaces @collection with state variable value and adds a new document to the collection.
*   path = events/@eventId;  data = {event}; //Replaces @eventId (calling readPathWithState) with state variable value and updates document with {event}
* ```
*/   
const indexedDBWrite = (path) => (data, context='', documentId) => {
    if(context === 'indexedDB') return;
    if(!path) return;
    const pathSegments = readPathWithState(path).split('/').filter(Boolean);
    if(documentId != null) {//Update specific document within collection 
        pathSegments[1] = documentId;
        data.id = documentId;
    }
    try {
        const transaction = ONEJS.idb.transaction(pathSegments[0], 'readwrite');
        const store = transaction.objectStore(pathSegments[0]);
        //Due to the { keyPath: "id", autoIncrement: true } configuration .put() function does not need the document id, it needs to be contained in the data object
        const request = pathSegments.length > 1 ? store.put(data) : store.add(data);//To add to collection or update document
        request.onerror = function(e) {console.error('Error: ', e.target.error.name);};
    } 
    catch(error) {console.error("Error writing document:", error);}
}
/** 
* @description Removes a document or collection of documents from the indexedDB database.
* Naming: 2 number of segments in path for documents or 1 for collections (group of documents). As opposed to firebase, there are no nested collections.
* Note: In this case, it is rather safe to clear entire collection as it is contained within the users memory and not a global database online as it is for Firestore.
* @param {String} path - The indexedDB path to the document. Number of segments should be even. Warning: If the path is odd, it will clear the entire collection.
* @param {String} documentId - Optional for collections. If the document id is specified, the corresponding document with id equal to documentId will be removed.
* @example
* ```javascript 
*   path = events;           //Removes entire events collection. Not advised.
*   path = events/event123;  //Removes document with id 'event123'
*   path = events/@eventId;  //Replaces @eventId (calling readPathWithState) with state variable value and removes document
* ```
*/
const indexedDBRemove = (path) => (documentId) => {
    if(!path) return;
    const pathSegments = readPathWithState(path).split('/').filter(Boolean);
    if(documentId != null) pathSegments[1] = parseInt(documentId);
    try {
        const transaction = ONEJS.idb.transaction(pathSegments[0], 'readwrite');
        const store = transaction.objectStore(pathSegments[0]);
        const request = pathSegments.length > 1 ? store.delete(parseInt(pathSegments[1])) : store.clear();//To remove entire collection or specific document
        request.onerror = function(e) {console.error('Error: ', e.target.error.name);};
    } 
    catch(error) {console.error("Error removing document:", error);}
}

//=============================================================================
// LOCAL STORAGE: This is an optional module that allows the user to work
// with the web-native localStorage database in a declarative way.
// localStorage is similar to sessionStorage, except that while localStorage data 
// has no expiration time, sessionStorage data gets cleared when the page session
// end. Data is internally stored in string format.
// 1. Setup the state configuration to use 'local' as the source or storge option
// const state = {userId: {default: '', source: {local: 'userId'}, 
//     storage: {local: 'userId'}}, ...};
// 2. Use the read and update functions to access the data and store a new value
// respectively
// const template = () => [Text()('User Id: ' + read('userId')),
//                         Input({type:'text', onInput: update('userId')})]              
//=============================================================================

/** 
* @description Reads document from localStorage API.
* Naming: It is a flat structure, there are no collections.
* Use-case: Online storage (Firestore) is oriented to store information from all users. Local storage aims to store information from current user only (e.g: Settings).
* References: 
* [W3 Tutorial]{https://www.w3.org/jsref/prop_win_localstorage.asp}
* @param {String} path - The indexedDB path to the document or collection to be retrieved.
* @param {String} stateId - The id of the state variable that will store the retrieved data.
* @example
* ```javascript 
*    path = userId //Returns the stored value for userId {id: '123', name: 'user'}
* ```
*/
const localStorageRead = (path) => (stateId) => {
    try {        
        const jsonValue = localStorage.getItem(path); //Note that variable paths are not accepted here. Virtually no use-case for this.
        if(jsonValue === null) return;              //The Web Storage Specification requires that .getItem() returns null for an unknown key
        const data = JSON.parse(jsonValue);           //Using JSON.parse and stringify() allows to store non-string data.
        write(stateId, data, 'localStorage', 'update');
    } 
    catch(error) {console.error("Error getting document:", error);}
}
/** 
* @description Writes a document to localStorage.
* Naming: It is a flat structure, there are no collections.
* @param {String} path - The localStorage path to store data to.
* @param {*} data - The data to be stored.
* @param {String} context - The context that is requesting the storage. The read function can request a write with 'local' context. 
* The write function will call the storage function. Thanks to context the localStorageWrite function exits, this way read/write loops can be avoided.
* @example
* ```javascript 
*   path = 'userData'; data = {id: '123', name: 'user'}; //Pushes {data} in 'userData' document
* ```
*/  
const localStorageWrite = (path) => (data, context ='') => {
    if(context === 'localStorage') return;
    try {
        const jsonData = JSON.stringify(data)
        localStorage.setItem(path, jsonData);
    } 
    catch (error) {console.error("Error setting document:", error);} 
}
/** 
* @description Removes a document from localStorage.
* Naming: It is a flat structure, there are no collections.
* @param {String} path - The localStorage path to the document.
* @example
* ```javascript 
*   path = userId; //Removes userId document
* ```
*/
const localStorageRemove = (path) => () => {
    try {
        localStorage.removeItem(path);
    } 
    catch(error) {console.error("Error removing document:", error);}
}

//=============================================================================
// NATIVE STORAGE: This is an optional module that allows the user to work
// with the React Native AsyncStorage database in a declarative way.
// Community Package: https://github.com/react-native-async-storage/async-storage.
// 1. Setup the state configuration to use 'local' as the source or storge option
// const state = {userId: {default: '', source: {local: 'userId'}, 
//     storage: {local: 'userId'}}, ...};
// 2. Use the read and update functions to access the data and store a new value
// respectively
// const template = () => [Text()('User Id: ' + read('userId')),
//                         Input({type:'text', onInput: update('userId')})]              
//=============================================================================
/** 
* @description Reads document from AsyncStorage API.
* Naming: It is a flat structure, there are no collections.
* Use-case: Online storage (Firestore) is oriented to store information from all users. Native storage aims to store information from current user only (e.g: Settings).
* References: 
* [Async Storage Docs]{https://react-native-async-storage.github.io/async-storage/}
* @param {String} path - The indexedDB path to the document or collection to be retrieved.
* @param {String} stateId - The id of the state variable that will store the retrieved data.
* @example
* ```javascript 
*    path = userId //Returns the stored value for userId {id: '123', name: 'user'}
* ```
*/
const nativeStorageRead = (path) => async (stateId) => {
    try { 
        const jsonValue = await ONESPECIFICS.AsyncStorage.getItem(path);   //Note that variable paths are not accepted here. Virtually no use-case for this.
        if(jsonValue === null) return;                      //The Async Storage Specification requires that .getItem() returns null for an unknown key
        const data = JSON.parse(jsonValue);                   //Using JSON.parse and stringify() allows to store non-string data.
        write(stateId, data, 'AsyncStorage', 'update');
    } 
    catch(error) {console.error("Error getting document:", error);}
}
/** 
* @description Writes a document to AsyncStorage.
* Naming: It is a flat structure, there are no collections.
* @param {String} path - The AsyncStorage path to store data to.
* @param {*} data - The data to be stored.
* @param {String} context - The context that is requesting the storage. The read function can request a write with 'local' context. 
* The write function will call the storage function. Thanks to context the AsyncStorageWrite function exits, this way read/write loops can be avoided.
* @example
* ```javascript 
*   path = 'userData'; data = {id: '123', name: 'user'}; //Pushes {data} in 'userData' document
* ```
*/  
const nativeStorageWrite = (path) => async (data, context ='') => {
    if(context === 'AsyncStorage') return;
    try {
        const jsonData = JSON.stringify(data);
        await ONESPECIFICS.AsyncStorage.setItem(path, jsonData);
    } 
    catch (error) {console.error("Error setting document:", error);} 
}

/** 
* @description Removes a document from AsyncStorage.
* Naming: It is a flat structure, there are no collections.
* @param {String} path - The AsyncStorage path to the document.
* @example
* ```javascript 
*   path = userId; //Removes userId document
* ```
*/
const nativeStorageRemove = (path) => async () => {
    try {
        await ONESPECIFICS.AsyncStorage.removeItem(path);
    } 
    catch(error) {console.error("Error removing document:", error);}
}

//=============================================================================
// STATE: The state represents the mutable dimension of the app. Following a pure
// functional programming paradigm, all the functions give the same output provided
// with the same input (immutability) and do not change the state internally (no
// side effects).
// All the state of the app is contained in a single object and is created through
// the configuration provided.
// In order to modify the state, the user can use the read, add, update and remove
// functions in the app template (never inside components).
// 1. Define all the mutable variables required for the app and how they will be 
// sourced and stored. Use a single provider for each state variable (E.g.: do not
// mix firestore and indexedDB)
// 2. Use the read, add, update and remove functions to modify the state based on
// user actions (click, input, drag, etc.).
//=============================================================================

/** 
* @summary Reads the current value of the corresponding state variable.
* @description This is the main function to return the current value for the state variable of the app.
* Structure functions (components) cannot access or modify state, they can only generate events and the functions input for those events can modify the state.
* Use-case: Used within the template to access the variables needed to render the app. When these variables are modified, the rerender function 
* is called again getting the new state of the app.
* @param {String} stateId - The unique name given to the state variable.
* @example
* ```javascript 
*   const state = {toWhom: {default: 'World'}};
*   const template = () => Text()('Hello ' + read('toWhom') + '!');
* ```
* @returns {String} Returns the value for the corresponding state variable.
*/ 
export const read = (stateId) => {
    // return ONEJS.reactState[stateId];//Not reading from React directly as writing the state takes some time and when read is called the value is not updated.
    // return ONEJS.currentState[stateId] != null ? ONEJS.currentState[stateId].value : undefined;
    return ONEJS.currentState[stateId]?.value;
}

/** 
* @description Internal function to modify the state. It is the only function able to access and modify the state.
* Use-case: This function is called internally to write a new value into the state variable and save the value in the storage.
* @param {String} stateId - The unique name given to the state variable.
* @param {*} newValue - The new value to be written in the state variable.
* @param {String} context - The context that is requesting the write. Externally the 'app' context will be used. Internally: local, firestore or indexedDB.
* @param {String} action - The type of action that will be performed on the state: add, remove, update or updateArray.
* @param {String} documentId - For array operations, it is the element in the array that needs to be modified.
* @example
* ```javascript 
*   write('events', {id: '123', name: {'party'}}, 'app', 'arrayUpdate', '123');
* ```
*/ 
const write = (stateId, newValue, context = '', action='update', documentId) => {
    console.log(doc)
    const oldValue = ONEJS.currentState[stateId].value;
    if(oldValue === newValue) return;
    
    if(action === 'add') {//Adds value to array state variable
        ONEJS.currentState[stateId].value.push(newValue);
        ONEJS.reactSetState[stateId]([... ONEJS.currentState[stateId].value]);//We need to clone the array with the spread syntax, otherwise leads to unexpected behaviour.
    }
    else if(action === 'remove') {
        if(documentId != null) {//Remove value from array state variable
            ONEJS.currentState[stateId].value.splice(ONEJS.currentState[stateId].value.findIndex(doc => doc.id === documentId), 1);
             ONEJS.reactSetState[stateId]([... ONEJS.currentState[stateId].value]);
        }
        else {//Remove the value from the state variable
            newValue = Array.isArray(oldValue) ? [] : undefined;
            ONEJS.currentState[stateId].value = newValue;
            ONEJS.reactSetState[stateId](newValue);//*REACT SPECIFIC: Use setState function to update the state and trigger rerender*
        }
    }
    else if(action === 'updateArray') {//Update value from array state variable
        ONEJS.currentState[stateId].value[ONEJS.currentState[stateId].value.findIndex(doc => doc.id === documentId)] = newValue;
        ONEJS.reactSetState[stateId]([... ONEJS.currentState[stateId].value]);
    }
    else if(action === 'update') {//Update value from state variable
        ONEJS.currentState[stateId].value = newValue;
        ONEJS.reactSetState[stateId](newValue);//*REACT SPECIFIC: Use setState function to update the state and trigger rerender*
    }
    else return;

    if(context === 'stateHistory') return;//If the context is 'stateHistory' do not perform any actions on thre database
    saveState(stateId, oldValue, ONEJS.currentState[stateId].value, context, action, documentId);//Save the state configuration delta to be able to track the history of the state

    if(ONEJS.currentState[stateId].removal && action === 'remove') ONEJS.currentState[stateId].removal(documentId);
    if(ONEJS.currentState[stateId].storage && action !== 'remove') ONEJS.currentState[stateId].storage(newValue, context, documentId);//Context checks if the source path is equal to the target path to avoid calling storage innecessarity
    if(ONEJS.currentState[stateId].onChange) ONEJS.currentState[stateId].onChange(oldValue, newValue, stateId);//Called to performe additional actions on change
    if(ONEJS.currentState[stateId].alert) window.dispatchEvent(new CustomEvent(stateId + 'stateChange', {detail: newValue}));//Called when the state variable is required to alert when changes by other state var. E.g.: user: /users/@userId, userID: '1234' (watched variable)
    if(ONEJS.currentState[stateId].source && action === 'add') ONEJS.currentState[stateId].source(stateId, context);//When adding a new document into a collection, source is called to retrieve from the database the id for the recently added document.
}

/** 
* @description External function to modify the state. Adds a new value into the state variable array and saves it in the storage.
* Use-case: Used to add a new document to the collection in the database.
* Note: The reason why the second argument 'event' is curried, is to allow to pass this function to user events (E.g: onInput, onClick), in these cases,
* the event.target.value (e.target.checked in the case of checkbox) holds the new value to be updated.
* @param {String} stateId - The unique name given to the state variable.
* @param {*} event - The event containing the value or the value itself.
* @example
* ```javascript 
*   const template = () => [Input({ type: 'text, onInput: add('events') })];
*   const template = () => [Button({ onClick: (e) => add('events')({id: '123', name: {'party'}}) })]; 
* ```
*/ 
export const add = (stateId) => event => {
    const newValue = (event?.target) ? (event.target.type === 'checkbox' ? event.target.checked : event.target.value) : event;
    const context = 'app';//External context
    const action = 'add';
    write(stateId, newValue, context, action);
}

/** 
* @description External function to modify the state. Updates the value of state variables on input change events and saves it in the storage.
* Use-case: React to user events updating the state.
* Note: The reason why the second argument 'event' is curried, is to allow to pass this function to user events (E.g: onInput, onClick), in these cases,
* the event.target.value (e.target.checked in the case of checkbox) holds the new value to be updated.
* @param {String} stateId - The unique name given to the state variable.
* @param {String} documentId - If the state is an array of objects, corresponds to the {id} property within the object to be matched.
* @param {*} event - The event containing the value or the value itself.
* @example
* ```javascript 
*   const template = () => [Input({ type: 'text, onInput: update('userId') })]; //Everytime the input changes updates the value of 'user'
*   const template = () => [Button({ onClick: (e) => update('events', '123')({name: 'new party'}) })]; //Everytime is clicked sets the same value
* ```
*/
export const update = (stateId, documentId) => (event) => {
    // if(typeof constValue !== 'undefined') write(stateId, constValue);//For the moment not adding this option update = (stateId, constValue) => (event), it is anti-pattern
    const newValue = (event?.target) ? (event.target.type === 'checkbox' ? event.target.checked : event.target.value) : event;
    const context = 'app';//External context
    const action = documentId != null ? 'updateArray' : 'update';//Set the value within an array or update the value entirely
    write(stateId, newValue, context, action, documentId);
}

/** 
* @description External function to modify the state. Removes the value from the state variable on input change events and saves it in the storage.
* Use-case: React to user events removing the value from the state.
* @param {String} stateId - The unique name given to the state variable.
* @param {String} documentId - If the state is an array of objects, corresponds to the {id} property within the object to be matched.
* @example
* ```javascript 
*   const template = () => [Button({ onClick: (e) => remove('userId') })]; //Everytime is clicked sets 'userId' to undefined
*   const template = () => [Button({ onClick: (e) => remove('events', '123') })]; //Everytime removes event '123' from the 'events' array
* ```
*/
export const remove = (stateId, documentId) => { 
    const newValue = undefined;
    const context = 'app';//External context
    const action = 'remove';//Set the value within an array or update the value entirely
    write(stateId, newValue, context, action, documentId);
}

/**
* @typedef  {Object}  Config - The configuration structure required by setupState function.
* @property {*}       default               - The default value for the state.
* 
* @property {Object}  [source]              - Source for the state variable. If defined, choose one and only one of the providers below for each state variable.
* @property {String}  [source.url]          - The url to extract data from. The data segment is indicated with ':'
* @property {String}  [source.firestore]    - The path to the firestore document or collection.
* @property {String}  [source.indexedDB]    - The path to the indexedDB document or collection.
* @property {Array<String>}[source.collections] - Only for indexedDB using a state variable at collection level, declare all the collections to read from.
*                                                 Possibly removed in future updates, as it goes against database best practices.
* @property {String}  [source.local]        - The path to the local storage document.
* @property {Function}[source.function]     - A function to be called on every read (rerender). You may choose to pull data from your own database here. 
* 
* @property {Object}  [storage]             - Storage for the state variable. If defined, choose one and only one of the providers below for each state variable.
* @property {String}  [storage.firestore]   - The path to the firestore document or collection.
* @property {String}  [storage.indexedDB]   - The path to the indexedDB document or collection.
* @property {Array<String>}[storage.collections] - Only for indexedDB using a state variable at collection level, declare all the collections to write to.
*                                                 Possibly removed in future updates, as it goes against database best practices.
* @property {String}  [storage.local]       - The path to the local storage document.
* @property {Function}[storage.function]    - A function to be called on every write (state update). You may choose to push data to your own database here.
*  
* @property {Function}[onChange]            - A function to be called on every state read/write. Deprecated in favor of source.function and storage.function. 
*/

/** 
* @description Sets up the state based on the configuration object. All the state variables to be used and their default values need to declared in this configuration.
* @param {Config} config - The configuration required to set up the state of the app.
* @example
* ```javascript 
*   const config = {
*       userId: '123',
*       events: {default: [], source: {firestore: 'events'}, storage: {firestore: 'events'}},
*       selectedEventId: {default: '', source: {url: '/events/:'}},
*       selectedEvent: {default: {}, source: {firestore: 'events/@selectedEventId'}, storage: {firestore: 'events/@selectedEventId'}}
*   }
* ```
*/
const setupState = (config) => {
    const indexedDBCollections = [];  //All the collections required to be initialized for indexedDB 
    const indexedDBStateIds = {};     //All the state id-s that need to be updated with indexedDB data

    //1. Create all the state variables to make sure they exist
    Object.entries(config).forEach(([stateId, value]) => {
        //Set default value for state variable
        ONEJS.currentState[stateId] = {};
        // ONEJS.currentState[stateId].value = value?.default ?? value;
        if(value && typeof value === 'object' && value.hasOwnProperty('default')) ONEJS.currentState[stateId].value = value['default']; 
        else ONEJS.currentState[stateId].value = value;              
    });

    //2. Set the storage functions. They need to be set before source, as source functions modify the state
    Object.entries(config).forEach(([stateId, value]) => { 
        //If defined by the user, use Firestore as the storage option.
        if(value?.storage?.firestore) {
            ONEJS.currentState[stateId].storage = firestoreWrite(value.storage.firestore);
            ONEJS.currentState[stateId].removal = firestoreRemove(value.storage.firestore);
        }
        //If defined by the user, use IndexedDB as the storage option
        else if(value?.storage?.indexedDB) {
            ONEJS.currentState[stateId].storage = indexedDBWrite(value.storage.indexedDB);            
            ONEJS.currentState[stateId].removal = indexedDBRemove(value.storage.indexedDB);
            let collections = [value.storage.indexedDB.split('/').filter(Boolean)[0]];//Note: On collections better to avoid using state variables (@stateId)

            if(value.storage.collections && value.storage.collections.length) collections = value.storage.collections;//Array specifying which are the collections will be accessed. Only required for collection variable path.
            collections.forEach(collection=>{indexedDBCollections.indexOf(collection) === -1 ? indexedDBCollections.push(collection) : null;});
        }
        //If defined by the user, use Local Storage as the storage option
        else if(value?.storage?.local) {
            if(ONESPECIFICS.os === 'web') {
                ONEJS.currentState[stateId].storage = localStorageWrite(value.storage.local);
                ONEJS.currentState[stateId].removal = localStorageRemove(value.storage.local);
            }
            else if(ONESPECIFICS.os === 'ios' || ONESPECIFICS.os === 'android') {
                ONEJS.currentState[stateId].storage = nativeStorageWrite(value.storage.local);
                ONEJS.currentState[stateId].removal = nativeStorageRemove(value.storage.local);
            }
        }
        //If defined by the user, use any function to set the storage. It will be called on write()
        else if(value?.storage?.function) ONEJS.currentState[stateId].storage = value.storage.function;     
    });

    //3. set up the source functions and retrieve the initial values
    Object.entries(config).forEach(([stateId, value]) => {       
        //If defined by the user, use the url as the source of data
        if(value?.source?.url) {
            readUrl(value.source.url)(stateId);
        } 
        //If defined by the user, use Firestore database as the source of data.
        else if(value?.source?.firestore) {
            if(readStateId(value.source.firestore)) {
                ONEJS.currentState[readStateId(value.source.firestore)].alert = true;//In case the path includes a state variable, alert for changes
                ONEJS.currentState[stateId].source = firestoreRead(value.source.firestore);//This is required for collections, when we insert a document by querying the source we retrieve the document id
            }
            firestoreRead(value.source.firestore)(stateId, 'initialize');
        }     
        //If defined by the user, use IndexedDB as the source option
        else if(value?.source?.indexedDB) {
            ONEJS.currentState[stateId].source = indexedDBRead(value.source.indexedDB);
            if(readStateId(value.source.indexedDB)) ONEJS.currentState[readStateId(value.source.indexedDB)].alert = true;//In case the path includes a state variable, alert for changes
            let collections = [value.source.indexedDB.split('/').filter(Boolean)[0]];//Note: On collections better to avoid using state variables (@stateId)
            if(value.source.collections && value.source.collections.length) collections = value.source.collections;//Array specifying which are the collections will be accessed. Only required for collection variable path.
            collections.forEach(collection=>{indexedDBCollections.indexOf(collection) === -1 ? indexedDBCollections.push(collection) : null;});
            indexedDBStateIds[stateId] = value.source.indexedDB;
        }
        //If defined by the user, use Local Storage as the source option
        else if(value?.source?.local) {
            if(ONESPECIFICS.os === 'web') localStorageRead(value.source.local)(stateId);
            else if(ONESPECIFICS.os === 'ios' || ONESPECIFICS.os === 'android') nativeStorageRead(value.source.local)(stateId);
        }
        //If defined by the user, use any function to set the storage. It will be called on write()
        //Otherwise, user can use any function to source data for the state variable. It will be called once during setupState, the user should subscribe to changes to the source in this function to update the state. 
        else if(value?.source?.function) {
            ONEJS.currentState[stateId].source = value.source.function;
            ONEJS.currentState[stateId].source(stateId);
        }       
    });

    //Sets up the indexedDB tables to use as source/storage
    if(Object.keys(indexedDBCollections).length > 0) {
        if(!('indexedDB' in window)) {//Check for support
            console.error('IndexedDB not supported.');
            return;
        }
        //Check the current version and the collections setup in that version. If the collections change, increase the version number and store those collections
        const versionString = localStorage.getItem('oneIndexedDBVersion' + ONEJS.appName);
        let version = versionString ? parseInt(versionString) : undefined;
        let collectionsJson = localStorage.getItem('oneIndexedDBCollections' + ONEJS.appName);
        const collections = collectionsJson != null ? JSON.parse(collectionsJson) : undefined;
        
        if(!collections) {//No collections existing: Store collections and upgrade version
            collectionsJson = JSON.stringify(indexedDBCollections)
            localStorage.setItem('oneIndexedDBCollections' + ONEJS.appName, collectionsJson);
            if(!version) version = 1;
            else version = version + 1;
            localStorage.getItem('oneIndexedDBVersion' + ONEJS.appName, version);
        }

        //Missing collections: Store collections and upgrade version
        else if (!indexedDBCollections.every(collection => collections.includes(collection))){
            collectionsJson = JSON.stringify(indexedDBCollections)
            localStorage.setItem('oneIndexedDBCollections' + ONEJS.appName, collectionsJson);
            if(!version) version = 1;
            else version = version + 1;
            localStorage.getItem('oneIndexedDBVersion' + ONEJS.appName, version);
        }

        // indexedDB.deleteDatabase('oneIndexedDB' + ONEJS.appName);
        const openRequest = indexedDB.open('oneIndexedDB' + ONEJS.appName, version);//Open the database connection request

        //Called for new database or version number increase. The collections to be used (object stores) are declared here.
        //This is the only place to alter the structure of the database: create/remove object stores.
        openRequest.onupgradeneeded = function(e) {
            ONEJS.idb = e.target.result; //IDBDatabase object to create object stores and read/write later
            indexedDBCollections.forEach(path => {
                if (!ONEJS.idb.objectStoreNames.contains(path)) {
                    try{//https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB go to section: 'Structuring the Database'
                        ONEJS.idb.createObjectStore(path, {keyPath: 'id', autoIncrement: true}); //Can only hold JavaScript objects
                    }
                    catch(error) {console.error('IndexedDB Object Store could not be created: ' + error)}
                }
            });
        }
        //If the onupgradeneeded event exits successfully, the onsuccess function will be triggered. Reads the initial data from the database.
        openRequest.onsuccess = function(e) {
            ONEJS.idb = e.target.result;
            Object.entries(indexedDBStateIds).forEach(([stateId, path]) => {
                indexedDBRead(path)(stateId, 'initialize'); 
            });
        }
        openRequest.onerror = function(e) {console.error('IndexedDB Error');console.error(e);};
    }
}

/** 
* @description Internal function to store the state modification history. Since the state is the only modifiable part of the app, it allows to go back to previous states.
* Use-case: On every write() function call the modification is stored. 
* @param {String} stateId  - The unique name given to the state variable that is being modified.
* @param {*}      newValue - The new value to be written in the state variable.
* @param {*}      oldValue - The previous value to the state modification.
* @param {String} context  - The context used to  is requesting the write. Externally the 'app' context will be used. Internally: local, firestore or indexedDB.
* @param {String} action  - The type of action that modifies the state: add, remove, update or updateArray.
* @param {String} documentId - For array operations, it is the element in the array that needs to be modified.
* @example
* ```javascript 
*   saveState('events', {id: '123', name: {'party'}}, 'app', 'arrayUpdate', '123');
* ```
*/ 
const saveState = (stateId, oldValue, newValue, context, action, documentId) => {//0 is the current state, 1 would be the previous state, ... until stateHistorySize.
    if(context === 'stateHistory') return;//This occurs rewind or fastForward functions are being used, therefore no new state needs to be saved.
    if(ONEJS.stateHistoryPosition > 0) {//In case the history is rewinded and the state is modified, erase the previous path.
        ONEJS.stateHistory.splice(0, ONEJS.stateHistoryPosition);
        ONEJS.stateHistoryPosition = 0;
    }
    ONEJS.stateHistory.unshift({stateId: stateId, oldValue: oldValue, newValue: newValue, action: action, documentId: documentId, timestamp: new Date()});
    if(ONEJS.stateHistory.length > ONEJS.stateHistorySize) ONEJS.stateHistory.pop();
}

/** 
* @description External function to go to a certain point in the state modification history. It only works for 'update' events and does not undo database storage.
* @param {Number} statePosition - The unique name given to the state variable that is being modified.
* @example
* ```javascript 
*   const template = () => [Button({ onClick: (e) => goToState(4) })]; //Rewinds the state history to the slot number 4 in the array.
* ```
* @todo Implement reversal actions: add -> removeArray, update -> update, updateArray -> updateArray, remove -> update, removeArray -> add
* It is challenge to undo add action: for removeArray we need the id of the document added which is not stored. Knowing that 'add' always pushes the document 
* at the end of the array, it could be undone by always removing the last element.
*/
export const goToState = (statePosition) => {
    statePosition = parseInt(statePosition);
    if(statePosition < 0 || statePosition >= ONEJS.stateHistory.length) {
        console.error('Cannot rewind state to: ' + statePosition + '. It exceeds stateHistory.length.');
        return;
    }
    else if(statePosition === ONEJS.stateHistoryPosition) {
        return;
    }
    else if(statePosition > ONEJS.stateHistoryPosition) {
        for (let i = ONEJS.stateHistoryPosition; i < statePosition; i++) {
            write(ONEJS.stateHistory[i].stateId, ONEJS.stateHistory[i].oldValue, 'stateHistory');
        }
    }
    else {
        for (let i = ONEJS.stateHistoryPosition - 1; i >= statePosition; i--) {
            write(ONEJS.stateHistory[i].stateId, ONEJS.stateHistory[i].newValue, 'stateHistory');
        }
    }
    ONEJS.stateHistoryPosition = statePosition;
}
/** 
* @description Goes to the next (more recent) point in the modification history. 
* @example
* ```javascript 
*   const template = () => [Button({ onClick: (e) => nextState() })]; //Goes to the next state in the history
* ```
* @todo Until goToState() is fixed it is not production ready.
*/
export const nextState = () => {
    const statePosition = ONEJS.stateHistoryPosition - 1;
    goToState(statePosition);
}
/** 
* @description Goes to the previous (less recent) point in the modification history. 
* @example
* ```javascript 
*   const template = () => [Button({ onClick: (e) => previousState() })]; //Goes to the previous state in the history
* ```
* @todo Until goToState() is fixed it is not production ready.
*/
export const previousState = () => {
    const statePosition = ONEJS.stateHistoryPosition + 1;
    goToState(statePosition);
}
/** 
* @description Returns the complete stateHistory array containing the stored modifications to the state 
* @example
* ```javascript 
*   readStateHistory().map((value, index) => View()([ View()('Id: ' + value.stateId),
*                                                     View()('Old: ' + value.oldValue), 
*                                                     View()('New: ' + value.newValue) ]));
* ```
*/
export const readStateHistory = () => {
    return ONEJS.stateHistory;
}


//=============================================================================
// COMPONENTS: Components are functions that return a structure to be rendered.
// Every component should only be dependendent upon its input and does not modify 
// or maintain state.
// Arguments for component functions can be classified as:
// 1. Parameters: List of inputs unique to our component that are used to shape
//    the behaviour, structure or style.
// 2. Properties: All the properties required to define the componet providing its 
//    state. 
// 3. Attributes: All the possible attributes that can be input during the execution. 
//    E.g: class, hidden, id, etc.
// 3. Structure: Optional for components that can have an internal structure.
//    This arguments is curried. 
// Component Definition Example: 
// const myComponent = Component({param1 ='default1', paramN, ...attributes}={}) => 
//  structure => { 
//     return Div(attributes)([Text()('Hello World'), ...structure]);
//  }
// Component Styling Ordered by Priority:
// 1. Inline styles: These styles are inserted directly in the HTML tags. They are not 
//    compiled. As much as possible it is recommended to avoid this type.
// 2. Theme and flavor: This is the way to go when customizing componets. Flavor 
//    encapsulate css variables that allow to change the look and feel of the component
//    making it blend in with the app. One or more themes may be applied at a time.
// 3. Compiled styles:  These styles can act on nested elements and tags like :hover. 
//    They need to be compiled by emotion css into a class that is later assigned 
//    to the component.
//
// Intrinsic CSS Priority: 
// Inherited styles < * < element < attribute < class < ID < Combined selectors <
// < CSS properties set directly < on element, inside style attribute.
//=============================================================================

/** 
* @description Internal function to memoize component structure in a array to ensure the same reference is always returned.
* For memoize components, if properties do not change, React will skip rendering the component, and reuse the last rendered result.
* Memoizing components can be useful in the following scenarios:
* 1. Pure functional components
* 2. Renders often
* 3. Rerenders with same props
* 4. Medium to big size
* @param {Function | String} ComponentFunction - The component function to be memoized
* @param {Boolean} memoized - True: memoize the component, false: do not memoize the component
* @param {String} name - In order to memoize the component, it needs to be given a unique name.
* @example
* ```javascript 
*   memoizeComponent((props)=>Div()('Hello world'), true, 'div');
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const memoizeComponent = (ComponentFunction, memoized, name) => {
    let memoizedComponent = ComponentFunction;
    if(name) {
        if(!ONEJS.memoizedComponents[name]) ONEJS.memoizedComponents[name] = memoized ? React.memo(ComponentFunction) : ComponentFunction;
        memoizedComponent = ONEJS.memoizedComponents[name];
    }
    return memoizedComponent;
}

//=============================================================================
// COMPONENTS: Creation Higher Order Components (HOC)
//Whereas a component transforms props into UI, a higher-order component transforms 
// a component into another component: https://en.reactjs.org/docs/higher-order-components.html
// A set of internal functions that take the component function and wrap it to
// create a React element. This is required in order to be able to use hooks inside.
// They cannot be implemented inside the Component function as they would be
// generated everytime the app is rerendered generating a different memory reference.
// When this happens React is unable to compare and optimize changes for every
// iteration. 
// STEPS (wrapped components):
// 1. The user writes the component function.
// 2. The user creates the component by wrapping the component function with Component.
// 3.BaseComponent() function calls EnhancedComponent() to wrap the component function
//    in a HOC to provide more functionality.
// 4. Create<...> function creates the React element for the component wrapped by the
//    EnhancedComponent() function
//=============================================================================

/** 
* @description For a given component function, creates a React element that can hold children / internal structure. If the user sets the attribute
* 'memoized' to true, it also memoizes the component for performance optimization. The ComponentFunction has already been wrapped by EnhancedComponent().
* @param {Function | String} ComponentFunction - The component function to be created into a React element.
* @param {Object} attributes - The attributes that will be passed during component instantiation.
* @param {Object} structure - The internal structure that will be passed during component instatiation.
* @example
* ```javascript 
*   CreateWrappedComponentWithStructure(props=>structure=>Div(props)(structure))({id: 'myId'})(Text()('Hello World'));
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const CreateWrappedComponentWithStructure = (name, ComponentFunction) => ({...attributes}={}) => structure => {
    const memoized = memoizeComponent(ComponentFunction, attributes['memoized'], name);
    delete attributes['memoized'];
    return React.createElement(memoized, {structure: structure, ...attributes}, null);
}

/** 
* @description For a given component function, creates a React element that cannot hold children / internal structure. If the user sets the attribute
* 'memoized' to true, it also memoizes the component for performance optimization. The ComponentFunction has already been wrapped by EnhancedComponent().
* @param {Function | String} ComponentFunction - The component function to be created into a React element.
* @param {Object} attributes - The attributes that will be passed during component instantiation.
* @example
* ```javascript 
*   CreateWrappedComponentWithoutStructure(props=>Input(props)({style: {background: 'blue'}});
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const CreateWrappedComponentWithoutStructure = (name, ComponentFunction) => ({...attributes}={}) => {//Contar por que necesitamos un wrapper para usar los hooks en las funciones
    const memoized = memoizeComponent(ComponentFunction, attributes['memoized'], name);
    delete attributes['memoized'];
    return React.createElement(memoized, attributes); //React uses property "children" to setup the component internals
}

/** 
* @description For a given component function, creates a React element that can hold children / internal structure. If the user sets the attribute
* 'memoized' to true, it also memoizes the component for performance optimization.
* @param {String} name - Unique name for the Component.
* @param {Function | String} ComponentFunction - The component function to be created into a React element.
* @param {Object} attributes - The attributes that will be passed during component instantiation.
* @param {Object} structure - The internal structure that will be passed during component instatiation.
* @example
* ```javascript 
*   CreateComponentWithStructure(props=>structure=>Div(props)(structure))({id: 'myId'})(Text()('Hello World'));
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const CreateComponentWithStructure = (name, ComponentFunction) => ({...attributes}={}) => structure => {
    const uncurriedComponentFunction = ({structure, ...attributes} = {}) => ComponentFunction(attributes)(structure);
    const memoized = memoizeComponent(uncurriedComponentFunction, attributes['memoized'], name);
    delete attributes['memoized'];
    return React.createElement(memoized, {structure: structure, ...attributes}, null);
}

/** 
* @description For a given component function, creates a React element that cannot hold children / internal structure. If the user sets the attribute
* 'memoized' to true, it also memoizes the component for performance optimization. 
* @param {String} name - Unique name for the Component.
* @param {Function | String} ComponentFunction - The component function to be created into a React element.
* @param {Object} attributes - The attributes that will be passed during component instantiation.
* @example
* ```javascript 
*   CreateComponentWithoutStructure(props=>Input(props)({style: {background: 'blue'}});
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const CreateComponentWithoutStructure = (name, ComponentFunction) => ({...attributes}={}) => {
    if(name & attributes['memoized']) {//memoizeComponent cannot be called since passing the component function and returning the same reference creates a loop
        if(!ONEJS.memoizedComponents[name]) ONEJS.memoizedComponents[name] = React.memo(ComponentFunction);
        return React.createElement(ONEJS.memoizedComponents[name], attributes, null); 
    }
    return React.createElement(ComponentFunction, attributes, null); 
}

/** 
* @description For a given component function or tag, creates a React element that has been previously wrapped in a HOC to provide additional functionality: theming,
* style compilation and lifecycle functions. Base components are the building blocks of the app and represent the os native components.
* @param {String} name - Unique name for the Component.
* @param {Boolean} hasChildren - Specifies whether the Component can have user added structure.
* @param {Function} ComponentFunction - The component function to be created into a React element.* @example
* ```javascript 
*   WrappedComponent(props=>structure=>Text(props)(structure));
* ```
* @returns {ReactElement} - The enhanced React element.
*/
export const BaseComponent = (name, hasChildren, ComponentFunctionOrTag) => {
    if(hasChildren) return CreateWrappedComponentWithStructure(name, EnhancedComponent(ComponentFunctionOrTag));    
    return CreateWrappedComponentWithoutStructure(name, EnhancedComponent(ComponentFunctionOrTag));
}

/** 
* @description For a given component function, creates a React element. This is the main method to create your own custom components. 
* @todo In the future this could be renamed to 'BaseComponent' and the Div wrapping could be deprecated. Base components would be the os-native components that would
* be wrapped with this functionality. By using these components in a custom one, the functionality is extended.
* @param {String} name - Unique name for the Component.
* @param {Boolean} hasChildren - Specifies whether the Component can have user added structure.
* @param {Function} ComponentFunction - The component function to be created into a React element.
* @example
* ```javascript 
*   WrappedComponent(props=>structure=>Text(props)(structure));
* ```
* @returns {ReactElement} - The enhanced React element.
*/
export const Component = (name, hasChildren, ComponentFunction) => {
    if(hasChildren) return CreateComponentWithStructure(name, ComponentFunction);
    return CreateComponentWithoutStructure(name, ComponentFunction);
}

/** 
* @description A Higher Order Component (HOC) that provides additional functionality to the wrapped component for theming, inlineStyles, and lifecycle events.
* @param {Function | String} ComponentFunction - The component function to be wrapped and infused with enhanced functionality.
* @param {Object} structure - The internal structure that will be passed during component instatiation.
* @param {Array<String> | String} flavor - The chosen flavor(s) during instatiation.
* @param {Array<Object> | Object} style - The style to be compiled into a css class.
* @param {Object} inlineStyle - The inline style chosen during instantiation.
* @param {Function} onInit - Called once and only once before the component is mounted.
* @param {Function} onCreate - Called onComponentDidMount event. The function takes as inputs newValue and component.
* @example
* ```javascript 
*   const addListeners = (newValue, component) => component.addEventListener('click', async (e) => alert(newValue));
*   const MyComponent = BaseComponent('MyComponent', true, () => Div()())
*   const template = () => [MyComponent({onCreate: addListeners})]
* ```
* @param {Function} onDestroy - Called onComponentWillUnmount event. The function takes as inputs newValue and component.
* @param {Object} onPropertyChange - Called after onComponenDidMount event for every change in the value of the tracked properties.
* Takes an object whose keys are the properties tracked and the values the callback function. The function takes as inputs newValue and component.
* @example
* ```javascript 
*   EnhancedComponent(props=>Input(props)({style: {background: 'blue', flavor: 'danger', onCreate: addListeners}});
* ```
* @returns {ReactElement} - If memoized, the memoized component. Otherwise, the original component.
*/
const EnhancedComponent = (ComponentFunctionOrTag) => ({structure, flavor, style, inlineStyle, onInit, onCreate, onDestroy, onPropertyChange, ...attributes}={}) => {    
    //START CLASS SETUP: Web Specific. No class or className in React Native
    const classArray = [];
    if(ONESPECIFICS.os === 'web') {
        //Add instantiation class(es) to the class array
        if(attributes['class']) {Array.isArray(attributes['class']) ? classArray.push(...attributes['class']) : classArray.push(attributes['class']); delete attributes['class']}
        
        //Add flavor class to the class array
        if(flavor?.flavorId) {
            if(Array.isArray(flavor.flavorId)) {classArray.push(...flavor.flavorId.map(flavorId => ONEJS.emotionCSSClasses['flavor'+flavorId]));}
            else classArray.push(ONEJS.emotionCSSClasses['flavor'+flavor.flavorId]);
        }
        
        //Add compiled style class to the class array
        if(style) {//style can of Array type. The priority is from left (least priority) to write (most priority)
            classArray.push(ONESPECIFICS.css(style));
        }
        if(classArray.length) attributes['className'] = classArray.join(' '); //For the moment React uses className instead of class
        if(inlineStyle) attributes['style'] = inlineStyle;
        //END CLASS SETUP        
    }
    else if(ONESPECIFICS.os === 'ios' || ONESPECIFICS.os === 'android') attributes['style'] = style;//Sylesheet.create does not seem to provide any performance boost, only validation in dev. https://stackoverflow.com/questions/38886020/what-is-the-point-of-stylesheet-create

    //*REACT SPECIFIC* Lifecycle functions
    if(onInit) {//Similar to the deprecated ComponentWillMount. The limitation is that domNode is not yet available and cannot be accessed for changes. If this is needed wait until onCreate
        const initialized = React.useRef();
        if(!initialized.current) {
            onInit();
            initialized.current = true;
        }
    }

    if(onCreate || onDestroy || onPropertyChange) {
        const domNode = React.useRef();
        attributes['ref'] = domNode;    
        if(onCreate || onDestroy) {//onCreate is equivalent to ComponentDidMount and onDestroy is equivalent to ComponentWillUnmount
            React.useEffect(() => { //React Effect: https://es.reactjs.org/docs/hooks-overview.html
                if(onCreate) onCreate(domNode.current);
                if(onDestroy) return onDestroy(domNode.current);
            }, []);//The array is the properites for which it should trigger the change. If empty, then none. If no parameter, then all.        
        }
        if(onPropertyChange) {//onPropertyChange: {prop1: function1, prop2: function2};//Functions take (newValue, domNode)
            Object.entries(onPropertyChange).map(([property, callback]) => {  
                React.useEffect(() => {  
                    callback(attributes[property], domNode.current); //Equivalent to componentDidMount lifecycle call
                }, [attributes[property]]);
            });
        }
    } 
    
    //If the structure is an array with missing 'key' property, then destructure the input; The structure array with n objects, becomes n arguments in the function
    if(Array.isArray(structure) && structure?.length > 0 && structure?.[0].key == null) return React.createElement(ComponentFunctionOrTag, attributes, ...structure)
    return React.createElement(ComponentFunctionOrTag, attributes, structure); 
}

//=============================================================================
// APP: A function that ties together the functionality of all the other modules.
// By providing the configuration objects to the app() function, the state, theme
// databases and texts are setup and the app is rendered.//
//=============================================================================

/**
* @typedef  {Object}  Text - The configuration to setup and translate all the texts inside the app.
* @property {String}  textId               - The id identifying the content of the text. E.g: 'homepageTitle'.
* @property {String}  textId.language      - The language for the text string.
*/
/** 
* @description Main function to set up the app and render the template in the DOM. All the configuration required to run the app is provided to this function.
* @param {String} [name] - Unique name for the app. Used to set up indexedDB storage.
* @param {Function} template - A function that returns the template of the app.
* @param {Config} state - The configuration object to setup the state. Declares all the state variables along with the source and storage option.
* @param {Theme} [theme] - The collection of flavors that will be used to style the app. Defines the theme variables and the values that will be used for each flavor.
* It can also be a string to choose from the out-of-the-box themes provided by oneJS.
* @param {Object} [themeSetup] - A CSS in JS object describing how the theme variables affect the different DOM elements.
* @param {Text} [text] - The translatable text strings to be used in the app. 
* @param {Object} - The initialized firestore dabase object to enable performing the read/write operations.
* @example
* Simple Hello World example:
* ```javascript 
* app({template: ()=>"Hello World"});
* ```
* @example
* Complete Example:
* ```javascript 
*   const name = 'myApp';
*   const template = () => [Text()(readText('title')), Text()(readText('greeting') + ': ' + read('inputText')), Input({value: read('inputText', onInput: update('inputText'))})];
*   const state = {inputText: {default: 'myApp'}}
*   const theme = {default: {primaryColor: 'blue'}};
*   const themeSetup = {p: {color: themeVariable('primaryColor')}};
*   const text = {title: 'My App',  greeting: {en: 'Hello', es: 'Hola'}};
*   const firestore = initializeApp(config).getFirestore();
*   app({name: name, template: template, state: state, theme: theme, themeSetup: themeSetup, text: text, firestore: firestore})
* ```
*/
export const app = ({name, template, state, theme, themeSetup, text, firestore}) => {
    ONEJS.appName = name;
    ONEJS.appText = text;
    ONEJS.firestore = firestore;
    setupTheme({theme: theme, themeSetup: themeSetup}); //Setting up before AppComponent for the css class order.

    //*REACT SPECIFIC*
    const appFunction =  ({state, template}={}) => {//Called on every rerender
        Object.entries(state).forEach(([stateId, value]) => {
            //Set default value for state variable
            const reactInitialState = (value && typeof value === 'object' && value.hasOwnProperty('default')) ? value['default'] : value;
            [ONEJS.reactState[stateId], ONEJS.reactSetState[stateId]] = React.useState(reactInitialState);
            /* React.useState(initialState): Returns an array with a stateful value, and a function to update it. [state, setState()]
                -initialState: During the initial render, the returned state (state) is the same as the value passed as the first argument (initialState).
                -setState(): The setState function is used to update the state. It accepts a new state value and enqueues a re-render of the component.
            */    
        });
        const initialized = React.useRef();
        if(!initialized.current) {//Sets up the state for the app for the first time
            setupState(state);
            initialized.current = true;
        }
        if(!ONEJS.appTemplate) ONEJS.appTemplate = template();
        const structure = template(); //Template needs to be a function, otherwise the code is executed and the elements are not wrapped by reactCreateElement function
        if(Array.isArray(structure) && structure?.length > 0 && structure?.[0].key == null) {
            return React.createElement(React.Fragment, null, ...structure);//If the structure is an array with missing 'key' property, then destructure the input
        };
        return structure;    
    }

    const AppComponent = React.createElement(appFunction, {state: state, template: template},null);
    if(ONESPECIFICS.os === 'web') {
        const container = document.getElementById('app');
        const reactRoot = ReactDOM.createRoot(container);
        reactRoot.render(AppComponent, container);
    }
    else if(ONESPECIFICS.os === 'ios' || ONESPECIFICS.os === 'android') return AppComponent;
    //AppRegistry.registerComponent("MyApp", () => App); This can be used to register the app
}

//=============================================================================
// WEB THEME: This module aims to provide a unified and predictable way to define
// and inherit styles for components and setup a consistent look and feel for the
// app.
// The principle behind is that everything that can change or be open for customization 
// by the user, should be a theme variable (in web they are converted into CSS variables). 
// Theme variables are given representative names and clustered under 'flavors' which 
// are essentially a specific set of values for those variables. By providing a
// flavor to a components, look and feel can be customized for the theme variables
// the component is implementing.
//
// STEPS to setup app theme on Web:
// 1. Define a theme object containing the different flavors. Always include a
//    'default' flavor. Example:
//    const myTheme: {default: {primaryColor: 'blue'}, error: {primaryColor: 'red'}};
// 2. Define a setup object assigning the theme variables to the target dom elements.
//    const myThemeSetup = {p: {color: themeVariable('primaryColor')}};
// 3. Initialize the app with these two objects and use the theme variables inside
//    your custom components to inherit the look and feel.   
//    app({template: template, theme:myTheme, themeSetup: myThemeSetup});
//    Text({flavor: 'error'})('My Text'); //Use flavor
//
// Native Principles:
//  React components are designed with strong isolation in mind: You should be able to 
//  drop a component anywhere in your application, trusting that as long as the props 
//  are the same, it will look and behave the same way. Text properties that could inherit
//  from outside of the props would break this isolation. https://reactnative.dev/docs/0.65/text
// 
//  Differences from Web
// 1. It is a CSS-like object structure but not CSS, and not compiled to CSS.
// 2. Style structure is flat and properties are limited. Therefore no styling 
//    attributes such as ':hove'. https://reactnative.dev/docs/text-style-props
// 3. Each style must be applied to each components, they are not inherited from their 
//    parent. There is only inheritance from parents of the same element (E.g.: Text to 
//    Text) https://reactnative.dev/docs/text#limited-style-inheritance
// 4. There are no global attributes (body level) and no tag styling 
//    Example: style: {Text: {color: 'blue'}} //This is not possible.
//
// Approaches to define global and reusable theming:
// 1. Create a theme object with all the variables and the values to be used (chosen one)
//    https://www.reactnative.guide/8-styling/8.1-theme-variables.html
// 2. Wrap existing components in a new one that provides them the desired theme  
//    https://stackoverflow.com/questions/35255645/how-to-set-default-font-family-in-react-native
// 3. Use context API to scope and update theme globally.
//    https://medium.com/@matanbobi/react-defaultprops-is-dying-whos-the-contender-443c19d9e7f1
//
// 1. Define a theme object containing the different flavors. Always include a
//    'default' flavor. Example:
//    const myTheme: {default: {primaryColor: 'blue'}, error: {primaryColor: 'red'}};
// 2. Define a setup object assigning the theme variables to the target dom elements.
//    const myThemeSetup = {Text: {color: themeVariable('primaryColor')}};
// 3. Initialize the app with these two objects and use the theme variables inside
//    your custom components to inherit the look and feel.   
//    app({template: template, theme:myTheme, themeSetup: myThemeSetup});
//    Text({flavor: 'error'})('My Text'); //Use flavor
//=============================================================================

/**
* @typedef  {Object}  Flavor          - The configuration assigning a value to each of the theme variables.
* @property {String}  themeVariableId - Assigns to the theme variable 'themeVariableId' the corresponding value.
* @example
*   const myFlavor: {primaryColor: 'blue', radius: '3px', shadow: 'none'};
*/
/** 
* @description Returns all the css theme variables and corresponding values for a certain flavor. Web only.
* @param {Flavor} flavor - The object assigning a value to each of the theme variables.
* @example
* ```javascript 
*   const myFlavor: {primaryColor: 'blue', radius: '3px', shadow: 'none'};
*   readFlavorCSS(myFlavor); //Return {'--one-primaryColor': 'blue', '--one-radius': '3px', '--one-shadow': 'none'}
* ```
* @returns {Object} - The css variables with their corresponding values.
*/
const readFlavorCSS = (flavor) => {
    if(!flavor) {console.error('readFlavorCSS: Incorrect flavor: '+ flavor);return;} //Otherwise the component will set unnecesary data
    const flavorVariables = {};
    Object.entries(flavor).forEach(([key, value]) => {
        if(typeof value === 'string') flavorVariables['--one-' + key] = value;
    });
    return flavorVariables;
}

export const readFlavor = (flavor, theme) => {
    if(!flavor) {console.error('readFlavor: Incorrect flavor: '+ flavor);return {};} 
    if(!theme) theme = ONEJS.theme;
    else {
         Object.entries(theme[flavor]).forEach(([key, value]) => { //Sets up the value of the css variables for the default theme
            theme[flavor][key] = themeVariable(key, value);
        });
    }
    //For web transform into theme variables
    let flavorObject = {};//Used inside EnhancedComponent to read the flavor CSS and add a class with the variable values.
    if(Array.isArray(flavor)) {//Flavor is an array of strings: Increasing priority from left to right
        flavor.forEach((flavor) => {flavorObject = {...flavorObject, ...theme[flavor]} });
        return {...theme['default'], ...flavorObject};
    }

    return ONEJS.theme[flavor] ? {...ONEJS.theme['default'], ...ONEJS.theme[flavor]} : ONEJS.theme['default'];
}

export const defaultFlavor = ONEJS.theme['default'];

/** 
* @description Returns the css variable for the corresponding theme variable name. If a value is provided, also sets the default value.
* Components can have additional themeVariables to the ones defined in the default theme, that opens the possibility to the user to create 
* a flavor to customize certain styles.
* @param {String} variable - The theme variable id.
* @param {String} [value] - The theme variable default value.
* @param {Array<String> | String} [flavor] - The flavor from which to read the theme variable.
* @example
* ```javascript 
*   themeVariable('primaryColor', 'blue'); //Returns 'var(--one-primaryColor, blue)'
*   Component('myComponent', ({...atributes}={}) => {
*       const style = {height: themeVariable('customHeight', '30px')}
*       return Text({style: style, ...attributes})('My Component');
*   }); //User can now create a flavor with 'customHeight' to change the style of the component 
* ```
* @returns {String} - The css variable string with the default value if defined.
*/
export const themeVariable = (variable, value, flavor) => {
    if(!variable) {console.error('themeVariable: "variable" has to be a string indicating the theme variable id.');return;}
    //Web
    if(ONESPECIFICS.os === 'web') return 'var(--one-' + variable + (value ? ', ' + value + ')' : ')');
    //Native
    else if(flavor && typeof flavor === 'string' && ONEJS.theme?.[flavor]) {
        return ONEJS.theme?.[flavor]?.[variable] ?? (ONEJS.theme?.['default']?.[variable] ?? value);
    }
    else if(flavor && Array.isArray(flavor)) {
        for(let i = flavor.length-1; i>= 0; i--) {//Applies flavors with from right (most priority) to left (least priority)
            const flavorItem = flavor[i];
            if(flavorItem && typeof flavorItem === 'string' && ONEJS.theme[flavorItem]) {
                return ONEJS.theme?.[flavorItem]?.[variable] ?? (ONEJS.theme?.['default']?.[variable] ?? value);
            }
        }
    }
    return ONEJS.theme?.['default']?.[variable] ?? value; 
}

/** 
* @description Updates the value of a theme variable globally. This allows to change the look and feel of the app based on user inputs.
* @param {String} variable - The theme variable id.
* @param {String} value - The theme variable value.
* @example
* ```javascript 
*   updateThemeVariable('primaryColor', 'red'); //'primaryColor' is set to red, and all the components using these variable update their style accordingly.
* ```
*/
export const updateThemeVariable = variable => value => {
    //Web
    if(ONESPECIFICS.os === 'web') document.body.setProperty('--one-' + variable, value);
    //Native
    if(ONESPECIFICS.os === 'ios' || ONESPECIFICS.os === 'android') ONEJS.theme['default'][variable] = value;
}

/** 
* @description Using the theme and themeSetup configuration objects creates the css classes and applies then to the DOM objects. 
* The default falvor values are set at body level.
* @param {Theme} theme - If it is a string, the oneJS theme to be used. If a theme object, the collection of flavors with the theme variables.
* @param {Object} themeSetup - The CSS in JS object applying the theme variables to the DOM objects.
* @param {Object} themeCollection - The collection of preset themes provided.
* @example
* ```javascript 
*   const theme = {default: {primaryColor: 'blue'}};
*   const themeSetup = {p: {color: themeVariable('primaryColor')}};
*   setupTheme({theme: theme, themeSetup: themeSetup});
* ```
*/
export const setupTheme = ({theme, themeSetup=oneStyle, themeCollection=oneTheme}={}) => {
    /*There are three options: 
        theme = null/undefined -> No theme is used
        theme = <string value> -> User wants to select one of the collection of themes from the theme collection
        theme = <object value> -> User wants to setup their own themes based on the relevant parameters
    */
    if(!theme) return; //No theme is used
    else if(typeof theme === 'string' && themeCollection[theme]) theme = themeCollection[theme]; //Selects a certain theme from the collection

    //Native
    if(ONESPECIFICS.os === 'ios' || ONESPECIFICS.os === 'android')  {
        ONEJS.theme = theme;
        return;
    }

    //Web
    

    Object.entries(theme).forEach(([flavorId, flavorValue]) => { //Transform each of the themes in css variables stored in a class. This can now be applied to any component
        ONEJS.emotionCSSClasses['flavor'+flavorId] = ONESPECIFICS.css(readFlavorCSS(flavorValue));
        ONEJS.theme[flavorId] = {flavorId: flavorId};
        Object.entries(flavorValue).forEach(([key, value]) => { //Sets up the value of the css variables for the default theme
            ONEJS.theme[flavorId][key] = themeVariable(key, value);
            if(flavorId === 'default') document.documentElement.style.setProperty('--one-' + key, value);
            if(key === 'primaryGradient') ONEJS.iconGradients[themeVariable(key, value)] = cssToSvgGradient(value);
        });
    });
    document.body.classList.add(ONESPECIFICS.css(themeSetup(ONEJS.theme))); //Adds the main css page to the document body
}
export const readGradient = gradientId => {
    return ONEJS?.iconGradients?.[gradientId];
}
export const generateGradient = ({colors, angle=0, locations, svg=false}) => {
    if(!colors || !Array.isArray(colors) || colors.length < 2) {console.error('generateGradient: "colors" array must contain at least two items');return}
    if(!locations) locations = colors.map((color, index) => (index / (colors.length - 1)).toFixed(2));
    else if(locations && locations.length !== colors.length) {console.error('generateGradient: "colors" and "locations" arrays must be the same length.');return}

    if(ONESPECIFICS.os === 'web' && !svg) return 'linear-gradient(' + (90 - angle) + 'deg, ' + colors.join(', ') + ')';//Following the trigonometric circle where the first color is in the origin on the rest in the direction of the angle

    const a = angle * Math.PI / 180;//Input angle is in degrees need to convert to radians
    const k = Math.ceil(Math.sin(45 * Math.PI / 180) * 10000) / 10000;//Sin(45) = cos(45). Rounding up to avoid obtaining x and y greater than 1.
    const start = {x: Math.cos(a) > 0 ? 0 : 1, y: Math.sin(a) > 0 ? 1 : 0};
    const end = {
        x: Math.abs(Math.cos(a)) < k ? +Math.abs(start.x - Math.abs(Math.cos(a))/k).toFixed(2) : Math.abs(start.x - 1),
        y: Math.abs(Math.sin(a)) < k ? +Math.abs(start.y - Math.abs(Math.sin(a))/k).toFixed(2) : Math.abs(start.y - 1)
    };
    if(start.x + end.x !== 1) {const dif = start.x - end.x; start.x = 0.5 + dif / 2; end.x = 0.5 - dif / 2}; //Reposition to the center
    if(start.y + end.y !== 1) {const dif = start.y - end.y; start.y = 0.5 + dif / 2; end.y = 0.5 - dif / 2}; //Reposition to the center

    if(svg) return '<svg style="display:block;width:0;height:0;"><defs><linearGradient id="oneJS" x1="' + start.x + '" y1="' + start.y + '" x2="' + end.x + '" y2="' + end.y + '">' + 
                    locations.map((location, index) => '<stop offset="' + location + '" stop-color="' + colors[index] + '" />').join('') + '</linearGradient></defs></svg>';
    // if(svg) return '<svg style="display:block;width:0;height:0;"><defs><linearGradient id="oneJS" x1="' + start.x * 100 + '%" y1="' + start.y * 100 + '%" x2="' + end.x * 100 + '%" y2="' + end.y * 100 + '%">' + 
    //                 locations.map((location, index) => '<stop offset="' + location * 100 + '%" style="stop-color:' + colors[index] + ';" />') + '</defs></svg>';
    return {colors: colors, locations: locations, start: start, end: end};    
}
export const cssToSvgGradient = gradientString => {
    if(!gradientString) return;
    const data = gradientString.replace('linear-gradient(', '').replace(')', '').replaceAll(' ', '').split('deg,');
    const angle = 90 - parseInt(data[0]);
    const colors = data[1].split(',');
    return generateGradient({colors: colors, angle: angle, svg: true});
}
//The purpose of this module is to generate ios shadows equivalent to the ones generated with Android 'elevation' property
//Shadow does not work well with TouchableOpacity, displays inconsistent opacity
export const generateShadow = (elevation) => {//min elevation 0, max elevation 24. Remove os as input and use internally
    if(!elevation) return {};
    if(typeof elevation !== 'number') {console.error('generateShadow: elevation must be a number.'); return {};}
    if(ONESPECIFICS.os === 'android') return {elevation: elevation};
    else if (ONESPECIFICS.os === 'ios') return {
        shadowColor: 'black',
        shadowOffset: {
            width: 0,
            height: elevationn / 2,
        },
        shadowOpacity: 0.01739 * elevation + 0.1626,//[1-24] => [0.18, 0.58]
        shadowRadius: 0.6956 * elevation + 0.3043,//[1-24] => [1, 16]
    }
    //https://ethercreative.github.io/react-native-shadow-generator/
    //Shadow: horizontal offset, vertical offset, blur, spread, color
    else if(ONESPECIFICS.os === 'web') return '0 ' + elevation / 2 + 'px ' + elevation + 'px ' + elevation / 2 + 'px rgba(0, 0, 0, 0.1)';
    // else if(ONESPECIFICS.os === 'web') return 'rgba(0, 0, 0, 0.2) 0px ' + Math.ceil(10 / 24 * elevation + 1) + 'px ' + Math.floor(14 / 24 * elevation + 1) + 'px ' + Math.ceil(7 / 24 * elevation) + 'px, ' +
    //                'rgba(0, 0, 0, 0.14) 0px ' + Math.round(elevation) + 'px ' + Math.ceil(38 / 24 * elevation) + 'px ' + Math.round(3 / 24 * elevation) + 'px, ' +
    //                'rgba(0, 0, 0, 0.12) 0px ' + Math.round(9 / 24 * elevation) + 'px ' + Math.floor(44 / 24 * elevation) + 'px ' + Math.round(8 / 24 * elevation) + 'px'

    return {};
}
export const mergeStyles = (...styles) => {
    //Array merge
    // let finalStyle = [];
    // styles?.forEach(style => {
    //     if(Array.isArray(style)) finalStyle = [...finalStyle, ...style];
    //     else if(style && typeof style === 'object') finalStyle.push(style);
    // });
    // return finalStyle;
    //Object merge
    let finalStyle = {};
    styles?.forEach((style) => {
        if(Array.isArray(style)) style.forEach(styleObj => {if(styleObj && typeof styleObj === 'object') finalStyle = {...finalStyle, ...styleObj};});
         else if(style && typeof style === 'object') finalStyle = {...finalStyle, ...style};
    });
    return finalStyle;
}


/**
* @typedef  {Theme}   Theme                    - A collection of flavors, assigning a value to each of the theme variables.
* @property {Object}  default                  - The default flavor to be applied if none are specified. It is required for every theme.
* @property {String}  default.themeVariable    - For the default flavor, assigns to the theme variable 'themeVariableId' the corresponding value.
* @property {Object}  [flavorId]               - The configuration assigning a value to each of the theme variables.
* @property {String}  [flavorId.themeVariable] - Assigns to the theme variable 'themeVariableId' the corresponding value.
* @example
*   const myTheme: {default: {primaryColor: 'blue'}, success: {primaryColor: 'green'}, error: {primaryColor: 'red'}};
*/

/**
* @description The object containing the preset bundle of themes. These define a set of theme variables and their values for each flavor.
*   -Root Level (Theme): Defines themes (flavor collection). This is only used by one to provide multiple themes, users must skip this level.
*   -Level 1 (Flavor): Defines flavors. "default" flavor always has to be provided. E.g: warning, success, default
*   -Level 2 (Variable): Assigns to the theme variable a value. E.g: primaryColor: 'blue'
* @type {Object}
*/
export const oneTheme = {
    oneJS: { //Theme name
        default: { //Flavor name
            //The idea is to have as few parameters as possible so that all components use these paremeters and you are able to customize them with your own flavor.
            //E.g. your texts and your inputs use 'textFont, then you are able to create a 'input' flavor to customize only inputs.
            // primaryColor: '#0077ff', //primary
            background: '#ffffff',//contrast
            neutralColor: '#D9DADC',//#D9DADC #9ba8a7
            primaryColor: 'linear-gradient(180deg, red, yellow)',

            //All the plain text within your components
            textFont: 'Arial, sans-serif',
            textColor: '#666',
            textsSize: '100%',

            headerFont: 'Arial, sans-serif',
            headerColor: '#333',
            headerSize: '120%',

            //It is not meant to be the title font for your app
            titleFont: 'Arial, sans-serif',
            titleColor: '#333',
            titleSize: '140%',

            radius: '3px',
            border: 'none',
            inputBorder: '1px solid #D9DADC',
            shadow: 'none',
        },
        reverse: {
            primaryColor: '#ffffff',
            background: '#0099ff',
        },
        outline: { //For outlined icons and buttons
            fill: 'none',//Transparent
            primaryColor: '#ffffff',
            background: '#0099ff',
            border: '2px solid #0099ff',
        },
        shadow: {
            shadow: '0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.19)',
        },
        noShadow: {
            shadow: 'none',
        },
        noBorder: {
            border: 'none',
        },
        flat: {
            shadow: 'none',
            border: 'none',
            radius: '0px'
        }
    }
};

export const readStyle = styleId => {
    return ONEJS?.style?.[styleId];
}

/**
* @description The object containing the global CSS applying the theme variables to customize the DOM objects. The root level is directly applied to the document body.
* @type {Object}
* @example
* const themeSetup = {p: {color: themeVariable('primaryColor')}};
*/
export const oneThemeSetup = {
    //These styles get placed on the Document 'body' element
    fontFamily: themeVariable('textFont'),
    fontSize: themeVariable('textSize'),
    color: themeVariable('textColor'),
    margin: 0,
    minHeight: '100vh',
    display: 'flex',               //Flexbox is the positioning being used
    flexWrap: 'wrap',              //We want items to fall into a different row once exhausted the space on the parent
    flexGrow: '0',                 //It indicates how much they expand horizontally. By default we don't want it to grow
    flexShrink: '0',               //We don't want items to go smaller than their original width
    flexDirection: 'column',       //Row or column
    justifyContent: 'flex-start',  //Horizontal alignment of the items
    alignItems: 'stretch',         //Vertical alignment of the items
    alignContent: 'stretch',       //Vertical alignment of the items   

    p: {
        fontFamily: themeVariable('textFont'),
        fontSize: themeVariable('textSize'),
        color: themeVariable('textColor'),
        //Code below could be used to enable gradient text
        // background: themeVariable('textColor'),
        // backgroundClip: 'text';
        // textFillColor: 'transparent';
    },
    button: {
        background: themeVariable('primaryColor'),
        color: themeVariable('backgroundColor'),
        fontFamily: themeVariable('textFont'),
        fontSize: themeVariable('textSize'),
        border: themeVariable('border'),
        borderRadius: themeVariable('radius'),
        boxShadow: themeVariable('shadow'),
        // minHeight: 30,
        padding: '10px 15px',
        textDecoration: 'none',
        transitionDuration: '0.4s',
        cursor: 'pointer',
        
        ':hover': {
            filter: 'brightness(110%)',
        },
        ':active': {
            filter: 'brightness(90%)',
        },
        ':focus': {
            outline: 'none',
        },
        '.disabled':  {
          opacity: 0.6,
          cursor: 'not-allowed',
        },
    },
    select: {
        // appearance: 'none',
        color: themeVariable('textColor'),
        fontFamily: themeVariable('textFont'),
        fontSize: themeVariable('textSize'),
        border: themeVariable('inputBorder'),
        borderRadius: themeVariable('radius'),
        boxShadow: themeVariable('shadow'),
        background: 'white',
        padding: '5px 15px', //only for certain elements
        textDecoration: 'none',
        transitionDuration: '0.4s',
        minHeight: 25,
        cursor: 'pointer',
        ':hover': {
        },
        ':focus': {
            outline: 'none',
            borderColor: themeVariable('primaryColor'),
        },
        '& option:checked': {
        },
        '& option': {
        }
    },
    textarea: {
        color: themeVariable('textColor'),
        fontFamily: themeVariable('textFont'),
        fontSize: themeVariable('textSize'),
        border: themeVariable('inputBorder'),
        borderRadius: themeVariable('radius'),
        boxShadow: themeVariable('shadow'),
        background: 'white',
        padding: '10px 15px', 
        resize: 'none',
        overflow: 'auto',
    },
    input: {
        color: themeVariable('textColor'),
        fontFamily: themeVariable('textFont'),
        fontSize: themeVariable('textSize'),
        boxShadow: themeVariable('shadow'),
        borderRadius: themeVariable('radius'),
        transitionDuration: '0.4s',
        cursor: 'pointer',
        textDecoration: 'none',
        
        '&:not([type]), &[type=color], &[type=date], &[type=datetime-local], &[type=email], &[type=file], &[type=image], &[type=month], &[type=number], &[type=password], &[type=search], &[type=tel], &[type=text], &[type=time], &[type=url], &[type=week]': {
            border: themeVariable('inputBorder'),
            minHeight: 25,
            background: 'white',
            padding: '5px 15px',
            '&::placeholder': { color: themeVariable('neutralColor'), },
            ':focus': {
                outline: 'none',
                borderColor: themeVariable('primaryColor'),
            }, 
        },
        '&[type=radio]': {
            //There's no way of styling it. Best approach is to hide it and style label instead (E.g.: https://codepen.io/ainalem/pen/QzogPe)
        },
        '&[type=button], &[type=reset], &[type=submit]': {
            background: themeVariable('primaryColor'),
            color: themeVariable('backgroundColor'),
            fontFamily: themeVariable('textFont'),
            fontSize: themeVariable('textSize'),
            border: themeVariable('border'),
            borderRadius: themeVariable('radius'),
            boxShadow: themeVariable('shadow'),
            // minHeight: 30,
            padding: '10px 15px',
            textDecoration: 'none',
            transitionDuration: '0.4s',
            cursor: 'pointer',
            ':hover': {
                filter: 'brightness(110%)',
            },
            ':active': {
                filter: 'brightness(90%)',
            },
            ':focus': {
                outline: 'none',
            },
            '.disabled':  {
              opacity: 0.6,
              cursor: 'not-allowed',
            },
        },
        '::-webkit-file-upload-button, ::-ms-browse': {
            background: themeVariable('primaryColor'),
            color: themeVariable('backgroundColor'),
            fontSize: themeVariable('textSize'),
            border: themeVariable('border'),
            borderRadius: themeVariable('radius'),
            boxShadow: themeVariable('shadow'),
            // minHeight: 30,
            padding: '10px 15px',
            textDecoration: 'none',
            transitionDuration: '0.4s',
            cursor: 'pointer',
        },
   
    },
    'input[type="checkbox"]': {
        position: 'relative',
        appearance: 'none',
        outline: 'none',
        width: '50px',
        height: '30px',
        background: '#fff',
        border: '1px solid #D9DADC',
        borderRadius: '50px',
        boxShadow: 'inset -20px 0 0 0 #fff',
        transitionDuration: '0.4s',
        ':after': {
            'content': '""',
            position: 'absolute',
            top: '1px',
            left: '1px',
            background: 'transparent',
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            boxShadow: '2px 4px 6px rgba(0,0,0,0.2)',
        },
        '&:checked': {
            boxShadow: 'inset 20px 0 0 0 ' + themeVariable('primaryColor'),
            borderColor: themeVariable('primaryColor'),
        },
        '&:checked:after': {
            left: '20px',
            boxShadow: '-2px 4px 3px rgba(0,0,0,0.05)',
        },
        ':focus': {
            outline: 'none',
            borderColor: themeVariable('primaryColor'),
        },
    },
    'input[type="range"]': {
        padding: 0,
        appearance: 'none',
        width: '100%',
        height: '2px',
        border: 'none',
        borderRadius: '5px',
        background: themeVariable('primaryColor'),
        outline: 'none',
        opacity: '0.7',
        //WebkitTransition: '.2s',
        transition: 'opacity .2s',
        '&:hover': {
            opacity: 1,
        },
        '&::-webkit-slider-thumb': {
            appearance: 'none',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'white',
            cursor: 'pointer',
            boxShadow: '2px 4px 6px rgba(0,0,0,0.2)',
        },
        '&::-moz-range-thumb': {
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: 'white',
            cursor: 'pointer',
        },
    }  
}

/**
* @description The object containing the global CSS applying the theme variables to customize the DOM objects. The root level is directly applied to the document body.
* @type {Object}
* @example
* const themeSetup = {p: {color: themeVariable('primaryColor')}};
*/
 const oneStyle = (theme) => {
    return {
        //These styles get placed on the Document 'body' element
        fontFamily: readFlavor('default').textFont,
        fontSize: readFlavor('default').textSize,
        color: readFlavor('default').textColor,
        margin: 0,
        minHeight: '100vh',
        display: 'flex',               //Flexbox is the positioning being used
        flexWrap: 'wrap',              //We want items to fall into a different row once exhausted the space on the parent
        flexGrow: '0',                 //It indicates how much they expand horizontally. By default we don't want it to grow
        flexShrink: '0',               //We don't want items to go smaller than their original width
        flexDirection: 'column',       //Row or column
        justifyContent: 'flex-start',  //Horizontal alignment of the items
        alignItems: 'stretch',         //Vertical alignment of the items
        alignContent: 'stretch',       //Vertical alignment of the items   

        p: {
            fontFamily: readFlavor('default').textFont,
            fontSize: readFlavor('default').textSize,
            color: readFlavor('default').textGradient ? 'transparent' : readFlavor('default').textColor,
            //Code below could be used to enable gradient text
            background: readFlavor('default').textGradient ?? 'none',
            backgroundClip: readFlavor('default').textGradient ? 'text' : undefined,
            // textFillColor: 'transparent';
        },
        button: {
            background: readFlavor('default').primaryGradient ?? readFlavor('default').primaryColor,
            color: readFlavor('default').backgroundColor,
            fontFamily: readFlavor('default').textFont,
            fontSize: readFlavor('default').textSize,
            border: readFlavor('default').border,
            borderRadius: readFlavor('default').radius,
            boxShadow: readFlavor('default').shadow,
            // minHeight: 30,
            padding: '10px 15px',
            textDecoration: 'none',
            transitionDuration: '0.4s',
            cursor: 'pointer',
            
            ':hover': {
                filter: 'brightness(110%)',
            },
            ':active': {
                filter: 'brightness(90%)',
            },
            ':focus': {
                outline: 'none',
            },
            '.disabled':  {
              opacity: 0.6,
              cursor: 'not-allowed',
            },
        },
        select: {
            // appearance: 'none',
            color: readFlavor('default').textColor,
            fontFamily: readFlavor('default').textFont,
            fontSize: readFlavor('default').textSize,
            border: readFlavor('default').inputBorder,
            borderRadius: readFlavor('default').radius,
            boxShadow: readFlavor('default').shadow,
            background: 'white',
            padding: '5px 15px', //only for certain elements
            textDecoration: 'none',
            transitionDuration: '0.4s',
            minHeight: 25,
            cursor: 'pointer',
            ':hover': {
            },
            ':focus': {
                outline: 'none',
                borderColor: readFlavor('default').primaryColor,
            },
            '& option:checked': {
            },
            '& option': {
            }
        },
        textarea: {
            color: readFlavor('default').textColor,
            fontFamily: readFlavor('default').textFont,
            fontSize: readFlavor('default').textSize,
            border: readFlavor('default').inputBorder,
            borderRadius: readFlavor('default').radius,
            boxShadow: readFlavor('default').shadow,
            background: 'white',
            padding: '10px 15px', 
            resize: 'none',
            overflow: 'auto',
        },
        input: {
            color: readFlavor('default').textColor,
            fontFamily: readFlavor('default').textFont,
            fontSize: readFlavor('default').textSize,
            boxShadow: readFlavor('default').shadow,
            borderRadius: readFlavor('default').radius,
            transitionDuration: '0.4s',
            cursor: 'pointer',
            textDecoration: 'none',
            
            '&:not([type]), &[type=color], &[type=date], &[type=datetime-local], &[type=email], &[type=file], &[type=image], &[type=month], &[type=number], &[type=password], &[type=search], &[type=tel], &[type=text], &[type=time], &[type=url], &[type=week]': {
                border: readFlavor('default').inputBorder,
                minHeight: 25,
                background: 'white',
                padding: '5px 15px',
                '&::placeholder': { color: readFlavor('default').neutralColor, },
                ':focus': {
                    outline: 'none',
                    borderColor: readFlavor('default').primaryColor,
                }, 
            },
            '&[type=radio]': {
                //There's no way of styling it. Best approach is to hide it and style label instead (E.g.: https://codepen.io/ainalem/pen/QzogPe)
            },
            '&[type=button], &[type=reset], &[type=submit]': {
                background: readFlavor('default').primaryGradient ?? readFlavor('default').primaryColor,
                color: readFlavor('default').backgroundColor,
                fontFamily: readFlavor('default').textFont,
                fontSize: readFlavor('default').textSize,
                border: readFlavor('default').border,
                borderRadius: readFlavor('default').radius,
                boxShadow: readFlavor('default').shadow,
                // minHeight: 30,
                padding: '10px 15px',
                textDecoration: 'none',
                transitionDuration: '0.4s',
                cursor: 'pointer',
                ':hover': {
                    filter: 'brightness(110%)',
                },
                ':active': {
                    filter: 'brightness(90%)',
                },
                ':focus': {
                    outline: 'none',
                },
                '.disabled':  {
                  opacity: 0.6,
                  cursor: 'not-allowed',
                },
            },
            '::-webkit-file-upload-button, ::-ms-browse': {
                background: readFlavor('default').primaryGradient ?? readFlavor('default').primaryColor,
                color: readFlavor('default').backgroundColor,
                fontSize: readFlavor('default').textSize,
                border: readFlavor('default').border,
                borderRadius: readFlavor('default').radius,
                boxShadow: readFlavor('default').shadow,
                // minHeight: 30,
                padding: '10px 15px',
                textDecoration: 'none',
                transitionDuration: '0.4s',
                cursor: 'pointer',
            },
       
        },
        'input[type="checkbox"]': {
            position: 'relative',
            appearance: 'none',
            outline: 'none',
            width: '50px',
            height: '30px',
            background: '#fff',
            border: '1px solid #D9DADC',
            borderRadius: '50px',
            boxShadow: 'inset -20px 0 0 0 #fff',
            transitionDuration: '0.4s',
            ':after': {
                'content': '""',
                position: 'absolute',
                top: '1px',
                left: '1px',
                background: 'transparent',
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                boxShadow: '2px 4px 6px rgba(0,0,0,0.2)',
            },
            '&:checked': {
                boxShadow: 'inset 20px 0 0 0 ' + readFlavor('default').primaryColor,
                borderColor: readFlavor('default').primaryColor,
            },
            '&:checked:after': {
                left: '20px',
                boxShadow: '-2px 4px 3px rgba(0,0,0,0.05)',
            },
            ':focus': {
                outline: 'none',
                borderColor: readFlavor('default').primaryColor,
            },
        },
        'input[type="range"]': {
            padding: 0,
            appearance: 'none',
            width: '100%',
            height: '2px',
            border: 'none',
            borderRadius: '5px',
            background: readFlavor('default').primaryColor,
            outline: 'none',
            opacity: '0.7',
            //WebkitTransition: '.2s',
            transition: 'opacity .2s',
            '&:hover': {
                opacity: 1,
            },
            '&::-webkit-slider-thumb': {
                appearance: 'none',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'white',
                cursor: 'pointer',
                boxShadow: '2px 4px 6px rgba(0,0,0,0.2)',
            },
            '&::-moz-range-thumb': {
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'white',
                cursor: 'pointer',
            },
        }  
    };
}