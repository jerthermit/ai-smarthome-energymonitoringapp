import { useState, useRef, useEffect } from 'react';
import type { KeyboardEvent } from 'react';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput = ({
  onSubmit,
  disabled = false,
  placeholder = 'Ask about your energy usage...'
}: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSubmit(message.trim());
      setMessage('');
      adjustHeight();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [message]);

  return (
    <div className="border-t border-gray-200 px-4 pt-4 mb  -4 sm:mb-0">
      <div className="relative flex-1 overflow-hidden rounded-lg shadow-sm ring-1 ring-inset ring-gray-300 focus-within:ring-2 focus-within:ring-blue-600">
        <textarea
          ref={textareaRef}
          rows={1}
          className="block w-full resize-none border-0 bg-transparent text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:py-1.5 sm:text-sm sm:leading-6"
          placeholder={placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <div className="py-2" aria-hidden="true">
          <div className="py-px">
            <div className="h-9" />
          </div>
        </div>
      </div>
      <div className="flex justify-end pt-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!message.trim() || disabled}
          className={`inline-flex items-center rounded-md px-4 py-2 text-sm font-semibold shadow-sm ${
            !message.trim() || disabled
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
          }`}
        >
          {disabled ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};
