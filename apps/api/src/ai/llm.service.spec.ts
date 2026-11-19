import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmService } from './llm.service.js';

function makeService(values: Record<string, string> = {}) {
  const config = { get: vi.fn((key: string) => values[key]) };
  return new LlmService(config as never);
}

describe('LlmService', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('ne contacte pas le fournisseur sans clé et laisse le fallback agir', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = makeService();

    await expect(service.complete('system', 'message')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('utilise l’API compatible OpenAI configurée et extrait la réponse', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"reply":"Bonjour"}' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = makeService({
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://api.groq.com/openai/v1/',
      LLM_MODEL: 'openai/gpt-oss-20b',
    });

    await expect(service.complete('system', 'message')).resolves.toBe(
      '{"reply":"Bonjour"}',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: 'openai/gpt-oss-20b',
      max_completion_tokens: 650,
    });
  });

  it('applique les paramètres LLM et utilise OpenRouter sans reprendre la clé STT', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"reply":"Salut"}' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = makeService({
      LLM_PROVIDER: 'openrouter',
      LLM_API_KEY: 'router-key',
      LLM_MODEL: 'openai/gpt-oss-20b',
      LLM_MAX_TOKENS: '900',
      LLM_TEMPERATURE: '0.7',
      LLM_REASONING_EFFORT: 'low',
      STT_API_KEY: 'stt-key-must-not-leak',
    });

    await service.complete('system', 'message');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer router-key',
        }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      max_tokens: 900,
      temperature: 0.7,
      reasoning_effort: 'low',
    });
  });

  it('permet Ollama sans clé API et exige un modèle local explicite', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"reply":"Salut"}' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = makeService({
      LLM_PROVIDER: 'ollama',
      LLM_MODEL: 'qwen2.5:3b',
    });

    await service.complete('system', 'message');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:11434/v1/chat/completions',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          Authorization: expect.anything(),
        }),
      }),
    );
  });
});
