// 清理判定：谁有资格成为候选、整批阻止条件、确认时的二次复验。
// 纯函数，不碰 React、不直接改账本；通过后由 ledger.purgeRecordings 执行删除。

import type { LabState, LockedRecording, PendingRecording, Recording } from './types';
import { diffDays } from './time';
import { freeKB, latestRecordingPerPhrase, recordingsOfPhrase, usedKB } from './ledger';

/** 空间紧张水位：没有待保存录音时，剩余空间低于该值才算“不足” */
export const LOW_SPACE_KB = 128;
/** 复听保护期：七天内复听过的版本不得清理 */
export const REPLAY_PROTECT_DAYS = 7;

export type ConflictReason = 'pending' | 'latest' | 'retain' | 'replayed' | 'unmastered';

export const REASON_LABEL: Record<ConflictReason, string> = {
  pending: '待保存录音尚未入库，整批清理已阻止',
  latest: '同一句的最新版本，禁止清理',
  retain: '未到保留至日期，仍在保护期',
  replayed: '七天内复听过，需要继续巩固',
  unmastered: '句子尚未掌握，不得清理',
};

export interface CleanupConflict {
  phraseId: number;
  phraseText: string;
  /** 录音日期（待保存录音取其录制日期） */
  date: string;
  sizeKB: number;
  reason: ConflictReason;
}

export interface CleanupPreview {
  today: string;
  usedKB: number;
  freeKB: number;
  /** 本次至少需要的空间：待保存录音体积，否则取紧张水位 */
  requiredKB: number;
  /** 缺口；为 0 表示空间充足、不允许清理 */
  shortageKB: number;
  /** 预览瞬间锁定的候选快照，确认时只认这批 id */
  locked: LockedRecording[];
  lockIds: ReadonlySet<string>;
  /** 硬冲突：只要存在就整批阻止 */
  blockers: CleanupConflict[];
  /** 软限制：不能入选但不阻止整批的版本 */
  holds: CleanupConflict[];
  /** 整批阻止（有待保存录音，或候选里混进了最新版本） */
  blocked: boolean;
  /** 空间不足、候选非空且未被阻止，才允许确认 */
  canConfirm: boolean;
}

function phraseTextOf(state: LabState, phraseId: number): string {
  return state.phrases.find(p => p.id === phraseId)?.text ?? `句子 #${phraseId}`;
}

function conflictOf(state: LabState, r: Recording, reason: ConflictReason): CleanupConflict {
  return { phraseId: r.phraseId, phraseText: phraseTextOf(state, r.phraseId), date: r.recordedAt, sizeKB: r.sizeKB, reason };
}

/**
 * 生成清理预览：
 * 1. 只有“空间不足”时才允许清理；
 * 2. 候选必须同时满足：句子已掌握 / 已过保留至 / 七天内未复听 / 不是同一句最新版本；
 * 3. 存在待保存录音、或候选中出现同一句最新版本 → 整批阻止；
 * 4. 候选在预览时锁定为快照。
 */
export function buildCleanupPreview(state: LabState, pending: PendingRecording | null, today: string): CleanupPreview {
  const free = freeKB(state);
  const requiredKB = pending ? pending.sizeKB : LOW_SPACE_KB;
  const shortageKB = Math.max(0, requiredKB - free);

  const blockers: CleanupConflict[] = [];
  const holds: CleanupConflict[] = [];
  const eligible: Recording[] = [];

  if (pending) {
    blockers.push({
      phraseId: pending.phraseId,
      phraseText: phraseTextOf(state, pending.phraseId),
      date: pending.date,
      sizeKB: pending.sizeKB,
      reason: 'pending',
    });
  }

  const latest = latestRecordingPerPhrase(state.recordings);
  const mastered = new Set(state.phrases.filter(p => p.status === 'mastered').map(p => p.id));

  for (const r of state.recordings) {
    if (!mastered.has(r.phraseId)) {
      holds.push(conflictOf(state, r, 'unmastered'));
      continue;
    }
    if (r.retainUntil > today) {
      holds.push(conflictOf(state, r, 'retain'));
      continue;
    }
    if (r.lastReplayedAt && diffDays(r.lastReplayedAt, today) < REPLAY_PROTECT_DAYS) {
      holds.push(conflictOf(state, r, 'replayed'));
      continue;
    }
    if (latest.get(r.phraseId)?.id === r.id) {
      // 资格上可清理，却是同一句最新版本 → 不是简单排除，而是整批阻止
      blockers.push(conflictOf(state, r, 'latest'));
      continue;
    }
    eligible.push(r);
  }

  const locked: LockedRecording[] = eligible
    .slice()
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : a.id.localeCompare(b.id)))
    .map(r => ({
      id: r.id,
      phraseId: r.phraseId,
      phraseText: phraseTextOf(state, r.phraseId),
      recordedAt: r.recordedAt,
      sizeKB: r.sizeKB,
    }));

  const blocked = blockers.length > 0;
  return {
    today,
    usedKB: usedKB(state.recordings),
    freeKB: free,
    requiredKB,
    shortageKB,
    locked,
    lockIds: new Set(locked.map(l => l.id)),
    blockers,
    holds,
    blocked,
    canConfirm: shortageKB > 0 && !blocked && locked.length > 0,
  };
}

export type PurgeCheck =
  | { ok: true }
  | { ok: false; conflicts: CleanupConflict[] };

/**
 * 确认前复验：锁定后状态可能变化（复听、新录音入库、待保存录音出现）。
 * 任一前提被破坏即整批拒绝，保证旧录音不丢失、账实一致。
 */
export function validateLockedPurge(
  state: LabState,
  lockIds: ReadonlySet<string>,
  pending: PendingRecording | null,
  today: string,
): PurgeCheck {
  const conflicts: CleanupConflict[] = [];
  if (pending) {
    conflicts.push({
      phraseId: pending.phraseId,
      phraseText: phraseTextOf(state, pending.phraseId),
      date: pending.date,
      sizeKB: pending.sizeKB,
      reason: 'pending',
    });
  }

  const requiredKB = pending ? pending.sizeKB : LOW_SPACE_KB;
  if (freeKB(state) >= requiredKB) {
    // 空间已经充足，按规则“空间不足时才允许清理”，拒绝整批
    return { ok: false, conflicts: [] };
  }

  const latest = latestRecordingPerPhrase(state.recordings);
  const mastered = new Set(state.phrases.filter(p => p.status === 'mastered').map(p => p.id));

  for (const id of lockIds) {
    const r = state.recordings.find(x => x.id === id);
    if (!r) {
      // 锁定的版本已不在账本（快照过期），整批中止
      return { ok: false, conflicts: [] };
    }
    const push = (reason: ConflictReason) =>
      conflicts.push({ phraseId: r.phraseId, phraseText: phraseTextOf(state, r.phraseId), date: r.recordedAt, sizeKB: r.sizeKB, reason });
    if (!mastered.has(r.phraseId)) push('unmastered');
    if (r.retainUntil > today) push('retain');
    if (r.lastReplayedAt && diffDays(r.lastReplayedAt, today) < REPLAY_PROTECT_DAYS) push('replayed');
    if (latest.get(r.phraseId)?.id === r.id) push('latest');
  }

  return conflicts.length === 0 ? { ok: true } : { ok: false, conflicts };
}

/** 清理后剩余空间是否足够装入待保存录音 */
export function purgeFitsPending(state: LabState, lockIds: ReadonlySet<string>, pending: PendingRecording | null): boolean {
  if (!pending) return true;
  const reclaim = state.recordings.filter(r => lockIds.has(r.id)).reduce((s, r) => s + r.sizeKB, 0);
  return freeKB(state) + reclaim >= pending.sizeKB;
}

export function versionsForPhrase(state: LabState, phraseId: number) {
  return recordingsOfPhrase(state.recordings, phraseId);
}
