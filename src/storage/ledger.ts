// 保管账本：录音登记、容量账本与持久化（唯一事实来源）
// 每条录音登记：句子、日期、体积、保留至，以及最近复听日期。

export type Mastery = 'new' | 'practice' | 'mastered';

export interface Phrase {
  id: number;
  text: string;
  translation: string;
  tag: string;
  level: '入门' | '进阶' | '挑战';
  status: Mastery;
  attempts: number;
  last?: string;
}

export interface Recording {
  id: string;
  phraseId: number;
  date: string; // 录音日期 YYYY-MM-DD
  sizeKb: number; // 体积（KB）
  retainUntil: string; // 保留至 YYYY-MM-DD
  lastReplayed?: string; // 最近复听日期
  durationSec: number;
}

// 待保存录音：尚未登记入账本，存在期间整批清理必须阻止
export interface PendingTake {
  phraseId: number;
  date: string;
  sizeKb: number;
  durationSec: number;
}

export interface Capacity {
  totalKb: number;
  usedKb: number;
  remainingKb: number;
  usedRatio: number;
}

export const CAPACITY_KB = 2048; // 离线保管总容量 2 MB
const LEDGER_KEY = 'sound-lab-recordings-v1';
const PHRASE_KEY = 'sound-lab-phrases';
const DAY_MS = 24 * 60 * 60 * 1000;

export const seedPhrases: Phrase[] = [
  { id: 1, text: 'The morning light feels different today.', translation: '今天的晨光感觉不一样。', tag: '日常', level: '入门', status: 'practice', attempts: 3, last: '今天 09:24' },
  { id: 2, text: 'Could you walk me through the next step?', translation: '你能带我了解下一步吗？', tag: '工作', level: '进阶', status: 'new', attempts: 0 },
  { id: 3, text: 'I appreciate your patience and thoughtful feedback.', translation: '感谢你的耐心和细致反馈。', tag: '表达', level: '挑战', status: 'mastered', attempts: 8, last: '昨天 18:10' },
  { id: 4, text: 'Let’s make room for a little curiosity.', translation: '给好奇心留一点空间。', tag: '灵感', level: '入门', status: 'new', attempts: 0 },
  { id: 5, text: 'Every small rehearsal builds a steadier voice.', translation: '每一次小声的排练，都让声音更稳。', tag: '表达', level: '进阶', status: 'mastered', attempts: 6, last: '09-10' },
];

// 种子账本：含「旧版本可清 / 最新版本受保护 / 未掌握 / 未过保留期」等情形
export const seedRecordings: Recording[] = [
  { id: 'rec-1', phraseId: 3, date: '2026-08-04', sizeKb: 260, retainUntil: '2026-08-18', lastReplayed: '2026-08-20', durationSec: 11 },
  { id: 'rec-2', phraseId: 3, date: '2026-08-19', sizeKb: 320, retainUntil: '2026-09-02', lastReplayed: '2026-09-01', durationSec: 13 },
  { id: 'rec-3', phraseId: 3, date: '2026-09-13', sizeKb: 300, retainUntil: '2026-09-20', durationSec: 12 },
  { id: 'rec-4', phraseId: 1, date: '2026-09-20', sizeKb: 240, retainUntil: '2026-10-20', durationSec: 10 },
  { id: 'rec-5', phraseId: 5, date: '2026-08-10', sizeKb: 280, retainUntil: '2026-08-24', lastReplayed: '2026-09-16', durationSec: 12 },
];

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseISO(iso: string): number {
  return new Date(`${iso}T00:00:00`).getTime();
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(parseISO(iso) + days * DAY_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// b - a 的整天数
export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b) - parseISO(a)) / DAY_MS);
}

// 体积估算：约 24 KB/秒 + 固定帧头
export function estimateSize(durationSec: number): number {
  return Math.max(48, Math.round(64 + durationSec * 24));
}

export function capacityOf(recordings: Recording[]): Capacity {
  const usedKb = recordings.reduce((sum, r) => sum + r.sizeKb, 0);
  return {
    totalKb: CAPACITY_KB,
    usedKb,
    remainingKb: CAPACITY_KB - usedKb,
    usedRatio: Math.min(1, usedKb / CAPACITY_KB),
  };
}

export function formatSize(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb} KB`;
}

export function loadPhrases(): Phrase[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PHRASE_KEY) || '') as Phrase[] | null;
    if (Array.isArray(stored) && stored.length) return mergeSeedPhrases(stored);
  } catch {
    /* 落库损坏时回退种子 */
  }
  return seedPhrases;
}

export function savePhrases(phrases: Phrase[]): void {
  localStorage.setItem(PHRASE_KEY, JSON.stringify(phrases));
}

// 旧版本句子库升级时补入新增种子句子，保证录音引用不悬空
function mergeSeedPhrases(stored: Phrase[]): Phrase[] {
  const ids = new Set(stored.map((p) => p.id));
  return [...stored, ...seedPhrases.filter((p) => !ids.has(p.id))];
}

export function loadLedger(): Recording[] {
  try {
    const stored = JSON.parse(localStorage.getItem(LEDGER_KEY) || '') as Recording[] | null;
    if (Array.isArray(stored)) return stored;
  } catch {
    /* 落库损坏时回退种子 */
  }
  return seedRecordings;
}

export function saveLedger(recordings: Recording[]): void {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(recordings));
}
