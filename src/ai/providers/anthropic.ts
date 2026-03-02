import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMMessage, LLMResponse } from './interface';
import { env } from '../../config';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private modelId: string;

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
    this.modelId = env.ANTHROPIC_MODEL_ID;
  }

  async chat(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: this.modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected content type');

    return {
      content: content.text,
      model: this.modelId,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  async complete(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    return this.chat(systemPrompt, [{ role: 'user', content: userMessage }]);
  }
}
