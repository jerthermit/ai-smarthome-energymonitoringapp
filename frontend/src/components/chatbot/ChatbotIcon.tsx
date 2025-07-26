import { ChatBubbleOvalLeftEllipsisIcon } from '@heroicons/react/24/solid';

interface ChatbotIconProps {
  onClick: () => void;
}

export const ChatbotIcon = ({ onClick }: ChatbotIconProps) => {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-8 right-8 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-transform transform hover:scale-110"
      aria-label="Open chat"
    >
      <ChatBubbleOvalLeftEllipsisIcon className="h-8 w-8" />
    </button>
  );
};
