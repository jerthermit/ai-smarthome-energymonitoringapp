import type { AIMessage } from '../../services/aiService';
import { UserCircleIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { EnergyResponse } from './EnergyResponse';

interface ChatMessageProps {
  message: AIMessage;
}

const isJsonString = (str: string) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};

const tryParseEnergyData = (content: string) => {
  if (!isJsonString(content)) return null;
  const data = JSON.parse(content);
  // A simple check to see if it's our energy response structure
  if (data && data.summary && data.data) {
    return data;
  }
  return null;
};

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const energyData = !isUser ? tryParseEnergyData(message.content) : null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`flex items-start gap-3 max-w-3xl w-full ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
          isUser 
            ? 'bg-primary/10 text-primary' 
            : 'bg-secondary/10 text-secondary'
        }`}>
          {isUser ? (
            <UserCircleIcon className="h-5 w-5" />
          ) : (
            <CpuChipIcon className="h-5 w-5" />
          )}
        </div>
        <div className="w-full">
          <div
            className={`px-4 py-3 rounded-lg ${
              isUser 
                ? 'bg-primary text-primary-foreground rounded-tr-none' 
                : 'bg-accent/30 text-foreground rounded-tl-none'
            }`}
          >
            {energyData ? (
              <EnergyResponse data={energyData} />
            ) : (
              <div className="text-sm">
                {message.content.split('\n').map((paragraph, i) => (
                  <p key={i} className="mb-2 last:mb-0">{paragraph}</p>
                ))}
              </div>
            )}
          </div>
          <div className={`text-xs mt-1 ${
            isUser 
              ? 'text-right text-muted-foreground/80' 
              : 'text-left text-muted-foreground'
          }`}>
            {message.timestamp && format(new Date(message.timestamp), 'h:mm a')}
          </div>
        </div>
      </div>
    </div>
  );
};
