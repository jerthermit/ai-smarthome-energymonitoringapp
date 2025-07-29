import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  disabled = false,
  placeholder = 'Ask about your energy usage…'
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setMessage('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // Auto-resize up to 5 lines
  const adjustHeight = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxHeight = 5 * 24; // approx 5 lines
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [message]);

  return (
    <div className="flex items-end px-4 py-3 gap-2 bg-card">
      <textarea
        ref={textareaRef}
        rows={1}
        className="flex-1 resize-none overflow-hidden bg-transparent focus:outline-none 
                   text-foreground placeholder:text-muted-foreground/60 
                   scrollbar-none"
        placeholder={placeholder}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button
        onClick={submit}
        disabled={disabled || message.trim() === ''}
        aria-label="Send message"
        className={`p-2 rounded-full transition-transform ${
          disabled || message.trim() === ''
            ? 'opacity-50 cursor-not-allowed'
            : 'bg-primary text-primary-foreground hover:scale-110 focus:ring-2 focus:ring-primary'
        }`}
      >
        <PaperAirplaneIcon className="h-5 w-5 rotate-90" />
      </button>
    </div>
  );
};