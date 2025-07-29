import { useEffect, useRef, useState } from 'react';
import { XMarkIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { ChatbotIcon } from './ChatbotIcon';
import { ChatInterface } from './ChatInterface';
import { useChat } from '../../hooks/useChat';

export const ChatbotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Call useChat() here, once. This is now the single source of truth.
  const chatState = useChat();

  const toggleChat = () => setIsOpen(prev => !prev);

  const handleClearChat = () => {
    chatState.clearMessages();
  };

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);
  
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isOpen]);

  return (
    <>
      <ChatbotIcon isOpen={isOpen} onClick={toggleChat} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
        aria-labelledby="chatbot-title"
        className={`
          fixed bottom-20 right-6 z-50
          w-80 h-[55vh]
          bg-card/90 backdrop-blur-md
          rounded-2xl shadow-lg ring-1 ring-border
          flex flex-col
          transition-all duration-300 ease-in-out
          ${isOpen 
            ? 'opacity-100 translate-y-0 pointer-events-auto' 
            : 'opacity-0 translate-y-4 pointer-events-none'
          }
        `}
      >
        <header className="sticky top-0 px-4 py-2 border-b border-border rounded-t-2xl
                            bg-accent/30 backdrop-blur-sm">
          <div className="flex items-center justify-between w-full">
            <div>
              <h2 id="chatbot-title" className="text-sm font-semibold text-foreground">
                Energy Assistant
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Your personal energy expert.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleClearChat}
                className="p-1.5 text-muted-foreground hover:text-foreground transition"
                aria-label="Clear chat"
              >
                <ArrowPathIcon className="h-4 w-4" />
              </button>

              <button
                onClick={toggleChat}
                className="p-1 text-muted-foreground hover:text-foreground
                           focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label="Close chat"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {/* Pass the single chat state down as props */}
          <ChatInterface {...chatState} />
        </div>
      </div>
    </>
  );
};