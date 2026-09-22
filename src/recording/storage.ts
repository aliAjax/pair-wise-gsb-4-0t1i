// 初始数据与本地保管：沿用 localStorage 模式，键独立于旧版句子库。

import type { LabState, Phrase, Recording } from './types';
import { offsetISO, todayISO } from './time';

const STORAGE_KEY = 'sound-lab-vault-v1';

const basePhrases: Phrase[] = [
  { id: 1, text: 'The morning light feels different today.', translation: '今天的晨光感觉不一样。', tag: '日常', level: '入门', status: 'practice', attempts: 3, last: '今天 09:24' },
  { id: 2, text: 'Could you walk me through the next step?', translation: '你能带我了解下一步吗？', tag: '工作', level: '进阶', status: 'new', attempts: 0 },
  { id: 3, text: 'I appreciate your patience and thoughtful feedback.', translation: '感谢你的耐心和细致反馈。', tag: '表达', level: '挑战', status: 'mastered', attempts: 8, last: '昨天 18:10' },
  { id: 4, text: 'Let’s make room for a little curiosity.', translation: '给好奇心留一点空间。', tag: '灵感', level: '入门', status: 'new', attempts: 0 },
  { id: 5, text: 'Practice the shadowing rhythm slowly first.', translation: '先慢慢练习跟读的节奏。', tag: '日常', level: '进阶', status: 'mastered', attempts: 6, last: '3 天前' },
  { id: 6, text: 'Every old recording tells a small story.', translation: '每一条旧录音都藏着一段小故事。', tag: '表达', level: '入门', status: 'mastered', attempts: 2, last: '9 天前' },
];

/** 离线容量 1 MB；种子占用已接近上限，便于演示空间不足时的清理 */
const TOTAL_KB = 1024;

function seedRecordings(today: string): Recording[] {
  return [
    // 句3（已掌握）：旧版本超期且 7 天内未复听 → 可清理候选；新版本是最新版本，受保护
    { id: 'rec-3a', phraseId: 3, recordedAt: offsetISO(today, -21), sizeKB: 144, retainUntil: offsetISO(today, -7), lastReplayedAt: offsetISO(today, -9) },
    { id: 'rec-3b', phraseId: 3, recordedAt: offsetISO(today, -6), sizeKB: 128, retainUntil: offsetISO(today, 8), lastReplayedAt: offsetISO(today, -2) },
    // 句5（已掌握）：旧版本超期、未复听 → 可清理候选；中间版本 4 天前复听过 → 软限制；最新版本受保护
    { id: 'rec-5a', phraseId: 5, recordedAt: offsetISO(today, -28), sizeKB: 160, retainUntil: offsetISO(today, -14) },
    { id: 'rec-5b', phraseId: 5, recordedAt: offsetISO(today, -12), sizeKB: 144, retainUntil: offsetISO(today, -2), lastReplayedAt: offsetISO(today, -4) },
    { id: 'rec-5c', phraseId: 5, recordedAt: offsetISO(today, -3), sizeKB: 112, retainUntil: offsetISO(today, 11) },
    // 句6（已掌握，仅一条旧版）：满足所有“旧版”条件，但它是同一句最新版本 → 整批阻止
    { id: 'rec-6a', phraseId: 6, recordedAt: offsetISO(today, -18), sizeKB: 128, retainUntil: offsetISO(today, -4) },
    // 句1（练习中，未掌握）：哪怕超期也只能作为软限制出现
    { id: 'rec-1a', phraseId: 1, recordedAt: offsetISO(today, -15), sizeKB: 96, retainUntil: offsetISO(today, -1) },
    // 一条未到保留至的旧录音：软限制
    { id: 'rec-5d', phraseId: 5, recordedAt: offsetISO(today, -30), sizeKB: 112, retainUntil: offsetISO(today, 3) },
  ];
}

export function seedState(): LabState {
  const today = todayISO();
  return {
    phrases: basePhrases,
    recordings: seedRecordings(today),
    capacity: { totalKB: TOTAL_KB },
  };
}

export function loadState(): LabState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LabState;
      if (parsed && Array.isArray(parsed.phrases) && Array.isArray(parsed.recordings) && parsed.capacity) {
        return parsed;
      }
    }
  } catch {
    // 旧数据损坏时退回示例数据
  }
  return seedState();
}

export function saveState(state: LabState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等场景下静默保留内存态
  }
}
