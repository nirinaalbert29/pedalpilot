import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly config: ConfigService) {}

  async complete(system: string, user: string): Promise<string | null> {
    const provider = (this.config.get<string>('LLM_PROVIDER') ?? 'groq')
      .trim()
      .toLowerCase();
    const key = (name: string) => this.config.get<string>(name)?.trim();
    const apiKey =
      key('LLM_API_KEY') ||
      (provider === 'groq'
        ? key('GROQ_API_KEY') || key('STT_API_KEY')
        : undefined);
    if (provider !== 'ollama' && !apiKey) return null;

    const defaultBaseUrls: Record<string, string> = {
      groq: 'https://api.groq.com/openai/v1',
      'openai-compat': 'https://api.groq.com/openai/v1',
      openrouter: 'https://openrouter.ai/api/v1',
      ollama: 'http://localhost:11434/v1',
    };
    const baseUrl = (
      key('LLM_BASE_URL') ??
      defaultBaseUrls[provider] ??
      ''
    ).replace(/\/+$/, '');
    if (!baseUrl) {
      this.logger.warn(
        `Fournisseur LLM inconnu (${provider}); bascule en mode secours.`,
      );
      return null;
    }
    const defaultModels: Record<string, string> = {
      groq: 'openai/gpt-oss-20b',
      'openai-compat': 'openai/gpt-oss-20b',
    };
    const model = key('LLM_MODEL') ?? defaultModels[provider];
    if (!model) {
      this.logger.warn(
        `LLM_MODEL doit être défini pour le fournisseur ${provider}.`,
      );
      return null;
    }
    const parsedTokens = Number(key('LLM_MAX_TOKENS') ?? 650);
    const maxTokens =
      Number.isInteger(parsedTokens) && parsedTokens > 0 ? parsedTokens : 650;
    const parsedTemperature = Number(key('LLM_TEMPERATURE') ?? 0.3);
    const temperature =
      Number.isFinite(parsedTemperature) &&
      parsedTemperature >= 0 &&
      parsedTemperature <= 2
        ? parsedTemperature
        : 0.3;
    const effort = key('LLM_REASONING_EFFORT')?.toLowerCase();
    try {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        ...(provider === 'groq' || provider === 'openai-compat'
          ? { max_completion_tokens: maxTokens }
          : { max_tokens: maxTokens }),
        response_format: { type: 'json_object' },
      };
      if (effort && ['low', 'medium', 'high'].includes(effort)) {
        body.reasoning_effort = effort;
      }
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        this.logger.warn(
          `Fournisseur LLM indisponible (HTTP ${response.status}); bascule en mode secours.`,
        );
        return null;
      }
      const data = (await response.json()) as ChatCompletionResponse;
      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      this.logger.warn(
        `Appel LLM impossible; bascule en mode secours (${error instanceof Error ? error.message : 'erreur réseau'}).`,
      );
      return null;
    }
  }
}
