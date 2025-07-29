import type { AIMessage } from '../../services/aiService';
import { UserCircleIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface ChatMessageProps {
  message: AIMessage;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  // Helper function to convert **bold** markdown to <strong>bold</strong> HTML
  // This function also sanitizes the text to prevent XSS vulnerabilities
  const renderWithBold = (text: string) => {
    // Escape basic HTML characters to prevent XSS
    const sanitizedText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    
    // Replace markdown bold with strong tags
    const htmlText = sanitizedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return { __html: htmlText };
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`flex items-end gap-2 max-w-[75%] ${isUser ? 'flex-row-reverse' : ''}`}>
        <div
          className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center ${
            isUser ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'
          }`}
        >
          {isUser ? (
            <UserCircleIcon className="h-5 w-5" />
          ) : (
            <CpuChipIcon className="h-5 w-5" />
          )}
        </div>
        <div>
          <div
            className={`px-3 py-2 text-sm ${
              isUser ? 'bg-primary text-primary-foreground' : 'bg-accent/30 text-foreground'
            } rounded-2xl ${isUser ? 'rounded-br-none' : 'rounded-bl-none'}`}
          >
            {message.content.split('\n').map((line, idx) => (
              <p 
                key={idx} 
                className="mb-1.5 last:mb-0 break-words"
                dangerouslySetInnerHTML={renderWithBold(line || '')} // Add fallback for empty lines
              />
            ))}
          </div>
          {message.timestamp && (
            <div
              className={`text-xs mt-0.5 ${
                isUser
                  ? 'text-right text-muted-foreground/60'
                  : 'text-left text-muted-foreground/60'
              }`}
            >
              {format(new Date(message.timestamp), 'h:mm a')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};