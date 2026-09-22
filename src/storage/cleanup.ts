// 清理判定：离线清理的资格判定、候选锁定与整批阻止规则。
// 纯函数模块，不依赖 React / DOM，页面控件只负责调用与渲染。

import {
  daysBetween,
  type PendingTake,
  type Phrase,
  type Recording,
} from './ledger';

export const STALE_DAYS = 7; // 七天内复听过则受保护

export type Restriction =
  | 'latest' // 同一句最新版本
  | 'replayed' // 七天内复听
  | 'retaining' // 保留至未到
  | 'not-mastered' // 句子尚未掌握
  | 'no-mastery-info'; // 句子已删除（无掌握状态）

export interface BlockedRow {
  recording: Recording;
  phrase?: Phrase;
  restriction: Restriction;
  detail: string;
}

export interface CleanupPlan {
  candidates: Recording[]; // 已锁定候选（满足全部清理条件）
  blocked: BlockedRow[]; // 受限制条目（列出句子、日期、体积和限制）
  blockedByPending: PendingTake | null; // 存在待保存录音
  releasableKb: number;
  canCommit: boolean;
}

const restrictionText: Record<Restriction, string> = {
  latest: '同一句最新版本，禁止清理',
  replayed: `七天内复听过，禁止清理`,
  retaining: '保留至未到，仍在保管期内',
  'not-mastered': '句子尚未掌握，禁止清理',
  'no-mastery-info': '句子已不在列表中，禁止清理',
};

export function restrictionLabel(reason: Restriction): string {
  return restrictionText[reason];
}

// 同一句最新版本（日期靠后、其次 id 靠后）
export function latestOfPhrase(recs: Recording[], phraseId: number): Recording | undefined {
  return recs
    .filter((r) => r.phraseId === phraseId)
    .sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1))[0];
}

export interface Eligibility {
  mastered: boolean;
  isLatest: boolean;
  daysSinceReplay: number | null;
  stale: boolean;
  retained: boolean; // 保留至是否已到（false = 仍在保管期内）
  expired: boolean; // 保留至日期已过
  eligible: boolean;
  reasons: Restriction[];
}

// 单条录音的清理资格。规则：仅允许清理「已掌握」且「七天内未复听」且「保留至已到」的非最新版本。
export function evaluateRecording(
  recording: Recording,
  all: Recording[],
  phrases: Phrase[],
  today: string,
): Eligibility {
  const phrase = phrases.find((p) => p.id === recording.phraseId);
  const mastered: boolean = phrase?.status === 'mastered';
  const isLatest = latestOfPhrase(all, recording.phraseId)?.id === recording.id;
  const daysSinceReplay = recording.lastReplayed ? daysBetween(recording.lastReplayed, today) : null;
  const stale = daysSinceReplay === null || daysSinceReplay >= STALE_DAYS;
  const expired = daysBetween(today, recording.retainUntil) < 0; // 保留至日期已过
  const retained = !expired;
  const reasons: Restriction[] = [];
  if (!phrase) reasons.push('no-mastery-info');
  else if (!mastered) reasons.push('not-mastered');
  if (!stale) reasons.push('replayed');
  if (retained) reasons.push('retaining');
  if (isLatest) reasons.push('latest');
  return {
    mastered,
    isLatest,
    daysSinceReplay,
    stale,
    retained,
    expired,
    eligible: reasons.length === 0,
    reasons,
  };
}

// 清理预览：先锁定候选；存在待保存录音，或候选集合为空之外的任意硬冲突时整批阻止。
export function buildCleanupPlan(
  recordings: Recording[],
  phrases: Phrase[],
  pending: PendingTake | null,
  today: string,
): CleanupPlan {
  const candidates: Recording[] = [];
  const blocked: BlockedRow[] = [];
  for (const r of recordings) {
    const ev = evaluateRecording(r, recordings, phrases, today);
    if (ev.eligible) {
      candidates.push(r);
    } else {
      // 同一句最新版本必须整批阻止；其余限制逐条列出
      blocked.push({
        recording: r,
        phrase: phrases.find((p) => p.id === r.phraseId),
        restriction: ev.reasons[0],
        detail: describeRestriction(ev.reasons[0], r, today),
      });
    }
  }
  candidates.sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
  const hasLatestConflict = blocked.some((b) => b.restriction === 'latest');
  const releasableKb = candidates.reduce((s, r) => s + r.sizeKb, 0);
  return {
    candidates,
    blocked,
    blockedByPending: pending,
    releasableKb,
    canCommit: candidates.length > 0 && !pending && !hasLatestConflict,
  };
}

// 冲突限制文案：列出句子、日期、体积之外，必须明确给出限制原因
export function describeRestriction(reason: Restriction, r: Recording, today: string): string {
  const since = r.lastReplayed ? daysBetween(r.lastReplayed, today) : null;
  switch (reason) {
    case 'latest':
      return restrictionText.latest;
    case 'replayed':
      return `七天内复听过（${since} 天前），禁止清理`;
    case 'retaining':
      return `保留至 ${r.retainUntil}，仍在保管期内`;
    case 'not-mastered':
      return restrictionText['not-mastered'];
    case 'no-mastery-info':
      return restrictionText['no-mastery-info'];
  }
}

// 确认清理：原子提交。只删除已锁定候选，返回删除后账本；任何未锁定的旧录音都保留。
export function commitCleanup(recordings: Recording[], plan: CleanupPlan): {
  kept: Recording[];
  removed: Recording[];
} {
  if (!plan.canCommit) return { kept: recordings, removed: [] };
  const doomed = new Set(plan.candidates.map((r) => r.id));
  return {
    kept: recordings.filter((r) => !doomed.has(r.id)),
    removed: recordings.filter((r) => doomed.has(r.id)),
  };
}

// 复听：更新最近复听日期（重新进入七天保护）
export function markReplayed(recordings: Recording[], id: string, today: string): Recording[] {
  return recordings.map((r) => (r.id === id ? { ...r, lastReplayed: today } : r));
}
