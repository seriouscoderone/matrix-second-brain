import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMMessage, LLMResponse } from './interface';
import { env, loadConfigYaml } from '../../config';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
  }

  private getModelId(): string {
    const config = loadConfigYaml();
    return config.llm_model || env.ANTHROPIC_MODEL_ID;
  }

  async chat(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse> {
    const modelId = this.getModelId();
    const response = await this.client.messages.create({
      model: modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected content type');

    return {
      content: content.text,
      model: modelId,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  async complete(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    return this.chat(systemPrompt, [{ role: 'user', content: userMessage }]);
  }
}
