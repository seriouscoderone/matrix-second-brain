import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { LLMProvider, LLMMessage, LLMResponse } from './interface';
import { env } from '../../config';

export class BedrockProvider implements LLMProvider {
  private client: BedrockRuntimeClient;
  private modelId: string;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: env.AWS_REGION,
      // Credentials come from the EC2 instance profile — no static keys needed.
    });
    this.modelId = env.BEDROCK_MODEL_ID;
  }

  async chat(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse> {
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body,
    });

    const response = await this.client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    return {
      content: result.content[0].text,
      model: this.modelId,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
    };
  }

  async complete(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    return this.chat(systemPrompt, [{ role: 'user', content: userMessage }]);
  }
}
