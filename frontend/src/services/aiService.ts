import axios from 'axios';
import { API_BASE_URL } from '../config';

type AIMessageRole = 'user' | 'assistant' | 'system';

export interface AIMessage {
  role: AIMessageRole;
  content: string;
  timestamp?: Date;
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: AIMessageRole;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // This field is for our custom structured responses
  structured_data?: any; 
}

export const sendMessage = async (messages: AIMessage[]): Promise<ChatResponse> => {
  try {
    const response = await axios.post<ChatResponse>(
      `${API_BASE_URL}/ai/chat`,
      {
        messages,
        temperature: 0.7,
        max_tokens: 500,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending message to AI:', error);
    throw error;
  }
};

export const formatMessage = (content: string, role: AIMessage['role'] = 'user'): AIMessage => ({
  role,
  content,
  timestamp: new Date()
});
