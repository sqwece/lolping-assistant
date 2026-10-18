/** A DeepSeek chat message, in the OpenAI-compatible shape. */
export type ChatContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

/** A function call the model asked for. `arguments` is a JSON string. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: ChatContent | null;
  /** Wire format: each call carries its `type` and a nested `function`. */
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
  /** Set on a `tool` role message, naming the call it answers. */
  tool_call_id?: string;
}

/** A function the model may call. `parameters` is a JSON Schema object. */
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
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

interface RawToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface CompletionResponse {
  choices?: { message?: { content?: unknown; tool_calls?: RawToolCall[] } }[];
  error?: { message?: string };
}

/** One model turn: either a final text, or tool calls to run. */
export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
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

  /** One chat turn on the text model with optional tools; returns the final text or tool calls. */
  async chat(messages: ChatMessage[], tools: Tool[] = []): Promise<ChatResult> {
    return this.request(this.config.textModel, messages, tools);
  }

  private async complete(model: string, messages: ChatMessage[]): Promise<string> {
    const { content } = await this.request(model, messages, []);
    if (content === null) throw new Error('DeepSeek returned no message content');
    return content;
  }

  private async request(model: string, messages: ChatMessage[], tools: Tool[]): Promise<ChatResult> {
    const body: Record<string, unknown> = { model, messages, stream: false };
    if (tools.length > 0) body.tools = tools.map((t) => ({ type: 'function', function: t }));
    const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as CompletionResponse;
    if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${data.error?.message ?? 'request failed'}`);
    const msg = data.choices?.[0]?.message;
    const content = typeof msg?.content === 'string' ? msg.content : null;
    const toolCalls: ToolCall[] = [];
    if (Array.isArray(msg?.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc.id && tc.function?.name) toolCalls.push({ id: tc.id, name: tc.function.name, arguments: tc.function.arguments ?? '{}' });
      }
    }
    return { content, toolCalls };
  }
}
