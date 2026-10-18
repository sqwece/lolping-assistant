import type { AssistantApi } from '../../preload/assistant';

declare global {
  interface Window {
    assistant: AssistantApi;
  }
}

export {};
