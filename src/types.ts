export interface Message {
  id: string;
  role: 'user' | 'nora';
  content: string;
  timestamp: number;
  action?: string;
}

export type NoraState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface ActionResponse {
  type: 'open' | 'search' | 'play' | 'whatsapp' | 'scroll' | 'none';
  payload: any;
  speech: string;
}
