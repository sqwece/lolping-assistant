/** A DeepSeek chat message, in the OpenAI-compatible shape. */
export type ChatContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: ChatContent;
}

export interface DeepSeekConfig {
  apiKey: string;
  /** Model that reads images (vision). */
  visionModel: string;
  /** Model for plain text replies. */
  textModel: string;
  baseUrl?: string;
}

export type FetchFn = typeof fetch;

interface CompletionResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

/**
 * Talks to DeepSeek's OpenAI-compatible Chat Completions endpoint. Pure Node fetch, so it
 * can be unit-tested by injecting a fetch. The key never leaves the Authorization header.
 */
export class DeepSeekClient {
  private readonly baseUrl: string;
  constructor(private readonly config: DeepSeekConfig, private readonly fetchFn: FetchFn = fetch) {
    this.baseUrl = config.baseUrl ?? 'https://api.deepseek.com';
  }

  /** One chat turn on the text model. */
  async text(messages: ChatMessage[]): Promise<string> {
    return this.complete(this.config.textModel, messages);
  }

  /** Describes an image (a `data:` URL) with the vision model. */
  async vision(prompt: string, imageDataUrl: string): Promise<string> {
    return this.complete(this.config.visionModel, [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ]);
  }

  private async complete(model: string, messages: ChatMessage[]): Promise<string> {
    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    const data = (await res.json()) as CompletionResponse;
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${data.error?.message ?? 'request failed'}`);
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('DeepSeek returned no message content');
    return content;
  }
}
