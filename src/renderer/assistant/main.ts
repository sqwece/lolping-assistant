import type { AssistantCharacter, InteractionKind, MarkEntry, Movement } from '../../shared/assistant';
import type { AssistantUi } from '../../shared/ipc';
import { imageSheet, placeholderSheet, SpritePlayer } from './sprite';

const sprite = document.getElementById('sprite') as HTMLElement;
const spriteArt = document.getElementById('sprite-art') as HTMLCanvasElement;
const popup = document.getElementById('popup') as HTMLElement;
const thumb = document.getElementById('thumb') as HTMLImageElement;
const thumbRow = thumb.parentElement as HTMLElement;
const popupText = document.getElementById('popup-text') as HTMLElement;
const actions = document.getElementById('popup-actions') as HTMLElement;
const chat = document.getElementById('chat') as HTMLElement;
const chatLog = document.getElementById('chat-log') as HTMLElement;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const yesBtn = document.getElementById('yes') as HTMLButtonElement;
const noBtn = document.getElementById('no') as HTMLButtonElement;
const askBtn = document.getElementById('ask') as HTMLButtonElement;
const closeBtn = document.getElementById('close') as HTMLButtonElement;
const enlargeBtn = document.getElementById('enlarge') as HTMLButtonElement;
const dragHandle = document.getElementById('drag') as HTMLElement;
const sendBtn = document.getElementById('chat-send') as HTMLButtonElement;
const adjustBtn = document.getElementById('adjust') as HTMLButtonElement;
const tag = document.querySelector('.sprite-tag') as HTMLElement;

const marks = document.getElementById('marks') as HTMLElement;
const marksList = document.getElementById('marks-list') as HTMLElement;
const marksDelete = document.getElementById('marks-delete') as HTMLButtonElement;

const region = document.getElementById('region') as HTMLElement;
const regionBox = document.getElementById('region-box') as HTMLElement;
const regionSize = document.getElementById('region-size') as HTMLElement;
const regionOk = document.getElementById('region-ok') as HTMLButtonElement;
const regionCancel = document.getElementById('region-cancel') as HTMLButtonElement;

const markFlow = document.getElementById('mark-flow') as HTMLElement;
const markChoose = document.getElementById('mark-choose') as HTMLElement;
const markExtract = document.getElementById('mark-extract') as HTMLButtonElement;
const markNoteBtn = document.getElementById('mark-note-btn') as HTMLButtonElement;
const markPreview = document.getElementById('mark-preview') as HTMLElement;
const markPreviewText = document.getElementById('mark-preview-text') as HTMLElement;
const markConfirm = document.getElementById('mark-confirm') as HTMLButtonElement;
const markReselect = document.getElementById('mark-reselect') as HTMLButtonElement;
const markNote = document.getElementById('mark-note') as HTMLElement;
const markNoteInput = document.getElementById('mark-note-input') as HTMLInputElement;
const markNoteOk = document.getElementById('mark-note-ok') as HTMLButtonElement;
const markTime = document.getElementById('mark-time') as HTMLElement;
const markTimeTitle = document.getElementById('mark-time-title') as HTMLElement;
const markTimeOptions = document.getElementById('mark-time-options') as HTMLElement;

const priority = document.getElementById('priority') as HTMLElement;
const priorityAsk = document.getElementById('priority-ask') as HTMLElement;
const priorityYes = document.getElementById('priority-yes') as HTMLButtonElement;
const priorityNo = document.getElementById('priority-no') as HTMLButtonElement;

const ENTER_CLASSES = ['enter-teleport', 'enter-jump', 'enter-dash', 'enter-fly', 'leave'] as const;

/** How long each movement animation runs, in ms; the popup shows when it ends (with a timeout fallback). */
const MOVEMENT_MS: Record<Movement, number> = { teleport: 360, jump: 610, dash: 410, fly: 510 };

const MIN_REGION = 40;

type Turn = { who: 'assistant' | 'user'; text: string };
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let ui: AssistantUi = {
  confirm: 'Confirm', cancel: 'Cancel', ask: 'Ask', thinking: 'Thinking…', placeholder: 'Ask…',
  adjust: 'Adjust', noMarks: 'No marks yet', deleteMarks: 'Delete selected', copy: 'Copy', copied: 'Copied',
  enlarge: 'Enlarge', fullscreen: 'Full screen', restore: 'Restore',
  markExtract: 'Extract from screenshot', markNote: 'Write it myself', markReselect: 'Reselect',
  markNotePlaceholder: 'What to remember…', markTimeTitle: 'Remind me in',
  priorityAsk: 'Mark this as a priority?', priorityMark: 'Mark it', prioritySkip: 'Not now',
};
let turns: Turn[] = [];
let regionRect: Rect = { x: 0, y: 0, width: 800, height: 800 };
let regionScale = 1;
let kind: InteractionKind = 'vision';
let sizeMode: 'normal' | 'half' | 'full' = 'normal';
/** A passive notice (a due mark / expired priority) is showing; the "Yes" button dismisses instead of confirming. */
let noticeMode = false;
/** An answer is streaming in chunk by chunk; the last turn is being appended to. */
let streaming = false;

function setSizeMode(mode: 'normal' | 'half' | 'full'): void {
  sizeMode = mode;
  document.body.dataset.size = mode;
  enlargeBtn.textContent = mode === 'normal' ? ui.enlarge : mode === 'half' ? ui.fullscreen : ui.restore;
}

const player = new SpritePlayer(spriteArt, placeholderSheet('#5b8cff', '#2f6bff'), 12);
player.start();

// Chibi Gwen sprite sheet (3 gesture poses). Loaded async; the placeholder face shows until it's ready.
const GWEN_SHEET_URL = '../sprite/gwen-sheet.png';
const gwenImage = new Image();
gwenImage.onload = () => {
  player.setSheet(
    imageSheet(gwenImage, 256, 256, 16, {
      idle: { first: 0, count: 16 },
      idle_in: { first: 16, count: 12 },
      walk: { first: 28, count: 16 },
      run: { first: 44, count: 16 },
      haste: { first: 60, count: 16 },
      jump: { first: 76, count: 12 },
      greet: { first: 88, count: 12 },
      dive_in: { first: 100, count: 12 },
      dive_out: { first: 112, count: 12 },
      cast_start: { first: 124, count: 12 },
      think: { first: 136, count: 16 },
      interact: { first: 152, count: 12 },
      laugh: { first: 164, count: 12 },
      laugh2: { first: 176, count: 12 },
      dance_in: { first: 188, count: 12 },
      dance: { first: 200, count: 16 },
      doll: { first: 216, count: 16 },
      taunt: { first: 232, count: 12 },
      hurt: { first: 244, count: 12 },
      celebrate: { first: 256, count: 12 },
      recall: { first: 268, count: 12 },
      recall_out: { first: 280, count: 12 },
      death: { first: 292, count: 12 },
      drag: { first: 216, count: 16 },
    }),
  );
};
gwenImage.src = GWEN_SHEET_URL;

// ---- idle variety: occasional cute actions while idle on the desktop ----
let idleVarietyTimer: ReturnType<typeof setTimeout> | null = null;

function cancelIdleVariety(): void {
  if (idleVarietyTimer !== null) {
    clearTimeout(idleVarietyTimer);
    idleVarietyTimer = null;
  }
}

function scheduleIdleVariety(): void {
  cancelIdleVariety();
  idleVarietyTimer = setTimeout(playIdleVariety, 12000 + Math.random() * 18000);
}

function playIdleVariety(): void {
  const roll = Math.random();
  if (roll < 0.3) player.playOnce('laugh', 'idle');
  else if (roll < 0.5) player.playOnce('laugh2', 'idle');
  else if (roll < 0.7) player.playOnce('taunt', 'idle');
  else if (roll < 0.85) player.playOnce('doll', 'idle');
  else {
    player.playSequence(['dance_in'], 'dance');
    setTimeout(() => player.playSequence(['idle_in'], 'idle'), 4000);
  }
  scheduleIdleVariety();
}

// ---- usage-too-long reminder: Gwen faints to nudge a break ----
const USAGE_LIMIT_MS = 30 * 60 * 1000;
let usageTimer: ReturnType<typeof setTimeout> | null = null;

function armUsageReminder(): void {
  if (usageTimer !== null) clearTimeout(usageTimer);
  usageTimer = setTimeout(() => {
    player.playOnce('death', 'idle');
    armUsageReminder();
  }, USAGE_LIMIT_MS);
}

let autoHide: ReturnType<typeof setTimeout> | null = null;

function cancelAutoHide(): void {
  if (autoHide !== null) {
    clearTimeout(autoHide);
    autoHide = null;
  }
}

function scheduleAutoHide(): void {
  cancelAutoHide();
  autoHide = setTimeout(() => window.assistant.dismiss(), 4000);
}

/** Plays a one-shot CSS animation on the sprite and resolves when it ends (or after `ms`, whichever first). */
function animate(name: (typeof ENTER_CLASSES)[number], ms: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      sprite.removeEventListener('animationend', finish);
      resolve();
    };
    sprite.addEventListener('animationend', finish);
    sprite.classList.remove(...ENTER_CLASSES);
    void sprite.offsetWidth; // restart the animation from its first frame
    sprite.classList.add(name);
    setTimeout(finish, ms);
  });
}

function setCharacter(character: AssistantCharacter): void {
  sprite.dataset.character = character;
  tag.textContent = character === 'none' ? '' : character;
}

function applyLabels(): void {
  yesBtn.textContent = ui.confirm;
  noBtn.textContent = ui.cancel;
  askBtn.textContent = ui.ask;
  sendBtn.textContent = ui.ask;
  chatInput.placeholder = ui.placeholder;
  adjustBtn.textContent = ui.adjust;
  regionOk.textContent = ui.confirm;
  regionCancel.textContent = ui.cancel;
  marksDelete.textContent = ui.deleteMarks;
}

function renderChat(): void {
  chatLog.textContent = '';
  for (const t of turns) {
    const line = document.createElement('div');
    line.className = `chat-line ${t.who}`;
    renderMessage(line, t.text);
    chatLog.appendChild(line);
  }
  chatLog.scrollTop = chatLog.scrollHeight;
}

/** Renders text with ``` code blocks as copyable <pre> blocks. */
function renderMessage(el: HTMLElement, text: string): void {
  el.textContent = '';
  const parts = text.split(/```/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) el.appendChild(codeBlock(parts[i]));
    else if (parts[i]) el.appendChild(document.createTextNode(parts[i]));
  }
}

function codeBlock(raw: string): HTMLElement {
  const code = raw.replace(/^\w*\r?\n/, '');
  const wrap = document.createElement('div');
  wrap.className = 'code-block';
  const pre = document.createElement('pre');
  pre.textContent = code;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'code-copy';
  btn.textContent = ui.copy;
  btn.addEventListener('click', () => {
    void navigator.clipboard.writeText(code).then(() => {
      btn.textContent = ui.copied;
      setTimeout(() => { btn.textContent = ui.copy; }, 1500);
    });
  });
  wrap.append(btn, pre);
  return wrap;
}

function addTurn(turn: Turn): void {
  turns.push(turn);
  renderChat();
}

function send(): void {
  const value = chatInput.value.trim();
  if (!value) return;
  addTurn({ who: 'user', text: value });
  chatInput.value = '';
  window.assistant.ask(value);
}

function setThumbnail(url: string | null): void {
  if (url) {
    thumb.src = url;
    thumbRow.classList.remove('hidden');
  } else {
    thumbRow.classList.add('hidden');
  }
}

/** The first screen of every ping: the greeting (and, for vision/mark, a screenshot) plus [confirm][cancel]. */
function showConfirmation(showAdjust: boolean): void {
  actions.classList.remove('hidden');
  askBtn.classList.add('hidden');
  yesBtn.classList.remove('hidden');
  noBtn.classList.remove('hidden');
  chat.classList.add('hidden');
  document.body.classList.remove('chat-open');
  if (showAdjust) adjustBtn.classList.remove('hidden');
  else adjustBtn.classList.add('hidden');
  marks.classList.add('hidden');
  markFlow.classList.add('hidden');
  priority.classList.add('hidden');
  noticeMode = false;
}

/** Shows one stage of the mark flow (choose → preview / note → time), replacing the confirm buttons. */
function showMarkFlow(stage: 'choose' | 'preview' | 'note' | 'time'): void {
  noticeMode = false;
  actions.classList.add('hidden');
  chat.classList.add('hidden');
  marks.classList.add('hidden');
  region.classList.add('hidden');
  priority.classList.add('hidden');
  popup.classList.add('shown');
  markFlow.classList.remove('hidden');
  markChoose.classList.toggle('hidden', stage !== 'choose');
  markPreview.classList.toggle('hidden', stage !== 'preview');
  markNote.classList.toggle('hidden', stage !== 'note');
  markTime.classList.toggle('hidden', stage !== 'time');
}

function renderMarks(entries: MarkEntry[]): void {
  marksList.textContent = '';
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'marks-empty';
    empty.textContent = ui.noMarks;
    marksList.appendChild(empty);
    marksDelete.classList.add('hidden');
    return;
  }
  marksDelete.classList.remove('hidden');
  for (const m of entries) {
    const row = document.createElement('label');
    row.className = 'mark-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = m.id;
    const content = document.createElement('span');
    content.className = 'mark-content';
    content.textContent = m.content;
    const time = document.createElement('span');
    time.className = 'mark-time';
    time.textContent = new Date(m.createdAt).toLocaleTimeString();
    row.append(cb, content, time);
    marksList.appendChild(row);
  }
}

// ---- region editor ----

function clampRegion(r: Rect): Rect {
  const w = Math.max(MIN_REGION, r.width);
  const h = Math.max(MIN_REGION, r.height);
  const x = Math.max(0, Math.min(r.x, window.innerWidth - w));
  const y = Math.max(0, Math.min(r.y, window.innerHeight - h));
  return { x, y, width: w, height: h };
}

function renderRegion(): void {
  regionBox.style.left = `${regionRect.x}px`;
  regionBox.style.top = `${regionRect.y}px`;
  regionBox.style.width = `${regionRect.width}px`;
  regionBox.style.height = `${regionRect.height}px`;
  const px = (n: number): number => Math.round(n * regionScale);
  regionSize.textContent = `${px(regionRect.width)} × ${px(regionRect.height)} px`;
}

interface Drag {
  kind: 'move' | 'resize';
  corner: 'nw' | 'ne' | 'sw' | 'se';
  startX: number;
  startY: number;
  rect: Rect;
}

let drag: Drag | null = null;

function startMove(e: MouseEvent): void {
  drag = { kind: 'move', corner: 'se', startX: e.clientX, startY: e.clientY, rect: { ...regionRect } };
}

function startResize(corner: 'nw' | 'ne' | 'sw' | 'se', e: MouseEvent): void {
  e.stopPropagation();
  drag = { kind: 'resize', corner, startX: e.clientX, startY: e.clientY, rect: { ...regionRect } };
}

function onMove(e: MouseEvent): void {
  if (!drag) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  const r = drag.rect;
  if (drag.kind === 'move') {
    regionRect = clampRegion({ x: r.x + dx, y: r.y + dy, width: r.width, height: r.height });
  } else {
    const { corner } = drag;
    regionRect = clampRegion({
      x: corner === 'ne' || corner === 'se' ? r.x : r.x + dx,
      y: corner === 'sw' || corner === 'se' ? r.y : r.y + dy,
      width: corner === 'nw' || corner === 'sw' ? r.width - dx : r.width + dx,
      height: corner === 'nw' || corner === 'ne' ? r.height - dy : r.height + dy,
    });
  }
  renderRegion();
}

function endDrag(): void {
  drag = null;
}

regionBox.addEventListener('mousedown', startMove);
for (const h of document.querySelectorAll<HTMLElement>('.handle')) {
  h.addEventListener('mousedown', (e) => startResize((h.dataset.corner ?? 'se') as 'nw' | 'ne' | 'sw' | 'se', e));
}
window.addEventListener('mousemove', onMove);
window.addEventListener('mouseup', endDrag);

regionOk.addEventListener('click', () => window.assistant.adjusted(regionRect));
regionCancel.addEventListener('click', () => window.assistant.adjustCancel());
window.addEventListener('keydown', (e) => {
  if (!region.classList.contains('hidden')) {
    if (e.key === 'Enter') window.assistant.adjusted(regionRect);
    else if (e.key === 'Escape') window.assistant.adjustCancel();
  }
});

// ---- IPC ----

window.assistant.on('assistant:show', (p) => {
  delete document.body.dataset.idle;
  ui = p.ui;
  applyLabels();
  kind = p.kind;
  setSizeMode('normal');
  setCharacter(p.character);
  turns = [{ who: 'assistant', text: p.greeting }];
  renderChat();
  renderMessage(popupText, p.greeting);
  region.classList.add('hidden');
  popup.classList.remove('shown');
  setThumbnail(p.thumbnail);
  showConfirmation(kind === 'vision' || kind === 'mark');
  if (p.character === 'none') {
    sprite.style.display = 'none';
    popup.classList.add('shown');
  } else {
    sprite.style.display = '';
    cancelIdleVariety();
    if (p.movement === 'jump') player.playOnce('jump', 'idle');
    else player.playOnce('greet', 'idle');
    void animate(`enter-${p.movement}`, MOVEMENT_MS[p.movement]).then(() => {
      player.playSequence(['idle_in'], 'idle');
      popup.classList.add('shown');
    });
  }
});

window.assistant.on('assistant:thumbnail', (p) => {
  setThumbnail(p.thumbnail);
});

window.assistant.on('assistant:emote', (p) => {
  player.playOnce(p.action, 'idle');
});

window.assistant.on('assistant:answer', (p) => {
  region.classList.add('hidden');
  setThumbnail(p.thumbnail);
  if (p.text === '') {
    // Answer is being generated: show "thinking…" and open a streaming turn.
    if (!streaming) {
      streaming = true;
      turns.push({ who: 'assistant', text: '' });
      renderChat();
      player.playSequence(['cast_start'], 'think');
    }
    renderMessage(popupText, ui.thinking);
    return;
  }
  if (streaming) {
    turns[turns.length - 1] = { who: 'assistant', text: p.text };
    streaming = false;
    renderChat();
  } else {
    addTurn({ who: 'assistant', text: p.text });
  }
  renderMessage(popupText, p.text);
  popup.classList.add('shown');
  player.playOnce('celebrate', 'idle');
  if (kind === 'vision') {
    chat.classList.add('hidden');
    document.body.classList.remove('chat-open');
    if (p.askPriority) {
      priorityAsk.textContent = ui.priorityAsk;
      priorityYes.textContent = ui.priorityMark;
      priorityNo.textContent = ui.prioritySkip;
      actions.classList.add('hidden');
      priority.classList.remove('hidden');
    } else {
      priority.classList.add('hidden');
      actions.classList.remove('hidden');
      yesBtn.classList.add('hidden');
      noBtn.classList.add('hidden');
      askBtn.classList.remove('hidden');
      adjustBtn.classList.add('hidden');
    }
  }
});

window.assistant.on('assistant:delta', (p) => {
  if (!streaming) {
    streaming = true;
    turns.push({ who: 'assistant', text: '' });
    renderChat();
  }
  const last = turns[turns.length - 1];
  last.text += p.text;
  renderChat();
  renderMessage(popupText, last.text);
});

window.assistant.on('assistant:remark', (p) => {
  // Replace the static opening line of a chat ping with the freshly generated one.
  if (turns.length > 0) turns[0] = { who: 'assistant', text: p.text };
  else turns.push({ who: 'assistant', text: p.text });
  renderChat();
  renderMessage(popupText, p.text);
});

window.assistant.on('assistant:mark', (p) => {
  markFlow.classList.add('hidden');
  renderMessage(popupText, p.text);
  yesBtn.classList.add('hidden');
  noBtn.classList.add('hidden');
  askBtn.classList.add('hidden');
  scheduleAutoHide();
});

window.assistant.on('assistant:idle', (p) => {
  document.body.dataset.idle = 'true';
  setSizeMode('normal');
  noticeMode = false;
  setCharacter(p.character);
  markFlow.classList.add('hidden');
  priority.classList.add('hidden');
  marks.classList.add('hidden');
  chat.classList.add('hidden');
  document.body.classList.remove('chat-open');
  region.classList.add('hidden');
  popup.classList.remove('shown');
  cancelAutoHide();
  if (p.character === 'none') {
    sprite.style.display = 'none';
  } else {
    sprite.classList.remove(...ENTER_CLASSES);
    sprite.style.display = '';
    player.play('idle');
    scheduleIdleVariety();
  }
});

window.assistant.on('assistant:notice', (p) => {
  delete document.body.dataset.idle;
  noticeMode = true;
  markFlow.classList.add('hidden');
  priority.classList.add('hidden');
  chat.classList.add('hidden');
  marks.classList.add('hidden');
  region.classList.add('hidden');
  document.body.classList.remove('chat-open');
  renderMessage(popupText, p.text);
  popup.classList.add('shown');
  actions.classList.remove('hidden');
  yesBtn.classList.remove('hidden');
  yesBtn.textContent = ui.confirm;
  noBtn.classList.add('hidden');
  askBtn.classList.add('hidden');
  adjustBtn.classList.add('hidden');
});

window.assistant.on('assistant:mark-choose', () => {
  showMarkFlow('choose');
  markExtract.textContent = ui.markExtract;
  markNoteBtn.textContent = ui.markNote;
});

window.assistant.on('assistant:mark-preview', (p) => {
  showMarkFlow('preview');
  markPreviewText.textContent = p.content;
  markConfirm.textContent = ui.confirm;
  markReselect.textContent = ui.markReselect;
});

window.assistant.on('assistant:mark-note', () => {
  showMarkFlow('note');
  markNoteInput.value = '';
  markNoteInput.placeholder = ui.markNotePlaceholder;
  markNoteOk.textContent = ui.confirm;
  markNoteInput.focus();
});

window.assistant.on('assistant:mark-time', (p) => {
  showMarkFlow('time');
  markTimeTitle.textContent = ui.markTimeTitle;
  markTimeOptions.textContent = '';
  for (const o of p.options) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = o.label;
    b.addEventListener('click', () => window.assistant.markTimeSet(o.minutes));
    markTimeOptions.appendChild(b);
  }
});

window.assistant.on('assistant:marks', (p) => {
  renderMarks(p.marks);
  chat.classList.add('hidden');
  yesBtn.classList.add('hidden');
  noBtn.classList.add('hidden');
  askBtn.classList.add('hidden');
  adjustBtn.classList.add('hidden');
  marks.classList.remove('hidden');
  popup.classList.add('shown');
});

window.assistant.on('assistant:hide', () => {
  cancelAutoHide();
  popup.classList.remove('shown');
  if (sprite.style.display === 'none') window.assistant.done();
  else void animate('leave', 300).then(() => window.assistant.done());
});

window.assistant.on('assistant:region', (p) => {
  regionRect = clampRegion({ ...p.rect });
  regionScale = p.scale;
  renderRegion();
  popup.classList.remove('shown');
  region.classList.remove('hidden');
});

window.assistant.on('assistant:size', (p) => {
  setSizeMode(p.mode);
});

adjustBtn.addEventListener('click', () => window.assistant.adjust());
enlargeBtn.addEventListener('click', () => window.assistant.resize());
yesBtn.addEventListener('click', () => {
  cancelAutoHide();
  if (noticeMode) {
    noticeMode = false;
    window.assistant.dismiss();
    return;
  }
  const interactions: Array<'interact' | 'laugh' | 'taunt'> = ['interact', 'laugh', 'taunt'];
  player.playOnce(interactions[Math.floor(Math.random() * interactions.length)], 'idle');
  actions.classList.add('hidden');
  if (kind === 'vision' || kind === 'mark') renderMessage(popupText, ui.thinking);
  if (kind === 'chat') {
    chat.classList.remove('hidden');
    document.body.classList.add('chat-open');
    chatInput.focus();
  }
  window.assistant.confirm();
});
noBtn.addEventListener('click', () => { cancelAutoHide(); player.playOnce('hurt', 'idle'); window.assistant.dismiss(); });
closeBtn.addEventListener('click', () => { cancelAutoHide(); player.playOnce('hurt', 'idle'); window.assistant.dismiss(); });
askBtn.addEventListener('click', () => {
  actions.classList.add('hidden');
  chat.classList.remove('hidden');
  document.body.classList.add('chat-open');
  chatInput.focus();
});
marksDelete.addEventListener('click', () => {
  const ids = [...marksList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')].map((c) => c.value);
  if (ids.length > 0) window.assistant.unmark(ids);
});
markExtract.addEventListener('click', () => window.assistant.markChoice('extract'));
markNoteBtn.addEventListener('click', () => window.assistant.markChoice('note'));
markConfirm.addEventListener('click', () => window.assistant.markPreviewOk(true));
markReselect.addEventListener('click', () => window.assistant.markPreviewOk(false));
const submitNote = (): void => {
  const v = markNoteInput.value.trim();
  if (v) window.assistant.markNoteText(v);
};
markNoteOk.addEventListener('click', submitNote);
markNoteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitNote();
});
priorityYes.addEventListener('click', () => {
  priority.classList.add('hidden');
  window.assistant.priorityMark();
});
priorityNo.addEventListener('click', () => {
  priority.classList.add('hidden');
  actions.classList.remove('hidden');
  askBtn.classList.remove('hidden');
});
sendBtn.addEventListener('click', send);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') send();
});

// Click-through: only the popup, sprite and region editor capture the mouse; the transparent parts pass clicks through.
let interactive = false;
window.addEventListener('mousemove', (e) => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const regionOpen = !region.classList.contains('hidden');
  const overPopup = el !== null && el.closest('#popup') !== null;
  const overSprite = el !== null && el.closest('#sprite') !== null;
  const next = regionOpen || overPopup || overSprite;
  if (next !== interactive) {
    interactive = next;
    window.assistant.setInteractive(next);
  }
});

// Dragging the sprite (or the popup's drag handle) moves the whole window.
let dragging = false;
function startDrag(e: MouseEvent): void {
  if (e.button !== 0) return;
  dragging = true;
  player.play('drag');
  window.assistant.drag('start');
}
sprite.addEventListener('mousedown', startDrag);
dragHandle.addEventListener('mousedown', startDrag);
window.addEventListener('mousemove', () => {
  if (dragging) window.assistant.drag('move');
});
window.addEventListener('mouseup', () => {
  if (dragging) {
    dragging = false;
    player.play('idle');
    window.assistant.drag('end');
  }
});

applyLabels();
setSizeMode('normal');
armUsageReminder();
