import { useRef, useEffect, useState } from 'react';
import { ChatInput } from './ChatInput';
import { useChat } from '../../hooks/useChat';

const SUGGESTIONS = [
  "What's my highest-consuming device today?",
  "How much energy did my AC use last week?",
  "Show my usage trend this month."
];

// Define the component's props
type ChatInterfaceProps = ReturnType<typeof useChat>;

export const ChatInterface = ({ messages, isLoading, error, submitMessage }: ChatInterfaceProps) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [suggestionIdx, setSuggestionIdx] = useState(0);

  // Rotate suggestions every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setSuggestionIdx(i => (i + 1) % SUGGESTIONS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (msg: string) => {
    if (submitMessage) {
      submitMessage(msg);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-4">
        {messages.length === 0 && !isLoading && !error ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Welcome!
            </h3>
            <p className="text-sm mb-4">
              Talk to me to know more about your energy usage.
            </p>
            <p className="text-sm italic text-accent">
              “{SUGGESTIONS[suggestionIdx]}”
            </p>
          </div>
        ) : (
          messages.map((message, idx) => (
            <div
              key={idx}
              className={`text-sm rounded-lg p-3 max-w-[80%] whitespace-pre-wrap ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground ml-auto text-right'
                  : 'bg-accent/40 text-foreground mr-auto text-left'
              }`}
            >
              {message.content}
            </div>
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
          <div className="bg-destructive/10 border-l-4 border-destructive p-4 mb-4 rounded-r">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-destructive" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
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

      <div className="border-t border-border bg-card/60 backdrop-blur-sm">
        <ChatInput onSubmit={handleSubmit} disabled={isLoading} />
      </div>
    </div>
  );
};