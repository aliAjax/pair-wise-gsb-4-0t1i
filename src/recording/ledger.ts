// 保管账本：录音登记、复听、容量占用与同步删除。
// 只读写数据，不做“能不能清理”的判定（判定见 cleanup.ts）。

import type { CapacityLedger, LabState, PendingRecording, Phrase, Recording } from './types';
import { offsetISO, todayISO } from './time';

export const DEFAULT_RETENTION_DAYS = 14;

let seq = 0;
export function newRecordingId(date: string): string {
  seq += 1;
  return `rec-${date.replace(/-/g, '')}-${Date.now().toString(36)}-${seq}`;
}

/** 离线码率按 128kbps 估算：每秒 16 KB */
export function estimateSizeKB(seconds: number): number {
  return Math.max(12, Math.round(seconds * 16));
}

export function usedKB(recordings: Recording[]): number {
  return recordings.reduce((sum, r) => sum + r.sizeKB, 0);
}

export function freeKB(state: LabState): number {
  return Math.max(0, state.capacity.totalKB - usedKB(state.recordings));
}

/** 容量账本是否还能装下 sizeKB（待保存录音按这个判定空间不足） */
export function canFit(capacity: CapacityLedger, recordings: Recording[], sizeKB: number): boolean {
  return usedKB(recordings) + sizeKB <= capacity.totalKB;
}

export function recordingsOfPhrase(recordings: Recording[], phraseId: number): Recording[] {
  return recordings
    .filter(r => r.phraseId === phraseId)
    .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : a.recordedAt > b.recordedAt ? -1 : a.id < b.id ? 1 : -1));
}

/** 同一句的最新版本（日期最大，日期相同取后登记的 id 排序结果） */
export function latestRecordingOfPhrase(recordings: Recording[], phraseId: number): Recording | undefined {
  return recordingsOfPhrase(recordings, phraseId)[0];
}

export function latestRecordingPerPhrase(recordings: Recording[]): Map<number, Recording> {
  const map = new Map<number, Recording>();
  for (const r of recordings) {
    const cur = map.get(r.phraseId);
    if (!cur || r.recordedAt > cur.recordedAt || (r.recordedAt === cur.recordedAt && r.id > cur.id)) {
      map.set(r.phraseId, r);
    }
  }
  return map;
}

export interface RegisterInput {
  phraseId: number;
  date?: string;
  seconds: number;
  retentionDays?: number;
}

/** 登记一条新录音：写入句子、日期、体积和保留至 */
export function registerRecording(state: LabState, input: RegisterInput): { state: LabState; recording: Recording } {
  const date = input.date ?? todayISO();
  const sizeKB = estimateSizeKB(input.seconds);
  const recording: Recording = {
    id: newRecordingId(date),
    phraseId: input.phraseId,
    recordedAt: date,
    sizeKB,
    retainUntil: offsetISO(date, input.retentionDays ?? DEFAULT_RETENTION_DAYS),
  };
  return {
    state: { ...state, recordings: [...state.recordings, recording] },
    recording,
  };
}

/** 待保存录音正式入库，并同步句子的练习次数与最近练习标记 */
export function commitPending(state: LabState, pending: PendingRecording, nowLabel = '刚刚'): LabState {
  const { state: next } = registerRecording(state, {
    phraseId: pending.phraseId,
    date: pending.date,
    seconds: pending.seconds,
  });
  return {
    ...next,
    phrases: next.phrases.map(p =>
      p.id === pending.phraseId
        ? { ...p, attempts: p.attempts + 1, status: p.status === 'new' ? 'practice' : p.status, last: nowLabel }
        : p,
    ),
  };
}

/** 记录一次复听（候选锁定前的复听会让它立刻失去清理资格） */
export function markReplayed(state: LabState, recordingId: string, date?: string): LabState {
  const at = date ?? todayISO();
  return {
    ...state,
    recordings: state.recordings.map(r => (r.id === recordingId ? { ...r, lastReplayedAt: at } : r)),
  };
}

/**
 * 确认清理：容量账本、录音状态与句子列表在同一笔事务里同步。
 * 只删除给定 id 集合；句子 attempts 按实际删除条数扣减，绝不出现账实不符。
 * 调用方应先用 cleanup.ts 的 buildCleanupPreview 锁定并校验。
 */
export function purgeRecordings(state: LabState, ids: ReadonlySet<string>): LabState {
  const removed = state.recordings.filter(r => ids.has(r.id));
  if (removed.length === 0) return state;

  const removedPerPhrase = new Map<number, number>();
  for (const r of removed) {
    removedPerPhrase.set(r.phraseId, (removedPerPhrase.get(r.phraseId) ?? 0) + 1);
  }

  const phrases: Phrase[] = state.phrases.map(p => {
    const n = removedPerPhrase.get(p.id);
    if (!n) return p;
    // 句子练习次数按实际删除条数扣减；掌握状态是句子级事实，清理旧录音不改变它
    return { ...p, attempts: Math.max(0, p.attempts - n) };
  });

  return {
    capacity: { ...state.capacity },
    phrases,
    recordings: state.recordings.filter(r => !ids.has(r.id)),
  };
}
