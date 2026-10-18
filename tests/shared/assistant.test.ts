import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_CHARACTERS, CHARACTER_MOVEMENT, isAssistantCharacter, PING_INTERACTION,
} from '../../src/shared/assistant';
import { ALL_PINGS } from '../../src/shared/pings';

describe('assistant', () => {
  it('maps every ping to a vision, chat, mark or unmark interaction', () => {
    for (const p of ALL_PINGS) {
      expect(PING_INTERACTION[p.id], p.id).toMatch(/^(vision|chat|mark|unmark)$/);
    }
    // The canonical screen-reading, conversational, mark and unmark pings stay distinct.
    expect(PING_INTERACTION.missing).toBe('vision');
    expect(PING_INTERACTION.push).toBe('chat');
    expect(PING_INTERACTION.needvision).toBe('mark');
    expect(PING_INTERACTION.visioncleared).toBe('unmark');
  });

  it('gives every playable character a movement', () => {
    const playable = ASSISTANT_CHARACTERS.filter((c) => c !== 'none');
    expect(Object.keys(CHARACTER_MOVEMENT).sort()).toEqual([...playable].sort());
    for (const c of playable) expect(CHARACTER_MOVEMENT[c]).toMatch(/^(teleport|jump|dash|fly)$/);
  });

  it('accepts exactly the known characters', () => {
    for (const c of ASSISTANT_CHARACTERS) expect(isAssistantCharacter(c)).toBe(true);
    expect(isAssistantCharacter('ahri')).toBe(false);
    expect(isAssistantCharacter(42)).toBe(false);
    expect(isAssistantCharacter(null)).toBe(false);
  });
});
