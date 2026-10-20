import { BrowserWindow, ipcMain, screen, type Display, type Point, type Rectangle } from 'electron';
import { PING_INTERACTION, PING_TONE, type AssistantCharacter, type MarkEntry, type Movement, type PriorityEntry, type ResizeMode, type Tone } from '../shared/assistant';
import { clampRect } from '../shared/geometry';
import type { Strings } from '../shared/i18n';
import {
  ASSISTANT_ADJUST, ASSISTANT_ADJUST_CANCEL, ASSISTANT_ADJUSTED, ASSISTANT_ASK, ASSISTANT_CONFIRM,
  ASSISTANT_DISMISS, ASSISTANT_DONE, ASSISTANT_DRAG, ASSISTANT_MARK_CHOICE, ASSISTANT_MARK_NOTE_TEXT,
  ASSISTANT_MARK_PREVIEW_OK, ASSISTANT_MARK_TIME_SET, ASSISTANT_PRIORITY_MARK, ASSISTANT_RESIZE,
  ASSISTANT_SET_INTERACTIVE, ASSISTANT_UNMARK,
  type AssistantChannel, type AssistantEvents, type AssistantUi,
} from '../shared/ipc';
import type { PingId } from '../shared/pings';
import type { Settings } from '../shared/settings';
import type { Rect } from './coords';
import { DeepSeekClient, type ChatMessage, type Tool } from './deepseek';
import { readTextFile } from './fileRead';
import { IS_MAC, loadPage, preloadPath } from './paths';
import { captureRect } from './screenCapture';
import { webSearch } from './webSearch';

/** The assistant window's fixed size, in DIP. */
export const ASSISTANT_SIZE = { width: 520, height: 640 } as const;

/** The idle window's size: just enough for the sprite and a little breathing room. */
const IDLE_SIZE = { width: 120, height: 140 } as const;

/** How far the idle sprite sits from the display's bottom-right corner. */
const IDLE_MARGIN = 20;

/** The reminder delays offered when saving a mark, in minutes. */
const MARK_TIME_OPTIONS = [5, 15, 30, 60];

/** Trailing debounce: rapid pings are one interaction — only the last one (after a quiet pause) opens the popup. */
const DEBOUNCE_MS = 1000;

/** How often the main process checks for due marks. */
const MARK_TICK_MS = 30 * 1000;

/** A conversation is summarised once its text grows past this many characters (~2k tokens). */
const SUMMARY_CHAR_THRESHOLD = 8000;

/** The newest turns kept verbatim when an over-long conversation is summarised. */
const SUMMARY_KEEP_TURNS = 4;

/** Where the sprite's anchor sits inside the window: the point placed on the ping. */
const SPRITE_ANCHOR = { x: ASSISTANT_SIZE.width / 2, y: 140 };

/** Movement durations in ms; keep in sync with the renderer's enter-* CSS animation lengths. */
const MOVEMENT_MS: Record<Movement, number> = { teleport: 360, jump: 610, dash: 410, fly: 510 };

/** How high a jump arc rises above the straight line between the two spots, in DIP. */
const JUMP_ARC = 220;

/** All movement styles; picked at random on each ping so the hop stays lively. */
const MOVEMENTS: Movement[] = ['teleport', 'jump', 'dash', 'fly'];

function randomMovement(): Movement {
  return MOVEMENTS[Math.floor(Math.random() * MOVEMENTS.length)];
}

/** A point in global DIP coordinates (Electron's window space). */
interface DipPoint {
  x: number;
  y: number;
}

/**
 * The AI assistant: one small always-on-top, focusable, transparent window that a character hops into, then a popup.
 * Every ping opens a confirmation popup first; only after the user confirms does the assistant read the screen, chat,
 * or manage marks.
 */
export class Assistant {
  private win: BrowserWindow | null = null;
  private loaded = false;
  private ping: PingId = 'generic';
  private tone: Tone = 'neutral';
  private resizeState: ResizeMode = 'normal';
  private dragCursor: Point | null = null;
  private dragBounds: Rectangle | null = null;
  private pending: { ping: PingId; point: DipPoint; thumbnail: string | null } | null = null;
  private messages: ChatMessage[] = [];
  private display: Display | null = null;
  private region: Rect | null = null;
  private marks: MarkEntry[] = [];
  /** "重点事项" the user asked to remember: injected into later conversations until `expiresAt`. */
  private priorities: PriorityEntry[] = [];
  /** The running summary of an over-long conversation's early turns (null until the first compression). */
  private summary: string | null = null;
  /** Due-mark timer; cleared on destroy. */
  private markTimer: ReturnType<typeof setInterval> | null = null;
  /** A one-shot notice queued for the next popup (an expired priority). */
  private expiryNotice: string | null = null;
  /** Where the idle sprite sits (bottom-right by default); moves when the user drags it. Not persisted. */
  private idleBounds: Rectangle | null = null;
  /** Whether the window is currently showing the idle sprite (no popup). */
  private idleMode = false;
  /** Idle was requested before the renderer finished loading: present it once loaded. */
  private idleRequested = false;
  /** The in-progress mark's content between the note/preview step and the time step. */
  private markContent: string | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly getSettings: () => Settings,
    private readonly text: () => Strings,
    private readonly now: () => number = Date.now,
  ) {}

  start(): void {
    ipcMain.on(ASSISTANT_CONFIRM, () => void this.confirm());
    ipcMain.on(ASSISTANT_DISMISS, () => this.hide());
    ipcMain.on(ASSISTANT_ASK, (_event, raw: unknown) => {
      const m = raw as { text?: unknown } | null;
      if (m && typeof m.text === 'string') void this.answer(m.text);
    });
    ipcMain.on(ASSISTANT_UNMARK, (_event, raw: unknown) => {
      const ids = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
      const idSet = new Set(ids);
      this.marks = this.marks.filter((m) => !idSet.has(m.id));
      this.sendMarks();
    });
    ipcMain.on(ASSISTANT_RESIZE, () => this.cycleResize());
    ipcMain.on(ASSISTANT_PRIORITY_MARK, () => this.markPriority());
    ipcMain.on(ASSISTANT_MARK_CHOICE, (_event, raw: unknown) => {
      const source = (raw as { source?: unknown } | null)?.source;
      if (source === 'extract') void this.markExtract();
      else if (source === 'note') this.markNote();
    });
    ipcMain.on(ASSISTANT_MARK_PREVIEW_OK, (_event, raw: unknown) => {
      const ok = (raw as { ok?: unknown } | null)?.ok === true;
      if (ok) this.markTime();
      else this.beginMark();
    });
    ipcMain.on(ASSISTANT_MARK_NOTE_TEXT, (_event, raw: unknown) => {
      const text = (raw as { text?: unknown } | null)?.text;
      if (typeof text === 'string' && text.trim()) {
        this.markContent = text.trim();
        this.markTime();
      }
    });
    ipcMain.on(ASSISTANT_MARK_TIME_SET, (_event, raw: unknown) => {
      const minutes = (raw as { minutes?: unknown } | null)?.minutes;
      if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) this.saveMark(minutes);
    });
    this.markTimer = setInterval(() => this.tickMarks(), MARK_TICK_MS);
    ipcMain.on(ASSISTANT_DRAG, (_event, raw: unknown) => {
      const phase = (raw as { phase?: unknown } | null)?.phase;
      if (phase === 'start') this.dragStart();
      else if (phase === 'move') this.dragMove();
      else if (phase === 'end') this.dragEnd();
    });
    ipcMain.on(ASSISTANT_SET_INTERACTIVE, (_event, raw: unknown) => {
      const interactive = raw === true;
      const win = this.win;
      if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!interactive, { forward: true });
    });
    ipcMain.on(ASSISTANT_DONE, () => this.finishHide());
    ipcMain.on(ASSISTANT_ADJUST, () => this.startAdjust());
    ipcMain.on(ASSISTANT_ADJUSTED, (_event, raw: unknown) => {
      const r = raw as Rect | null;
      if (r && [r.x, r.y, r.width, r.height].every((n) => typeof n === 'number' && Number.isFinite(n))) void this.finishAdjust(r);
    });
    ipcMain.on(ASSISTANT_ADJUST_CANCEL, () => this.cancelAdjust());
  }

  /** The settings page's Test button: a ping at the centre of the primary display. */
  test(ping: PingId): void {
    const d = screen.getPrimaryDisplay();
    const point: DipPoint = { x: Math.round(d.bounds.x + d.bounds.width / 2), y: Math.round(d.bounds.y + d.bounds.height / 2) };
    console.log('[assistant] test', ping, point);
    void this.show(ping, point);
  }

  destroy(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    if (this.markTimer !== null) clearInterval(this.markTimer);
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }

  /** Whether any saved mark still has a reminder coming up (used by the quit guard). */
  hasPendingMarks(): boolean {
    return this.marks.length > 0;
  }

  /** Shows the idle sprite at its resting spot (no popup), unless the feature is off. */
  idle(): void {
    const s = this.getSettings();
    if (!s.assistantEnabled || !s.assistantIdleOn) return;
    this.idleRequested = true;
    this.ensureWindow();
    if (this.loaded) this.presentIdle();
  }

  /** Positions the window at the idle spot and asks the renderer for the idle sprite (no popup). */
  private presentIdle(): void {
    const win = this.win;
    if (!win || win.isDestroyed() || !this.loaded) return;
    this.idleRequested = true;
    this.idleMode = true;
    this.idleBounds = this.idleBounds ?? this.defaultIdleBounds();
    win.setBounds(this.idleBounds);
    if (!win.isVisible()) win.show();
    this.send('assistant:idle', { character: this.getSettings().assistantCharacter });
  }

  /** The idle spot: the bottom-right corner of the primary display. */
  private defaultIdleBounds(): Rectangle {
    const d = screen.getPrimaryDisplay();
    return {
      x: d.bounds.x + d.bounds.width - IDLE_SIZE.width - IDLE_MARGIN,
      y: d.bounds.y + d.bounds.height - IDLE_SIZE.height - IDLE_MARGIN,
      width: IDLE_SIZE.width,
      height: IDLE_SIZE.height,
    };
  }

  /** Opens the window (or repositions it) with a confirmation popup. The screen is only read after the user confirms. */
  async show(ping: PingId, point: DipPoint): Promise<void> {
    const s = this.getSettings();
    if (!s.assistantEnabled) {
      console.warn('[assistant] disabled, skipping show');
      return;
    }
    this.ping = ping;
    this.tone = PING_TONE[ping];
    this.resizeState = 'normal';
    this.idleMode = false;
    this.markContent = null;
    const display = screen.getDisplayNearestPoint(point);
    this.display = display;
    const sizeDip = s.regionSizePx / (IS_MAC ? 1 : display.scaleFactor);
    this.region = { x: point.x - sizeDip / 2, y: point.y - sizeDip / 2, width: sizeDip, height: sizeDip };
    // No capture here: a full-screen grab blocks input for ~700ms, so the screenshot is taken lazily on confirm.
    this.pending = { ping, point, thumbnail: null };
    this.messages = [];
    this.expiryNotice = this.drainExpiredPriorities();
    this.ensureWindow();
    this.schedulePresent();
  }

  /** Schedules the popup after a quiet pause: a burst of pings shows only the last one. */
  private schedulePresent(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.present();
    }, DEBOUNCE_MS);
  }

  /** The small popup's bounds, anchored to the ping point. */
  private normalBounds(): Rectangle {
    const p = this.pending;
    const display = this.display;
    if (p && display) {
      return clampRect(p.point.x - SPRITE_ANCHOR.x, p.point.y - SPRITE_ANCHOR.y, ASSISTANT_SIZE.width, ASSISTANT_SIZE.height, display.bounds);
    }
    return { x: 0, y: 0, width: ASSISTANT_SIZE.width, height: ASSISTANT_SIZE.height };
  }

  /** Drag start: remember where the cursor and window are. */
  private dragStart(): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    this.dragCursor = screen.getCursorScreenPoint();
    this.dragBounds = win.getBounds();
  }

  /** Drag move: shift the window by the cursor's delta since the drag started. */
  private dragMove(): void {
    const win = this.win;
    if (!win || win.isDestroyed() || !this.dragCursor || !this.dragBounds) return;
    const c = screen.getCursorScreenPoint();
    win.setBounds({
      x: this.dragBounds.x + (c.x - this.dragCursor.x),
      y: this.dragBounds.y + (c.y - this.dragCursor.y),
      width: this.dragBounds.width,
      height: this.dragBounds.height,
    });
  }

  private dragEnd(): void {
    this.dragCursor = null;
    this.dragBounds = null;
    // Dragging the idle sprite repositions its resting spot (in-memory only).
    if (this.idleMode && this.win && !this.win.isDestroyed()) this.idleBounds = this.win.getBounds();
  }

  /** Cycles the window size normal → half → full → normal. */
  private cycleResize(): void {
    const win = this.win;
    const display = this.display;
    if (!win || win.isDestroyed() || !display) return;
    const b = display.bounds;
    let bounds: Rectangle;
    let next: ResizeMode;
    if (this.resizeState === 'normal') {
      bounds = { x: b.x, y: b.y, width: b.width, height: Math.round(b.height / 2) };
      next = 'half';
    } else if (this.resizeState === 'half') {
      bounds = { ...b };
      next = 'full';
    } else {
      bounds = this.normalBounds();
      next = 'normal';
    }
    this.resizeState = next;
    win.setBounds(bounds);
    this.send('assistant:size', { mode: next });
  }

  /** Eases the horizontal travel for a movement; `jump` handles its own arc, so this is only x (and non-jump y). */
  private movementEase(movement: Movement, t: number): number {
    if (movement === 'dash') return 1 - Math.pow(1 - t, 3); // ease-out: launches fast, settles
    if (movement === 'fly') return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease-in-out
    return t;
  }

  /** Animates the window from its current bounds to `target` over `ms`, then calls `done`. */
  private flyTo(target: Rectangle, movement: Movement, ms: number, done: () => void): void {
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    if (movement === 'teleport') {
      win.setBounds(target);
      done();
      return;
    }
    const from = win.getBounds();
    const start = this.now();
    const step = (): void => {
      if (!win || win.isDestroyed()) return;
      const t = Math.min(1, (this.now() - start) / ms);
      const ex = this.movementEase(movement, t);
      const x = Math.round(from.x + (target.x - from.x) * ex);
      const y = movement === 'jump'
        ? Math.round(from.y + (target.y - from.y) * t - JUMP_ARC * Math.sin(Math.PI * t))
        : Math.round(from.y + (target.y - from.y) * ex);
      const width = Math.round(from.width + (target.width - from.width) * t);
      const height = Math.round(from.height + (target.height - from.height) * t);
      win.setBounds({ x, y, width, height });
      if (t < 1) setTimeout(step, 16);
      else done();
    };
    step();
  }

  /** Positions and shows the window, then asks the renderer for a confirmation popup. */
  private present(): void {
    const p = this.pending;
    const win = this.win;
    if (!p || !win || win.isDestroyed() || !this.loaded) return;
    console.log('[assistant] present', p.ping, p.point);
    const s = this.getSettings();
    const t = this.text();
    const character: AssistantCharacter = s.assistantCharacter;
    const movement: Movement = character === 'none' ? 'teleport' : randomMovement();
    const ui: AssistantUi = {
      confirm: t.assistantConfirm, cancel: t.assistantCancel, ask: t.assistantAsk,
      thinking: t.assistantThinking, placeholder: t.assistantInputPlaceholder, adjust: t.assistantAdjust,
      noMarks: t.assistantNoMarks, deleteMarks: t.assistantDeleteMarks, copy: t.assistantCopy, copied: t.assistantCopied,
      enlarge: t.assistantEnlarge, fullscreen: t.assistantFullscreen, restore: t.assistantRestore,
      markExtract: t.assistantMarkExtract, markNote: t.assistantMarkNote, markReselect: t.assistantMarkReselect,
      markNotePlaceholder: t.assistantMarkNotePlaceholder, markTimeTitle: t.assistantMarkTimeTitle,
      priorityAsk: t.assistantPriorityAsk, priorityMark: t.assistantPriorityMark, prioritySkip: t.assistantPrioritySkip,
    };
    const greeting = this.expiryNotice ? `${t.assistantGreetings[p.ping]}\n${this.expiryNotice}` : t.assistantGreetings[p.ping];
    this.expiryNotice = null;
    const payload = {
      character,
      movement,
      greeting,
      thumbnail: p.thumbnail,
      ping: p.ping,
      kind: PING_INTERACTION[p.ping],
      tone: this.tone,
      ui,
    };
    const showPopup = (): void => this.send('assistant:show', payload);
    const target = this.normalBounds();
    const wasVisible = win.isVisible();
    win.show();
    win.focus();
    if (wasVisible) {
      // Fly the sprite from its resting spot to the ping point instead of teleporting the window.
      this.flyTo(target, movement, MOVEMENT_MS[movement], showPopup);
    } else {
      win.setBounds(target);
      showPopup();
    }
  }

  /** The user confirmed the popup: dispatch by the ping's interaction kind. */
  private async confirm(): Promise<void> {
    const kind = PING_INTERACTION[this.ping];
    if (kind === 'chat') { void this.remark(this.ping); return; }
    if (kind === 'unmark') { this.sendMarks(); return; }
    if (kind === 'mark') { this.beginMark(); return; }
    await this.answerVision();
  }

  /** Answers the vision question using the already-captured thumbnail. */
  private async answerVision(): Promise<void> {
    const s = this.getSettings();
    if (!s.apiKey) { this.send('assistant:answer', { text: this.text().assistantNoKey, thumbnail: null }); return; }
    const thumbnail = await this.capturePending();
    if (!thumbnail) { this.send('assistant:answer', { text: this.text().assistantNoKey, thumbnail: null }); return; }
    try {
      const client = new DeepSeekClient({ apiKey: s.apiKey, visionModel: s.visionModel, textModel: s.textModel });
      const reply = await client.streamVision(this.visionPrompt(), thumbnail, (chunk) => {
        this.send('assistant:delta', { text: chunk });
      });
      this.messages = [
        { role: 'system', content: this.systemPrompt() },
        { role: 'assistant', content: reply },
      ];
      this.send('assistant:answer', { text: reply, thumbnail, askPriority: this.ping === 'enemyvision' });
    } catch (err) {
      this.send('assistant:answer', { text: err instanceof Error ? err.message : 'Request failed', thumbnail });
    }
  }

  /** Mark flow step 1: ask whether to extract the screenshot or hand-write the note. */
  private beginMark(): void {
    this.markContent = null;
    this.send('assistant:mark-choose', {});
  }

  /** Mark flow (extract): summarise the captured region and show it for confirmation. */
  private async markExtract(): Promise<void> {
    const s = this.getSettings();
    if (!s.apiKey) { this.send('assistant:mark', { text: this.text().assistantNoKey }); return; }
    const thumbnail = await this.capturePending();
    if (!thumbnail) { this.send('assistant:mark', { text: this.text().assistantNoKey }); return; }
    try {
      const client = new DeepSeekClient({ apiKey: s.apiKey, visionModel: s.visionModel, textModel: s.textModel });
      this.markContent = await client.vision(this.text().assistantMarkPrompt, thumbnail);
      this.send('assistant:mark-preview', { content: this.markContent });
    } catch (err) {
      this.send('assistant:mark', { text: err instanceof Error ? err.message : 'Request failed' });
    }
  }

  /** Mark flow (note): ask the user to type the content by hand. */
  private markNote(): void {
    this.send('assistant:mark-note', {});
  }

  /** Mark flow: ask how long until the reminder. */
  private markTime(): void {
    const t = this.text();
    const options = MARK_TIME_OPTIONS.map((minutes) => ({ minutes, label: t.assistantPriorityTtlValue(minutes) }));
    this.send('assistant:mark-time', { options });
  }

  /** Stores the mark with its chosen reminder delay and confirms to the user. */
  private saveMark(minutes: number): void {
    const content = this.markContent ?? '';
    if (!content) return;
    const now = this.now();
    this.marks.push({ id: `${now}-${this.marks.length}`, content, createdAt: now, remindAt: now + minutes * 60 * 1000 });
    this.markContent = null;
    this.send('assistant:mark', { text: this.text().assistantMarked });
  }

  private sendMarks(): void {
    this.send('assistant:marks', { marks: this.marks.map((m) => ({ ...m })) });
  }

  /** Fires every due mark as a text reminder, then drops it. */
  private tickMarks(): void {
    if (this.marks.length === 0) return;
    const now = this.now();
    const due = this.marks.filter((m) => m.remindAt <= now);
    if (due.length === 0) return;
    this.marks = this.marks.filter((m) => m.remindAt > now);
    const t = this.text();
    this.showNotice(due.map((m) => t.assistantMarkDue(m.content)).join('\n'));
  }

  /** Brings the window up with a short passive notice and an OK to dismiss it. */
  private showNotice(text: string): void {
    this.ensureWindow();
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const d = screen.getPrimaryDisplay();
    const margin = 24;
    win.setBounds(clampRect(
      d.bounds.x + d.bounds.width - ASSISTANT_SIZE.width - margin,
      d.bounds.y + d.bounds.height - ASSISTANT_SIZE.height - margin,
      ASSISTANT_SIZE.width,
      ASSISTANT_SIZE.height,
      d.bounds,
    ));
    if (!win.isVisible()) win.show();
    win.focus();
    this.send('assistant:notice', { text });
  }

  /** The enemyvision follow-up: save the last answer as a priority for the TTL from settings. */
  private markPriority(): void {
    const last = this.messages.filter((m) => m.role === 'assistant').pop();
    const content = last && typeof last.content === 'string' ? last.content : '';
    if (!content) return;
    const now = this.now();
    const ttl = this.getSettings().priorityTtlMinutes * 60 * 1000;
    this.priorities.push({ id: `${now}-${this.priorities.length}`, content, createdAt: now, expiresAt: now + ttl });
    this.send('assistant:notice', { text: this.text().assistantPriorityMarked });
  }

  /** Drops priorities that have expired, returning a one-shot reminder for them (null when none). */
  private drainExpiredPriorities(): string | null {
    const now = this.now();
    const expired = this.priorities.filter((p) => p.expiresAt <= now);
    if (expired.length === 0) return null;
    this.priorities = this.priorities.filter((p) => p.expiresAt > now);
    const t = this.text();
    const sep = t.lang === 'zh-CN' ? '、' : ', ';
    return t.assistantPriorityExpired(expired.map((p) => p.content).join(sep));
  }

  /** Summarises the conversation's early turns once it outgrows the threshold, keeping the latest turns verbatim. */
  private async compressIfNeeded(client: DeepSeekClient): Promise<void> {
    const turns = this.messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    const chars = turns.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0);
    if (chars <= SUMMARY_CHAR_THRESHOLD || turns.length <= SUMMARY_KEEP_TURNS) return;
    const old = turns.slice(0, turns.length - SUMMARY_KEEP_TURNS);
    if (old.length === 0) return;
    const recent = turns.slice(turns.length - SUMMARY_KEEP_TURNS);
    const oldText = old.map((m) => `${m.role}: ${m.content}`).join('\n');
    try {
      const summary = await client.text([
        { role: 'system', content: 'Summarize this conversation so far. Keep key facts, decisions, user preferences and any open questions. Be concise.' },
        { role: 'user', content: oldText },
      ]);
      this.summary = summary;
      const system = this.messages.find((m) => m.role === 'system');
      this.messages = system ? [system, ...recent] : [...recent];
    } catch (err) {
      console.error('[assistant] summary failed', err);
      // Keep the full history on failure rather than losing context.
    }
  }

  /** A follow-up chat message, answered on the text model (with tools) and the conversation so far. */
  private async answer(text: string): Promise<void> {
    const s = this.getSettings();
    if (!s.apiKey) {
      this.send('assistant:answer', { text: this.text().assistantNoKey, thumbnail: null });
      return;
    }
    if (this.messages.length === 0) this.messages.push({ role: 'system', content: this.systemPrompt() });
    this.messages.push({ role: 'user', content: text });
    // Show "thinking…" while the ReAct loop runs (web_search / read_file take a moment).
    this.send('assistant:answer', { text: '', thumbnail: null });
    try {
      const client = new DeepSeekClient({ apiKey: s.apiKey, visionModel: s.visionModel, textModel: s.textModel });
      await this.compressIfNeeded(client);
      const reply = await this.agent(client, this.messages);
      console.log('[assistant] reply', reply.slice(0, 200));
      this.messages.push({ role: 'assistant', content: reply });
      this.send('assistant:answer', { text: reply, thumbnail: null });
    } catch (err) {
      console.error('[assistant] answer error', err);
      this.send('assistant:answer', { text: err instanceof Error ? err.message : 'Request failed', thumbnail: null });
    }
  }

  /** Runs the ReAct loop: the model may call tools (search / read file) until it has a final answer. */
  private async agent(client: DeepSeekClient, messages: ChatMessage[]): Promise<string> {
    const tools = this.tools();
    const msgs = [...messages];
    for (let i = 0; i < 4; i++) {
      const { content, toolCalls } = await client.chat(msgs, tools);
      console.log('[assistant] agent', i, 'content=', content ? content.length : 'null', 'calls=', toolCalls.length);
      if (content) return content;
      if (toolCalls.length === 0) throw new Error('DeepSeek returned no message content');
      for (const tc of toolCalls) {
        const result = await this.executeTool(tc.name, tc.arguments);
        console.log('[assistant] tool result', result.length);
        msgs.push({
          role: 'assistant',
          content: null,
          tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } }],
        });
        msgs.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
    }
    throw new Error('tool loop exceeded');
  }

  /** Runs one tool call and returns its text result (errors become text so the model can recover). */
  private async executeTool(name: string, argsJson: string): Promise<string> {
    try {
      const args = this.parseArgs(name, argsJson);
      console.log('[assistant] tool', name, args);
      if (name === 'web_search') return await webSearch(String(args.query ?? ''), this.getSettings().searchApiKey);
      if (name === 'read_file') return await readTextFile(String(args.path ?? ''));
      return `unknown tool: ${name}`;
    } catch (err) {
      console.error('[assistant] tool error', name, err);
      return `tool error: ${err instanceof Error ? err.message : 'failed'}`;
    }
  }

  /** Parses tool arguments, tolerating models that emit unescaped Windows backslashes in the JSON. */
  private parseArgs(name: string, argsJson: string): Record<string, unknown> {
    try {
      return JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      const key = name === 'read_file' ? 'path' : 'query';
      const m = argsJson.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
      return { [key]: m ? m[1] : '' };
    }
  }

  /** The tools the model may call while answering a chat message. */
  private tools(): Tool[] {
    return [
      {
        name: 'web_search',
        description: 'Search the web for current information. Returns titles, snippets and source URLs. Use when you are unsure or need up-to-date facts, and cite the source URLs when the user wants sources or links.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'The search query.' } },
          required: ['query'],
        },
      },
      {
        name: 'read_file',
        description: 'Read a text file at the given absolute path. Use forward slashes (e.g. D:/folder/file.txt). Only call this when the user explicitly asked you to read that file.',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string', description: 'Absolute path to the file, with forward slashes.' } },
          required: ['path'],
        },
      },
    ];
  }

  /** Replaces a chat ping's static opening line with a fresh one from the text model (keeps the static line on error). */
  private async remark(ping: PingId): Promise<void> {
    const s = this.getSettings();
    if (!s.apiKey) return; // no key: keep the static greeting
    const t = this.text();
    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt() },
      { role: 'user', content: t.assistantLinePrompt(t.pingNames[ping]) },
    ];
    try {
      const client = new DeepSeekClient({ apiKey: s.apiKey, visionModel: s.visionModel, textModel: s.textModel });
      const reply = await client.text(messages);
      this.messages = [...messages, { role: 'assistant', content: reply }];
      this.send('assistant:remark', { text: reply });
    } catch (err) {
      // Keep the static greeting on failure.
    }
  }

  /** The system prompt with the ping's tone, the conversation summary, and the live priorities. */
  private systemPrompt(): string {
    const t = this.text();
    const parts = [`${t.assistantSystem} ${t.assistantTone[this.tone]}`];
    if (this.summary) parts.push(`${t.assistantSummary}\n${this.summary}`);
    const active = this.priorities.filter((p) => p.expiresAt > this.now());
    if (active.length > 0) {
      parts.push(`${t.assistantPriorityContext}\n${active.map((p) => `- ${p.content}`).join('\n')}`);
    }
    return parts.join('\n\n');
  }

  /** The vision prompt with the ping's tone. */
  private visionPrompt(): string {
    return `${this.text().assistantVisionPrompt} ${this.text().assistantTone[this.tone]}`;
  }

  /** Starts the leave animation; the renderer reports back through `done()` and the window is hidden then. */
  private hide(): void {
    this.send('assistant:hide', null);
  }

  private finishHide(): void {
    this.messages = [];
    const s = this.getSettings();
    if (s.assistantEnabled && s.assistantIdleOn) {
      this.presentIdle();
    } else if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  /** Enters the region editor: the window covers the display, and the renderer draws a draggable rectangle. */
  private startAdjust(): void {
    const display = this.display;
    const region = this.region;
    const win = this.win;
    if (!display || !region || !win || win.isDestroyed()) return;
    win.setBounds(display.bounds);
    this.send('assistant:region', {
      rect: { x: region.x - display.bounds.x, y: region.y - display.bounds.y, width: region.width, height: region.height },
      scale: IS_MAC ? 1 : display.scaleFactor,
    });
  }

  /** The user confirmed a new region (window-local DIP): store it and re-show the confirmation (no capture yet). */
  private finishAdjust(rect: Rect): void {
    const display = this.display;
    if (!display) return;
    this.region = { x: display.bounds.x + rect.x, y: display.bounds.y + rect.y, width: rect.width, height: rect.height };
    this.present();
  }

  /** The user closed the region editor without changing anything: just restore the small window. */
  private cancelAdjust(): void {
    this.present();
  }

  private ensureWindow(): void {
    if (this.win && !this.win.isDestroyed()) return;
    const win = new BrowserWindow({
      width: ASSISTANT_SIZE.width,
      height: ASSISTANT_SIZE.height,
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: true,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      type: IS_MAC ? 'panel' : 'toolbar',
      webPreferences: {
        preload: preloadPath('assistant'),
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
        spellcheck: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    // Click through the transparent parts; the renderer turns interactivity on when the cursor is over the popup.
    win.setIgnoreMouseEvents(true, { forward: true });
    if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.webContents.on('did-finish-load', () => {
      console.log('[assistant] page loaded');
      void win.webContents
        .executeJavaScript(`JSON.stringify({ assistant: typeof window.assistant, overlay: typeof window.overlay, popup: !!document.getElementById('popup'), sprite: !!document.getElementById('sprite') })`)
        .then((s) => console.log('[assistant] dom', s))
        .catch((e) => console.error('[assistant] dom-check failed', e));
      this.loaded = true;
      if (this.pending && this.debounceTimer === null) this.present();
      else if (this.idleRequested) this.presentIdle();
    });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error('[assistant] page load failed', code, desc);
    });
    win.webContents.on('console-message', (_e, level, message) => {
      console.log(`[assistant-renderer:${level}]`, message);
    });
    void loadPage(win, 'assistant');
    this.win = win;
  }

  /** Captures a rectangle on `display` (a DIP rect) as a PNG `data:` URL. */
  private async capture(display: Display, region: Rect): Promise<string | null> {
    const scale = IS_MAC ? 1 : display.scaleFactor;
    const phys = (IS_MAC ? display.bounds : screen.dipToScreenRect(null, display.bounds)) as Rectangle;
    return captureRect(display.id, phys, display.bounds, scale, region);
  }

  /** Captures the pending region now (called only after the user confirmed, when input latency no longer matters). */
  private async capturePending(): Promise<string | null> {
    const display = this.display;
    const region = this.region;
    if (!display || !region) return null;
    try {
      return await this.capture(display, region);
    } catch (err) {
      console.error('[assistant] capture failed', err);
      return null;
    }
  }

  private send<C extends AssistantChannel>(channel: C, payload: AssistantEvents[C]): void {
    const w = this.win;
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}
