import React from 'react';
import { ChatBubbleOvalLeftEllipsisIcon } from '@heroicons/react/24/solid';

interface ChatbotIconProps {
  isOpen: boolean;
  onClick: () => void;
}

export const ChatbotIcon: React.FC<ChatbotIconProps> = ({ isOpen, onClick }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className="flex flex-col items-end gap-1.5">
        {/* Tooltip */}
        {!isOpen && (
          <div className="
            text-primary text-xs opacity-70
            px-2 py-0.5 rounded
            max-w-[220px] text-right leading-snug
          ">
            Hi! 👋 Ask me more about your energy usage today ⚡
          </div>
        )}

        <button
          onClick={onClick}
          className="
            relative
            bg-primary text-primary-foreground
            p-3 rounded-full shadow-md
            hover:bg-primary/90
            focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
            transition-transform hover:scale-105
          "
          aria-label="Open chat"
        >
          {!isOpen && (
            <span className="absolute inset-0 rounded-full bg-secondary opacity-50 animate-ping" />
          )}
          <ChatBubbleOvalLeftEllipsisIcon className="relative h-6 w-6 z-10" />
        </button>
      </div>
    </div>
  );
};