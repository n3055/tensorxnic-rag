import { useState, useEffect, useRef } from 'react';
import { saveChatMessage, getCurrentChatHistory, createNewConversation, loadConversation, sendMessageToBackend } from '../services/chatService';
import { useAuth } from '../context/AuthContext';

export default function ChatWindow() {
    const { currentUser } = useAuth();
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    useEffect(() => {
        if (currentUser) {
            const unsubscribe = getCurrentChatHistory((chatMessages) => {
                setMessages(chatMessages);
            });
            return () => unsubscribe();
        }
    }, [currentUser]);

    useEffect(() => {
        const handleNewChat = () => {
            setMessages([]);
            createNewConversation();
        };

        const handleConversationSelect = (event) => {
            const { conversationId } = event.detail;
            
            loadConversation(conversationId, (conversationMessages) => {
                setMessages(conversationMessages);
            });
        };

        window.addEventListener('newChatCreated', handleNewChat);
        window.addEventListener('conversationSelected', handleConversationSelect);
        return () => {
            window.removeEventListener('newChatCreated', handleNewChat);
            window.removeEventListener('conversationSelected', handleConversationSelect);
        };
    }, []);

    const handleSendMessage = async (e) => {
  e.preventDefault();

  if (!inputMessage.trim() || isLoading) return;

  const userMessage = inputMessage.trim();
  setInputMessage('');
  setIsLoading(true);

  try {
    // Optimistically add the user message to UI
    setMessages(prev => [...prev, { type: 'human', text: userMessage }]);

    // Call backend
    const result = await sendMessageToBackend(userMessage);

    if (result.success) {
      // Append AI response to UI
      setMessages(prev => [...prev, { type: 'ai', text: result.answer }]);
      // Optionally persist to Firestore
      // await saveChatMessage(userMessage, result.answer);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Error sending message:', error);
    alert('Error: ' + error.message);
  } finally {
    setIsLoading(false);
  }
};

    return (
        <div className="h-full flex flex-col bg-[#0f0f0f]">
            <div className="p-4 border-b border-gray-800">
                <h2 className="text-xl font-semibold text-white">Research Assistant</h2>
                <p className="text-sm text-gray-400">Upload a PDF to start chatting with your documents</p>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-400 mt-8">
                        <p>Upload a PDF file to start a conversation!</p>
                    </div>
                ) : (
            <div className="space-y-4">
              {messages.map((msg, index) => (
                msg.type === 'human' ? (
                  <div key={index} className="flex justify-end">
                    <div className="bg-[#4C82FB] text-white p-3 rounded-lg max-w-[70%]">
                      <p className="text-sm">{msg.text}</p>
                    </div>
                  </div>
                ) : (
                  <div key={index} className="flex justify-start">
                    <div className="bg-[#1c1c1c] text-white p-3 rounded-lg max-w-[70%]">
                      <p className="text-sm">{msg.text}</p>
                    </div>
                  </div>
                )
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#1c1c1c] text-white p-3 rounded-lg max-w-[70%]">
                    <p className="text-sm">AI is thinking...</p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

                            )}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-800">
                <div className="flex space-x-2">
                    <input
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder="Type a message..."
                        disabled={isLoading}
                        className="flex-1 p-3 rounded-md bg-[#1c1c1c] border border-gray-600 text-white
                                 focus:border-[#4C82FB] focus:outline-none disabled:opacity-50"
                    />
                    <button 
                        type="submit"
                        disabled={isLoading || !inputMessage.trim()}
                        className="px-6 py-2 bg-[#4C82FB] text-white rounded-md 
                                 hover:bg-blue-600 transition disabled:opacity-50"
                    >
                        Send
                    </button>
                </div>
            </form>
        </div>
    );
}