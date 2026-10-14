/** The assistant's look: 'none' draws no character, so a ping opens a plain popup instead. */
export const ASSISTANT_CHARACTERS = ['none', 'assistant', 'yasuo', 'zed', 'teemo', 'kaisa'] as const;
export type AssistantCharacter = (typeof ASSISTANT_CHARACTERS)[number];

export const isAssistantCharacter = (v: unknown): v is AssistantCharacter =>
  typeof v === 'string' && (ASSISTANT_CHARACTERS as readonly string[]).includes(v);

/** How a character travels to a ping. */
export type Movement = 'teleport' | 'jump' | 'dash' | 'fly';

/** Every playable character's way of moving; 'none' has no character, so no movement. */
export const CHARACTER_MOVEMENT: Record<Exclude<AssistantCharacter, 'none'>, Movement> = {
  assistant: 'teleport',
  yasuo: 'dash',
  zed: 'teleport',
  teemo: 'jump',
  kaisa: 'fly',
};
