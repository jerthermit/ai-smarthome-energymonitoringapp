import { ChatBubbleOvalLeftEllipsisIcon } from '@heroicons/react/24/solid';

interface ChatbotIconProps {
  onClick: () => void;
}

export const ChatbotIcon = ({ onClick }: ChatbotIconProps) => {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-8 right-8 bg-primary text-primary-foreground p-4 rounded-full shadow-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-transform transform hover:scale-110"
      aria-label="Open chat"
    >
      <ChatBubbleOvalLeftEllipsisIcon className="h-8 w-8" />
    </button>
  );
};
