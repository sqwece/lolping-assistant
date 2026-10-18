import type { PingId } from './pings';

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

/**
 * How the assistant answers a ping:
 * - 'vision' reads the screen and answers a question about it;
 * - 'chat' opens a conversation (no screen read);
 * - 'mark' saves a spot and reminds the user later;
 * - 'unmark' lists the saved spots and lets the user remove them.
 */
export type InteractionKind = 'vision' | 'chat' | 'mark' | 'unmark';

/** Every ping's assistant interaction. */
export const PING_INTERACTION: Record<PingId, InteractionKind> = {
  danger: 'vision',
  assist: 'vision',
  missing: 'vision',
  allin: 'vision',
  generic: 'vision',
  enemyvision: 'vision',
  push: 'chat',
  omw: 'chat',
  bait: 'chat',
  needvision: 'mark',
  visioncleared: 'unmark',
};

/** How the assistant should sound for a ping. */
export type Tone = 'urgent' | 'warm' | 'neutral' | 'alert' | 'casual';

export const PING_TONE: Record<PingId, Tone> = {
  danger: 'urgent',
  assist: 'warm',
  missing: 'neutral',
  allin: 'urgent',
  generic: 'neutral',
  enemyvision: 'alert',
  push: 'casual',
  omw: 'casual',
  bait: 'casual',
  needvision: 'neutral',
  visioncleared: 'neutral',
};

/** A saved spot (need vision): shown to the user as a text reminder at `remindAt`. */
export interface MarkEntry {
  id: string;
  content: string;
  createdAt: number;
  remindAt: number;
}

/** A "重点事项" the user asked to remember: injected into later conversations until `expiresAt`. */
export interface PriorityEntry {
  id: string;
  content: string;
  createdAt: number;
  expiresAt: number;
}

/** The assistant window's size: the small popup, half the display, or the whole display. */
export type ResizeMode = 'normal' | 'half' | 'full';
