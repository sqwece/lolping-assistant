import { describe, expect, it, vi } from 'vitest';
import { DeepSeekClient } from '../../src/main/deepseek';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('DeepSeekClient', () => {
  const config = { apiKey: 'sk-test', visionModel: 'deepseek-flash', textModel: 'deepseek-v4-pro' };

  it('posts to the chat completions endpoint with the bearer key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'hi' } }] }));
    const client = new DeepSeekClient(config, fetchFn);
    await client.text([{ role: 'user', content: 'hello' }]);

    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-v4-pro');
    expect(body.stream).toBe(false);
  });

  it('sends a prompt and image to the vision model', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'a red square' } }] }));
    const client = new DeepSeekClient(config, fetchFn);
    const out = await client.vision('what is this?', 'data:image/png;base64,AAAA');
    expect(out).toBe('a red square');

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-flash');
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'what is this?' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]);
  });

  it('throws on a non-OK response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ error: { message: 'bad key' } }, false, 401));
    const client = new DeepSeekClient(config, fetchFn);
    await expect(client.text([{ role: 'user', content: 'hi' }])).rejects.toThrow('DeepSeek 401: bad key');
  });

  it('throws when the response has no message content', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ choices: [] }));
    const client = new DeepSeekClient(config, fetchFn);
    await expect(client.text([])).rejects.toThrow('no message content');
  });
});
