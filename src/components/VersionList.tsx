import { Check, Lock, Mic, Play, Sparkles } from 'lucide-react';
import type { Recording } from '../recording/types';
import { diffDays, formatCN, formatKB, relativeCN, todayISO } from '../recording/time';
import { REPLAY_PROTECT_DAYS } from '../recording/cleanup';

interface Props {
  recordings: Recording[];
  /** 当前句子是否已掌握（决定版本能否进入清理候选） */
  mastered: boolean;
  onReplay: (id: string) => void;
}

function tagFor(r: Recording, mastered: boolean, today: string) {
  if (r.retainUntil > today) return { tone: 'hold', icon: <Lock size={11}/>, text: `保留至 ${formatCN(r.retainUntil)}` };
  if (r.lastReplayedAt && diffDays(r.lastReplayedAt, today) < REPLAY_PROTECT_DAYS) {
    return { tone: 'replay', icon: <Play size={11}/>, text: `${relativeCN(r.lastReplayedAt, today)}复听过` };
  }
  if (!mastered) return { tone: 'hold', icon: <Mic size={11}/>, text: '句子未掌握' };
  return { tone: 'old', icon: <Check size={11}/>, text: '可清理旧版' };
}

/** 同一句的录音版本列表（练习页用） */
export default function VersionList({ recordings, mastered, onReplay }: Props) {
  const today = todayISO();
  return (
    <div className="version-list">
      <div className="version-head"><span className="label">SAVED VERSIONS</span><b>{recordings.length} 个版本</b></div>
      {recordings.length === 0 && <div className="version-empty">还没有已保存录音，录一条并“保存入库”</div>}
      {recordings.map((r, i) => {
        const tag = tagFor(r, mastered, today);
        return (
          <div key={r.id} className="version-row">
            <div className={`version-icon ${tag.tone}`}>{i === 0 ? <Sparkles size={13}/> : <Mic size={13}/>}</div>
            <div className="version-copy">
              <strong>{i === 0 ? '最新版本' : `历史版本 · ${formatCN(r.recordedAt)}`}{i === 0 && ` · ${relativeCN(r.recordedAt, today)}`}</strong>
              <span>{formatCN(r.recordedAt)} 录制 · {formatKB(r.sizeKB)}</span>
            </div>
            <em className={`version-tag ${tag.tone}`}>{tag.icon}{tag.text}</em>
            <button className="version-play" title="复听" onClick={() => onReplay(r.id)}><Play size={13}/>复听</button>
          </div>
        );
      })}
    </div>
  );
}
