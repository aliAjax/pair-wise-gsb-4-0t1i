// 声线练习室 · 录音保管领域模型
// 只描述数据形状，不含任何判定逻辑与页面代码。

export type PhraseStatus = 'new' | 'practice' | 'mastered';
export type PhraseLevel = '入门' | '进阶' | '挑战';

export interface Phrase {
  id: number;
  text: string;
  translation: string;
  tag: string;
  level: PhraseLevel;
  status: PhraseStatus;
  /** 练习次数；以录音台账为准，清理旧录音时同步扣减 */
  attempts: number;
  last?: string;
}

/** 一条入库录音：登记句子、日期、体积和保留至 */
export interface Recording {
  id: string;
  phraseId: number;
  /** 录音日期 ISO：YYYY-MM-DD */
  recordedAt: string;
  /** 体积（KB，按离线码率估算） */
  sizeKB: number;
  /** 保留至 ISO：YYYY-MM-DD，未到期一律受保护 */
  retainUntil: string;
  /** 最近一次复听日期 ISO；七天内复听过则不允许清理 */
  lastReplayedAt?: string;
}

/** 录完但尚未入库的录音，只存在于本次会话；存在期间整批清理一律阻止 */
export interface PendingRecording {
  phraseId: number;
  date: string;
  seconds: number;
  sizeKB: number;
}

/** 容量账本：离线空间总额，占用由录音台账实时汇总 */
export interface CapacityLedger {
  totalKB: number;
}

export interface LabState {
  phrases: Phrase[];
  recordings: Recording[];
  capacity: CapacityLedger;
}

/** 清理台锁定的候选快照（预览时锁定，确认时只认这批 id） */
export interface LockedRecording {
  id: string;
  phraseId: number;
  phraseText: string;
  recordedAt: string;
  sizeKB: number;
}
