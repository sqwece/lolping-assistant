/** Channel names for the assistant window. Lives in its own dependency-free module so the assistant preload can
 *  inline them — a sandboxed preload can only require('electron'), never a sibling file (see the note in ipc.ts). */

/** main → assistant renderer messages. */
export const ASSISTANT_CHANNELS = [
  'assistant:show', 'assistant:answer', 'assistant:delta', 'assistant:remark', 'assistant:mark', 'assistant:marks',
  'assistant:size', 'assistant:hide', 'assistant:region', 'assistant:idle', 'assistant:notice',
  'assistant:mark-choose', 'assistant:mark-preview', 'assistant:mark-note', 'assistant:mark-time',
  'assistant:thumbnail', 'assistant:emote',
] as const;

/** assistant renderer → main: the user answered "Yes" (analyse the screen). */
export const ASSISTANT_CONFIRM = 'assistant:confirm';
/** assistant renderer → main: the user answered "No" or closed the popup. */
export const ASSISTANT_DISMISS = 'assistant:dismiss';
/** assistant renderer → main: a follow-up chat message. */
export const ASSISTANT_ASK = 'assistant:ask';
/** assistant renderer → main: the leave animation finished, so the window can be hidden. */
export const ASSISTANT_DONE = 'assistant:done';
/** assistant renderer → main: the user opened the region editor ("Adjust range"). */
export const ASSISTANT_ADJUST = 'assistant:adjust';
/** assistant renderer → main: the user confirmed a new region (window-local DIP). */
export const ASSISTANT_ADJUSTED = 'assistant:adjusted';
/** assistant renderer → main: the user closed the region editor without changing anything. */
export const ASSISTANT_ADJUST_CANCEL = 'assistant:adjustCancel';
/** assistant renderer → main: the user removed the selected marks. */
export const ASSISTANT_UNMARK = 'assistant:unmark';
/** assistant renderer → main: the user toggled the window size (normal → half → full → normal). */
export const ASSISTANT_RESIZE = 'assistant:resize';
/** assistant renderer → main: whether the cursor is over an interactive part, toggling click-through. */
export const ASSISTANT_SET_INTERACTIVE = 'assistant:set-interactive';
/** assistant renderer → main: a drag gesture on the sprite ({ phase: start | move | end }). */
export const ASSISTANT_DRAG = 'assistant:drag';
/** assistant renderer → main: which mark source the user picked ({ source: 'extract' | 'note' }). */
export const ASSISTANT_MARK_CHOICE = 'assistant:mark-choice';
/** assistant renderer → main: whether the user accepted the extracted mark content ({ ok }). */
export const ASSISTANT_MARK_PREVIEW_OK = 'assistant:mark-preview-ok';
/** assistant renderer → main: the user's hand-typed mark content ({ text }). */
export const ASSISTANT_MARK_NOTE_TEXT = 'assistant:mark-note-text';
/** assistant renderer → main: the chosen reminder delay ({ minutes }). */
export const ASSISTANT_MARK_TIME_SET = 'assistant:mark-time-set';
/** assistant renderer → main: the user marked the last answer as a priority. */
export const ASSISTANT_PRIORITY_MARK = 'assistant:priority-mark';
