import { auth } from './firebase';

const API_BASE_URL = 'http://127.0.0.1:8000';

// Helper function to get Firebase ID token
const getAuthToken = async () => {
  const user = auth.currentUser;
  if (user) {
    return await user.getIdToken();
  }
  return null;
};

// Helper function to make authenticated requests
const makeAuthenticatedRequest = async (url, options = {}) => {
  const token = await getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
  }

  return response.json();
};

export const backendApi = {
  // Test connection
  testConnection: async () => {
    const response = await fetch(`${API_BASE_URL}/public`);
    return response.json();
  },

  // Upload file and create chat session
  uploadFile: async (file) => {
    const token = await getAuthToken();
    
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/UploadFile`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  // Send chat message
  sendMessage: async (chatId, question) => {
    return makeAuthenticatedRequest('/chat', {
      method: 'POST',
      body: JSON.stringify({
        chat_id: chatId,
        question: question,
      }),
    });
  },

  // Get all chat IDs for user
  getChatIds: async () => {
    return makeAuthenticatedRequest('/get_chat_ids', {
      method: 'POST',
    });
  },

  // Get specific chat history
  getChatHistory: async (chatId) => {
    return makeAuthenticatedRequest(`/get_chat_by_id?chat_id=${chatId}`, {
      method: 'POST',
    });
  },
};