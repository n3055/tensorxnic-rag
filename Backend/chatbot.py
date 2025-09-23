import os
import getpass
from typing import List, TypedDict, Annotated

from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, BaseMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langgraph.graph import START, StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph.message import add_messages

# --- CONFIGURATION ---
# Please ensure this PDF file exists in the same directory as the script.
PDF_FILE_PATH = "../example_data/nke-10k-2023.pdf"
PERSIST_DIRECTORY = "./chroma_langchain_db_nike"
EMBEDDING_MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
LLM_MODEL_NAME = "gemini-1.5-flash"

class RAGChatbot:
    """
    Encapsulates the entire RAG pipeline, ensuring models are loaded only once.
    This version is updated to maintain conversation history correctly.
    """
    def __init__(self,PDF_FILE_PATH,chat_id):
        self.PDF_FILE_PATH=PDF_FILE_PATH
        self.chat_id=chat_id
        self._setup_api_keys()
        self.memory = MemorySaver()
        self.llm = ChatGoogleGenerativeAI(model=LLM_MODEL_NAME, temperature=0)
        self.embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL_NAME)
        self.vector_store = self._get_vector_store()
        self.graph = self._build_graph()
        
        # Each conversation should have a unique ID. For this example, we'll use a fixed ID.
        # In a real app, this should be dynamic (e.g., per user or session).
        self.config = {"configurable": {"thread_id": "1"}}
        print("RAG Chatbot initialized successfully.")

    def _setup_api_keys(self):
        """Loads API keys from .env file or prompts the user."""
        load_dotenv()
        if not os.environ.get("GOOGLE_API_KEY"):
            os.environ["GOOGLE_API_KEY"] = getpass.getpass("Enter API key for Google Gemini: ")

    def _get_vector_store(self) -> Chroma:
        """Loads vector store from disk or creates it if it doesn't exist."""
        if os.path.exists("vector_stores/"+str(self.chat_id)):
            print(f"Loading existing vector store from {PERSIST_DIRECTORY}...")
            return Chroma(
                persist_directory="vector_stores/"+str(self.chat_id),
                embedding_function=self.embeddings
            )

        print(f"Creating new vector store from {self.PDF_FILE_PATH}...")
        if not os.path.exists(self.PDF_FILE_PATH):
             raise FileNotFoundError(f"The specified PDF file was not found: {self.PDF_FILE_PATH}")
        loader = PyPDFLoader(self.PDF_FILE_PATH)
        docs = loader.load()
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        splits = text_splitter.split_documents(docs)

        print("Embedding documents... This may take a moment.")
        return Chroma.from_documents(
            documents=splits,
            embedding=self.embeddings,
            persist_directory="vector_stores/"+str(self.chat_id)
        )

    def _build_graph(self):
        """Builds the conversational RAG graph using LangGraph."""
        # --- FIX: Update State Definition to properly append messages ---
        # We now use the explicit `add_messages` reducer to ensure that the
        # list of messages is appended to, rather than overwritten, on each step.
        class RagState(TypedDict):
            question: str
            messages: Annotated[list, add_messages]
            context: List[Document]

        def handle_input_node(state: RagState):
            """Appends the latest user question to the message history."""
            return {"messages": [HumanMessage(content=state["question"])]}

        def retrieve_node(state: RagState):
            """Retrieves documents based on the latest user question."""
            print("---RETRIEVING DOCUMENTS---")
            last_message = state["messages"][-1]
            question = last_message.content
            retrieved_docs = self.vector_store.similarity_search(question, k=4)
            return {"context": retrieved_docs}

        def generate_node(state: RagState):
            """Generates an answer using the LLM, considering context and conversation history."""
            print("---GENERATING ANSWER---")
            context = state["context"]
            messages = state["messages"]
            docs_content = "\n\n".join(doc.page_content for doc in context)

            prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        "You are a helpful assistant for question-answering tasks. "
                        "Use the provided context and the previous conversation to answer the question. "
                        "If you don't know the answer, just say that you don't know.\n\n"
                        "Context:\n{context}",
                    ),
                    MessagesPlaceholder(variable_name="messages"),
                ]
            )
            chain = prompt | self.llm
            response = chain.invoke({"context": docs_content, "messages": messages})
            return {"messages": [response]}

        # Graph construction remains the same, but the state update logic is now correct.
        graph_builder = StateGraph(RagState)
        graph_builder.add_node("handle_input", handle_input_node)
        graph_builder.add_node("retrieve", retrieve_node)
        graph_builder.add_node("generate", generate_node)

        graph_builder.add_edge(START, "handle_input")
        graph_builder.add_edge("handle_input", "retrieve")
        graph_builder.add_edge("retrieve", "generate")
        graph_builder.add_edge("generate", END)

        return graph_builder.compile(checkpointer=self.memory)

    def invoke(self, question: str, messages: Annotated[list, add_messages]) -> str:
        """
        Invokes the RAG graph with memory. The user's question is wrapped
        in a HumanMessage and the final AI response content is returned.
        """
        if messages is not None:
            graph_input = {"question": question, "messages": messages}
        else:
            graph_input = {"question": question}
        graph_input = {"question": question, "messages": messages}
        final_state = self.graph.invoke(graph_input, config=self.config)

        # The final state's messages list contains the full conversation.
        # The last message is the AI's response. We return its string content.
        if final_state and final_state.get("messages"):
            return final_state["messages"][-1].content
        return "Sorry, something went wrong and I couldn't generate a response."


if __name__ == "__main__":
    print("Starting RAG Chatbot. Initialization may take a moment...")
    try:
        rag_chatbot = RAGChatbot("../example_data/log_doc.pdf","kansdjdsjdkjbcxc")
        print("\nChatbot is ready. Ask a question about the document.")
        print("Type 'exit' to quit.")

        while True:
            query = input("\nEnter your question: ")
            if query.lower() == 'exit':
                break
            if not query.strip():
                continue
            load_chat_hisory = [HumanMessage(content='how many distribution center does nike have in us'), AIMessage(content='Nike has eight significant distribution centers in the United States.'), HumanMessage(content='more details about it'), AIMessage(content="I'm sorry, but I don't have access to more detailed information about Nike's distribution center locations, their capacities, or specific operational details.  That kind of data is usually considered proprietary and confidential business information."), HumanMessage(content='like where are they located in us'), AIMessage(content='Five are located in or near Memphis, Tennessee.  Two others are located in Indianapolis, Indiana and Dayton, Tennessee.  These latter two are operated by third-party logistics providers')]
            lch = [HumanMessage("Hi"),AIMessage("Hello! How can I assist you today?")]
            response = rag_chatbot.invoke(query,lch)
            print("\nAnswer:", response)

    except FileNotFoundError as e:
        print(f"\nERROR: {e}")
        print("Please make sure the PDF file is in the correct location and try again.")
    except Exception as e:
        print(f"\nAn unexpected error occurred: {e}")