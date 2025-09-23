from datetime import datetime
from typing import List, Literal
from fastapi import FastAPI, Depends, HTTPException, status, Request, UploadFile, File
from fastapi.security import HTTPBearer
from firebase_admin import auth, credentials, initialize_app, firestore
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from fastapi.middleware.cors import CORSMiddleware
from chatbot import RAGChatbot
from langchain_core.messages import HumanMessage,AIMessage

origins = [
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://localhost:5500",
    "http://127.0.0.1:8000",
    "http://localhost:5173",  # Add this for frontensd
    "http://127.0.0.1:5173",  
]

cred = credentials.Certificate("fb.json")  # service account key
initialize_app(cred)
db = firestore.client()
# Init FastAPI + Rate Limiter
limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.state.limiter = limiter

security = HTTPBearer()
# Add new user chat
def create_chat(user_id, chat_id, first_message, file_name=None):
    chat_ref = db.collection("users").document(user_id).collection("chats").document(str(chat_id))
    chat_ref.set({
        "fileName": file_name,
        "createdAt": datetime.utcnow(),
        "lastMessage": first_message,
        "messageCount": 1,
        "messages": [{"type": "human", "text": first_message}]
    })


# Query chat messages
def get_chat(user_id, chat_id):
    chat_ref = db.collection("users").document(user_id).collection("chats").document(str(chat_id))
    doc = chat_ref.get()
    return doc.to_dict()["messages"] if doc.exists else None

# Append a new message to chat
def append_message(user_id, chat_id, message):
    chat_ref = db.collection("users").document(user_id).collection("chats").document(str(chat_id))
    doc = chat_ref.get()
    if doc.exists:
        data = doc.to_dict()
        messages = data.get("messages", [])
        messages.append(message)
        chat_ref.update({
            "messages": messages,
            "lastMessage": message["text"],
            "messageCount": len(messages)
        })
    else:
        chat_ref.set({
            "messages": [message],
            "lastMessage": message["text"],
            "messageCount": 1,
            "createdAt": datetime.utcnow()
        })

#create_chat("jsadbfk","sdjfbsjkd","Wabalabadubdub")
#append_message("jsadbfk","sdjfbsjkd",{"type": "ai", "text": "Hello from AI"})
#print(get_chat("jsadbfk","sdjfbsjkd"))
# Auth dependency
async def verify_token(request: Request, token: str = Depends(security)):
    try:
        decoded_token = auth.verify_id_token(token.credentials)
        request.state.user = decoded_token
        return decoded_token
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

@app.get("/public")
async def public():
    return {"msg": "Anyone can see this"}

@app.post("/UploadFile")
@limiter.limit("5/minute")   # rate limiting (20 requests per minute)
async def new_chat(file: UploadFile, request: Request, user=Depends(verify_token)):
    try:
        contents = await file.read()
        with open(f"uploads/{file.filename}", "wb") as f:
            f.write(contents)
        chat_id= request.state.user['uid']+"_"+datetime.now().strftime("%Y%m%d-%H%M%S")
        chatbot = RAGChatbot(f"uploads/{file.filename}",chat_id)
        create_chat(
            request.state.user['uid'],
            chat_id,
            "Hi",
            file.filename
        )
        append_message(request.state.user['uid'], chat_id, {"type": "ai", "text": "Hello! How can I assist you today?"})
        return {"msg": f"File '{file.filename}' uploaded and chatbot initialized.","chat_id":chat_id}
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
    
@app.post("/chat")
@limiter.limit("20/minute")   # rate limiting (20 requests per minute)
async def chat(request: Request, user=Depends(verify_token), chat_id: str = "", question: str = ""):
    if not chat_id or not question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="chat_id and question are required parameters.",
        )
    try:
        chatbot = RAGChatbot("",chat_id)  # PDF path is not needed here
        mem_chat = []
        json_chat = get_chat(request.state.user['uid'], chat_id)
        for msg in json_chat:
            if msg["type"] == "human":
                mem_chat.append(HumanMessage(content=msg["text"]))
            else:
                mem_chat.append(AIMessage(content=msg["text"]))
        response = chatbot.invoke(question,mem_chat)
        append_message(request.state.user['uid'], chat_id, {"type": "human", "text": question})
        append_message(request.state.user['uid'], chat_id, {"type": "ai", "text": response})
        return {"answer": response}
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

@app.post("/get_conversations")
@limiter.limit("20/minute")
async def get_conversations(request: Request, user=Depends(verify_token)):
    try:
        chats_ref = db.collection("users").document(request.state.user['uid']).collection("chats")
        docs = chats_ref.stream()

        conversations = []
        for doc in docs:
            data = doc.to_dict()
            conversations.append({
                "id": doc.id,
                "fileName": data.get("fileName"),
                "lastMessage": data.get("lastMessage"),
                "timestamp": data.get("createdAt"),
                "messageCount": data.get("messageCount", 0)
            })
        return {"conversations": conversations}
    except RateLimitExceeded:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

    
@app.post("/get_chat_by_id")
@limiter.limit("20/minute")   # rate limiting (20 requests per minute)
async def chat(request: Request, user=Depends(verify_token)):
    chat_id: str = request.query_params.get("chat_id", "")
    if not chat_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="chat_id is a required parameter.",
        )
    try:
        messages = get_chat(request.state.user['uid'], chat_id)
        return {"messages": messages}
    except RateLimitExceeded as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
    