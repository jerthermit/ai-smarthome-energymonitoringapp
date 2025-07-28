import { useState, useCallback } from 'react';
import type { AIMessage } from '../services/aiService';
import { sendMessage, formatMessage } from '../services/aiService';

const MAX_CHAT_HISTORY = 20; // only send the last N messages to backend

export const useChat = () => {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const addMessage = useCallback((content: string, role: AIMessage['role'] = 'user') => {
    const newMessage = formatMessage(content, role);
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  }, []);

  const submitMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    // 1) add the user message to local state immediately
    const userMessage = addMessage(trimmed, 'user');

    setIsLoading(true);
    setError(null);

    try {
      // 2) clip the conversation to the last N messages BEFORE sending
      const next = [...messages, userMessage];
      const clipped = next.slice(-MAX_CHAT_HISTORY);

      // 3) send only the clipped history to the backend
      const response = await sendMessage(clipped);

      // 4) append assistant message from response
      const assistantContent =
        response?.choices?.[0]?.message?.content ??
        'Sorry, I could not generate a response.';
      addMessage(assistantContent, 'assistant');

      // (Optional) if you use energy_data in your UI, you can return `response`
      // and handle it where you render the chat.
      return response;
    } catch (err) {
      console.error('Error in chat:', err);
      setError(err instanceof Error ? err : new Error('Failed to get response from AI'));
    } finally {
      setIsLoading(false);
    }
  }, [messages, addMessage]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    submitMessage,
    clearMessages,
  };
};

export default useChat;