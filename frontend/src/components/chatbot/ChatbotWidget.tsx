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
        <div className="fixed bottom-24 right-8 w-96 h-[60vh] bg-white rounded-lg shadow-2xl flex flex-col z-50 border border-gray-200">
          <header className="bg-gray-50 p-4 flex justify-between items-center border-b border-gray-200 rounded-t-lg">
            <h2 className="text-lg font-semibold text-gray-800">Energy Assistant</h2>
            <button onClick={toggleChat} className="text-gray-500 hover:text-gray-800">
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
