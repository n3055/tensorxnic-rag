import { Link } from "react-router-dom";
import { doSignOut } from "../services/auth";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { getAllConversations, loadConversation, createNewConversation } from "../services/chatService";
import { useAuth } from "../context/AuthContext";

export default function SidebarLeft(){
    const { currentUser } = useAuth();
    const [conversations, setConversations] = useState([]);
    const navigate = useNavigate();
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleLogout = async () => {
        if (!isLoggingOut) {
            setIsLoggingOut(true);
            try {
                await doSignOut();
                navigate("/login");
            } catch (error) {
                console.error("Logout error:", error);
                setIsLoggingOut(false);
            }
        }
    };

    const handleNewChat = () => {
        createNewConversation();
        window.dispatchEvent(new CustomEvent('newChatCreated'));
    };

    const handleConversationClick = (conversationId) => {
        loadConversation(conversationId, () => { });
        window.dispatchEvent(new CustomEvent('conversationSelected', {
            detail: { conversationId }
        }));
    };

    useEffect(() => {
        if (currentUser) {
            const unsubscribe = getAllConversations((allConversations) => {
                setConversations(allConversations);
            });
            
            return () => {
    if (typeof unsubscribe === 'function') unsubscribe();
  };
        }
    }, [currentUser]);

    const formatTimestamp = (timestamp) => {
        if (!timestamp?.toDate) return '';
        const date = timestamp.toDate();
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    };

    return(
        <div className="h-full p-4 flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-white">Chat History</h2>
                <button 
                    onClick={handleNewChat}
                    className="text-sm bg-[#4C82FB] px-3 py-1 rounded hover:bg-blue-600"
                >
                    New Chat
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                    <div className="text-gray-400 text-sm text-center mt-8">
                        No conversations yet
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {conversations.map((conv) => (
                            <li 
                                key={conv.id}
                                onClick={() => handleConversationClick(conv.id)}
                                className="p-3 rounded-lg bg-[#1c1c1c] hover:border hover:border-[#4C82FB] cursor-pointer"
                            >
                                <div className="text-sm text-white truncate">
                                    {conv.lastMessage}
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="text-xs text-gray-400">
                                        {conv.messageCount} messages
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {formatTimestamp(conv.timestamp)}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="mt-auto pt-4 border-t border-gray-700">
                <button 
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                    className="flex items-center justify-center w-full p-3 rounded-lg bg-[#1c1c1c] 
                               text-gray-300 hover:bg-[#2c2c2c] hover:text-white transition-all duration-200
                               border border-transparent hover:border-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoggingOut ? "Logging out..." : "Logout"}
                </button>
            </div>
        </div>
    )
}