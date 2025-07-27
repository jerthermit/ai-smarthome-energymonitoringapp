import { useRef, useEffect } from 'react';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { useChat } from '../../hooks/useChat';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export const ChatInterface = () => {
  const { messages, isLoading, error, submitMessage, clearMessages } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (message: string) => {
    submitMessage(message);
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-lg shadow-sm overflow-hidden border border-border">
      <div className="border-b border-border px-4 py-4 sm:px-6 bg-card/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">Energy Assistant</h2>
          <button
            onClick={clearMessages}
            disabled={messages.length === 0 || isLoading}
            className="inline-flex items-center gap-1.5 rounded-md bg-card px-2.5 py-1.5 text-sm font-medium text-foreground shadow-sm ring-1 ring-border hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowPathIcon className="h-4 w-4" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center p-6 max-w-md">
              <h3 className="text-lg font-medium text-foreground mb-2">Welcome to Energy Assistant</h3>
              <p className="text-sm text-muted-foreground">
                Ask me anything about your energy usage, devices, or get insights about your consumption patterns.
              </p>
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <ChatMessage key={`${message.timestamp?.getTime() || index}`} message={message} />
          ))
        )}
        {isLoading && (
          <div className="flex items-center justify-start mb-4">
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-accent/50 text-foreground mr-3">
              <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="h-2 w-2 bg-primary rounded-full animate-bounce mx-1" style={{ animationDelay: '150ms' }} />
              <div className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <div className="px-4 py-3 rounded-lg bg-accent/30 text-foreground rounded-tl-none">
              <div className="text-sm">Thinking...</div>
            </div>
          </div>
        )}
        {error && (
          <div className="bg-destructive/10 border-l-4 border-destructive p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-destructive" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-destructive">
                  Error: {error.message}
                </p>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border">
        <ChatInput onSubmit={handleSubmit} disabled={isLoading} />
      </div>
    </div>
  );
};
