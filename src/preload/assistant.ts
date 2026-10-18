import { contextBridge, ipcRenderer } from 'electron';
import {
  ASSISTANT_ADJUST, ASSISTANT_ADJUST_CANCEL, ASSISTANT_ADJUSTED, ASSISTANT_ASK, ASSISTANT_CHANNELS, ASSISTANT_CONFIRM,
  ASSISTANT_DISMISS, ASSISTANT_DONE, ASSISTANT_DRAG, ASSISTANT_MARK_CHOICE, ASSISTANT_MARK_NOTE_TEXT,
  ASSISTANT_MARK_PREVIEW_OK, ASSISTANT_MARK_TIME_SET, ASSISTANT_PRIORITY_MARK, ASSISTANT_RESIZE, ASSISTANT_SET_INTERACTIVE,
  ASSISTANT_UNMARK,
} from '../shared/assistantChannels';
import type { AssistantChannel, AssistantEvents } from '../shared/ipc';

const api = {
  on<C extends AssistantChannel>(channel: C, cb: (payload: AssistantEvents[C]) => void): void {
    if (!ASSISTANT_CHANNELS.includes(channel)) throw new Error(`unknown assistant channel: ${channel}`);
    ipcRenderer.on(channel, (_event, payload: AssistantEvents[C]) => cb(payload));
  },
  /** The user answered "Yes": analyse the screen. */
  confirm(): void {
    ipcRenderer.send(ASSISTANT_CONFIRM);
  },
  /** The user answered "No" or closed the popup. */
  dismiss(): void {
    ipcRenderer.send(ASSISTANT_DISMISS);
  },
  /** A follow-up chat message. */
  ask(text: string): void {
    ipcRenderer.send(ASSISTANT_ASK, { text });
  },
  /** The leave animation finished: the window can be hidden. */
  done(): void {
    ipcRenderer.send(ASSISTANT_DONE);
  },
  /** Opens the region editor. */
  adjust(): void {
    ipcRenderer.send(ASSISTANT_ADJUST);
  },
  /** Confirms a new capture region, in window-local DIP. */
  adjusted(rect: { x: number; y: number; width: number; height: number }): void {
    ipcRenderer.send(ASSISTANT_ADJUSTED, rect);
  },
  /** Closes the region editor without changing anything. */
  adjustCancel(): void {
    ipcRenderer.send(ASSISTANT_ADJUST_CANCEL);
  },
  /** Removes the selected marks. */
  unmark(ids: string[]): void {
    ipcRenderer.send(ASSISTANT_UNMARK, ids);
  },
  /** Toggles the window size: normal → half → full → normal. */
  resize(): void {
    ipcRenderer.send(ASSISTANT_RESIZE);
  },
  /** Makes the window interactive (false = click-through over the transparent parts). */
  setInteractive(interactive: boolean): void {
    ipcRenderer.send(ASSISTANT_SET_INTERACTIVE, interactive);
  },
  /** A drag gesture on the sprite: start / move / end. */
  drag(phase: 'start' | 'move' | 'end'): void {
    ipcRenderer.send(ASSISTANT_DRAG, { phase });
  },
  /** Mark flow: the user picked how to fill the mark — from the screenshot or by hand. */
  markChoice(source: 'extract' | 'note'): void {
    ipcRenderer.send(ASSISTANT_MARK_CHOICE, { source });
  },
  /** Mark flow (extract): the user accepted (true) or rejected (false) the summarised content. */
  markPreviewOk(ok: boolean): void {
    ipcRenderer.send(ASSISTANT_MARK_PREVIEW_OK, { ok });
  },
  /** Mark flow (note): the user's hand-typed content. */
  markNoteText(text: string): void {
    ipcRenderer.send(ASSISTANT_MARK_NOTE_TEXT, { text });
  },
  /** Mark flow: the chosen reminder delay, in minutes. */
  markTimeSet(minutes: number): void {
    ipcRenderer.send(ASSISTANT_MARK_TIME_SET, { minutes });
  },
  /** Marks the last answer as a priority (enemyvision follow-up). */
  priorityMark(): void {
    ipcRenderer.send(ASSISTANT_PRIORITY_MARK);
  },
};

contextBridge.exposeInMainWorld('assistant', api);

export type AssistantApi = typeof api;
