import { useState, useCallback } from 'react';
import type { AIMessage } from '../services/aiService';
import { sendMessage, formatMessage } from '../services/aiService';

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
    if (!content.trim()) return;
    
    const userMessage = addMessage(content, 'user');
    setIsLoading(true);
    setError(null);

    try {
      const response = await sendMessage([...messages, userMessage]);
      if (response.choices && response.choices.length > 0) {
        const assistantMessage = response.choices[0].message.content;
        addMessage(assistantMessage, 'assistant');
      } else {
        throw new Error('Received an empty or invalid response from the AI.');
      }
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
