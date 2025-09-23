import { backendApi } from './backendApi';
import { firestore, auth } from './firebase';
import { 
    collection, 
    addDoc, 
    query, 
    orderBy, 
    onSnapshot, 
    where,
    serverTimestamp
} from 'firebase/firestore';

let currentChatId = null;

// Create new chat session (this will be called when user uploads a file)
export const createNewChat = async (file) => {
    try {
        const response = await backendApi.uploadFile(file);
        currentChatId = response.chat_id;
        
        // Also save to Firestore for UI purposes
        //const user = auth.currentUser;
        //if (user) {
        //    await addDoc(collection(firestore, 'chatSessions'), {
        //        userId: user.uid,
        //        chatId: currentChatId,
        //        fileName: file.name,
        //        createdAt: serverTimestamp(),
        //        lastMessage: 'File uploaded successfully'
        //    });
        //}
        
        return { success: true, chatId: currentChatId, message: response.msg };
    } catch (error) {
        console.error('Error creating new chat:', error);
        return { success: false, error: error.message };
    }
};

// Get current chat ID
export const getCurrentChatId = () => {
    return currentChatId;
};

// Set current chat ID (when user selects a conversation)
export const setCurrentChatId = (chatId) => {
    currentChatId = chatId;
};

// Send message to backend
export const sendMessageToBackend = async (message) => {
  try {
    if (!currentChatId) {
      throw new Error('No active chat session. Please upload a file first.');
    }
    console.log(message);
    console.log(currentChatId);
    const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

    const response = await fetch(`${API_URL}/chat?chat_id=${currentChatId}&question=${encodeURIComponent(message)}`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
  }
});


    if (!response.ok) {
      // Try to parse JSON error message, but fallback if empty
      let errMsg = 'Failed to send message';
      try {
        const errData = await response.json();
        errMsg = errData.detail || errMsg;
      } catch {}
      throw new Error(errMsg);
    }

    const data = await response.json();
    return { success: true, answer: data.answer };

  } catch (error) {
    console.error('Error sending message:', error);
    return { success: false, error: error.message };
  }
};



// Save chat message to Firestore for UI
export const saveChatMessage = async (message, response) => {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');

        const chatData = {
            userId: user.uid,
            userEmail: user.email,
            message: message,
            response: response,
            timestamp: serverTimestamp(),
            chatId: currentChatId,
            type: 'backend_chat'
        };

        const docRef = await addDoc(collection(firestore, 'chatMessages'), chatData);
        console.log('Message saved with ID:', docRef.id);
        return { id: docRef.id, ...chatData };
    } catch (error) {
        console.error('Error saving chat message:', error);
        throw error;
    }
};

// Get current chat history from Firestore
export const getCurrentChatHistory = (callback) => {
    try {
        const user = auth.currentUser;
        if (!user) throw new Error('User not authenticated');

        if (!currentChatId) {
            callback([]);
            return () => {};
        }

        const q = query(
            collection(firestore, 'chatMessages'),
            where('userId', '==', user.uid),
            where('chatId', '==', currentChatId),
            orderBy('timestamp', 'asc')
        );

        return onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            callback(messages);
        });
    } catch (error) {
        console.error('Error getting current chat history:', error);
        throw error;
    }
};

// Get all chat sessions from Firestore
// assuming your backend is running at some BASE_URL
const BASE_URL = 'http://127.0.0.1:8000';
export const getAllConversations = async (callback) => {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const token = await user.getIdToken();

  const res = await fetch(`${BASE_URL}/get_conversations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to fetch conversations');
  }

  const data = await res.json();
  callback(data.conversations);
  return () => {};
};



export const loadConversation = async (chatId, callback) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    currentChatId = chatId;

    // get Firebase ID token for Authorization header
    const token = await user.getIdToken();

    const res = await fetch(`${BASE_URL}/get_chat_by_id?chat_id=${chatId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to load conversation');
    }

    const data = await res.json();
    // data.messages is your [{type:'human',text:'…'}, {type:'ai',text:'…'}] list
    callback(data.messages);
  } catch (error) {
    console.error('Error loading conversation:', error);
    throw error;
  }
};


// Create new conversation (for UI purposes)
export const createNewConversation = () => {
    currentChatId = null;
    return currentChatId;
};