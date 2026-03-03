import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { LLMProvider, LLMMessage, LLMResponse } from './interface';
import { env, loadConfigYaml } from '../../config';
import { getLatestModelId } from '../models';

// Cached auto-discovered model ID so we only call ListFoundationModels once at startup.
let resolvedLatestModel: string | null = null;

export class BedrockProvider implements LLMProvider {
  private client: BedrockRuntimeClient;

  constructor() {
    this.client = new BedrockRuntimeClient({
      region: env.AWS_REGION,
      // Credentials come from the EC2 instance profile — no static keys needed.
    });
  }

  private async getModelId(): Promise<string> {
    // 1. Explicit runtime override from config.yaml (set via !model command)
    const config = loadConfigYaml();
    if (config.llm_model) return config.llm_model;

    // 2. Explicit env var (user set a specific model in .env)
    if (process.env.BEDROCK_MODEL_ID) return env.BEDROCK_MODEL_ID;

    // 3. Auto-discover the latest Sonnet from Bedrock
    if (!resolvedLatestModel) {
      resolvedLatestModel = await getLatestModelId('sonnet');
      if (resolvedLatestModel) {
        console.log(`🤖 Auto-selected Bedrock model: ${resolvedLatestModel}`);
      }
    }
    if (resolvedLatestModel) return resolvedLatestModel;

    // 4. Fallback to the Zod default
    return env.BEDROCK_MODEL_ID;
  }

  async chat(systemPrompt: string, messages: LLMMessage[]): Promise<LLMResponse> {
    const body = JSON.stringify({
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 4096,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const modelId = await this.getModelId();
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body,
    });

    const response = await this.client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));

    return {
      content: result.content[0].text,
      model: modelId,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
    };
  }

  async complete(systemPrompt: string, userMessage: string): Promise<LLMResponse> {
    return this.chat(systemPrompt, [{ role: 'user', content: userMessage }]);
  }
}
