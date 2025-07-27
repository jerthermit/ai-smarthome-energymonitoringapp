import { useState } from 'react';
import { ChatbotIcon } from './ChatbotIcon';
import { ChatInterface } from '../chat/ChatInterface';
import { XMarkIcon } from '@heroicons/react/24/solid';

export const ChatbotWidget = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  return (
    <>
      <ChatbotIcon onClick={toggleChat} />
      {isOpen && (
        <div className="fixed bottom-24 right-8 w-96 h-[60vh] bg-card rounded-lg shadow-2xl flex flex-col z-50 border border-border">
          <header className="bg-accent/50 p-4 flex justify-between items-center border-b border-border rounded-t-lg">
            <h2 className="text-lg font-semibold text-foreground">Energy Assistant</h2>
            <button 
              onClick={toggleChat} 
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close chat"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </header>
          <div className="flex-grow overflow-y-auto">
            <ChatInterface />
          </div>
        </div>
      )}
    </>
  );
};
