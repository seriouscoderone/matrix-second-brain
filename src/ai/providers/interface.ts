// LLM provider abstraction — all providers must implement this interface.

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMProvider {
  /**
   * Send a chat-style request with a system prompt and message history.
   */
  chat(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse>;

  /**
   * Convenience method: single user message with a system prompt.
   */
  complete(systemPrompt: string, userMessage: string): Promise<LLMResponse>;
}
