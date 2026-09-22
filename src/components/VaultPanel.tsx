import { AlertTriangle, Archive, Play, Save, Sparkles, Trash2, X } from 'lucide-react';
import type { LabState, PendingRecording } from '../recording/types';
import { formatCN, formatKB, relativeCN, todayISO } from '../recording/time';
import { freeKB, latestRecordingPerPhrase } from '../recording/ledger';
import { LOW_SPACE_KB } from '../recording/cleanup';
import CapacityBar from './CapacityBar';

interface Props {
  state: LabState;
  pending: PendingRecording | null;
  onOpenCleanup: () => void;
  onReplay: (id: string) => void;
  onSavePending: () => void;
  onDiscardPending: () => void;
}

/** 保管台：容量账本 + 全部录音的保管台账（句子 / 日期 / 体积 / 保留至） */
export default function VaultPanel({ state, pending, onOpenCleanup, onReplay, onSavePending, onDiscardPending }: Props) {
  const today = todayISO();
  const free = freeKB(state);
  const tight = free < (pending ? pending.sizeKB : LOW_SPACE_KB);
  const latest = latestRecordingPerPhrase(state.recordings);

  const rows = state.recordings
    .map(r => ({ r, phrase: state.phrases.find(p => p.id === r.phraseId) }))
    .sort((a, b) => (a.r.recordedAt < b.r.recordedAt ? 1 : -1));

  return (
    <div className="vault">
      <div className="vault-top">
        <div>
          <span className="label">OFFLINE VAULT</span>
          <h2>录音保管台</h2>
          <p>每条录音登记句子、日期、体积和保留至；旧版本只在空间不足时按规则清理。</p>
        </div>
        <button className={`primary ${tight ? 'danger-btn' : ''}`} onClick={onOpenCleanup}>
          <Trash2 size={15}/> 离线清理台{tight && <em className="btn-dot"/>}
        </button>
      </div>

      <CapacityBar usedKB={state.capacity.totalKB - free} totalKB={state.capacity.totalKB} pendingKB={pending?.sizeKB ?? 0}/>

      {pending && (
        <div className="pending-banner">
          <AlertTriangle size={16}/>
          <div className="pending-copy">
            <strong>有一条待保存录音</strong>
            <span>{state.phrases.find(p => p.id === pending.phraseId)?.text} · {formatCN(pending.date)} · {formatKB(pending.sizeKB)}。保存或放弃后才允许整批清理。</span>
          </div>
          <button className="secondary" onClick={onDiscardPending}><X size={14}/>放弃</button>
          <button className="primary" onClick={onSavePending}><Save size={14}/>保存入库</button>
        </div>
      )}

      <div className="ledger">
        <div className="ledger-head">
          <span>句子</span><span>日期</span><span>体积</span><span>保留至</span><span>复听</span><span></span>
        </div>
        {rows.map(({ r, phrase }) => {
          const protectedByDate = r.retainUntil > today;
          const isLatest = latest.get(r.phraseId)?.id === r.id;
          return (
            <div key={r.id} className="ledger-row">
              <span className="ledger-phrase">
                {isLatest && <em className="latest-flag" title="同一句最新版本，禁止清理"><Sparkles size={12}/>最新</em>}
                <b>{phrase?.text ?? `句子 #${r.phraseId}`}</b>
                <i>{phrase?.tag}{phrase?.status === 'mastered' && ' · 已掌握'}</i>
              </span>
              <span className="ledger-date">{formatCN(r.recordedAt)}<small>{relativeCN(r.recordedAt, today)}</small></span>
              <span className="ledger-size">{formatKB(r.sizeKB)}</span>
              <span className={protectedByDate ? 'retain-ok' : 'retain-over'}>
                {formatCN(r.retainUntil)}
                <small>{protectedByDate ? '保护中' : '已到期'}</small>
              </span>
              <span className="ledger-replay">{r.lastReplayedAt ? relativeCN(r.lastReplayedAt, today) : <i>未复听</i>}</span>
              <span className="ledger-act"><button className="secondary" onClick={() => onReplay(r.id)}><Play size={13}/>复听</button></span>
            </div>
          );
        })}
        {rows.length === 0 && <div className="empty"><Archive size={18}/>保管账本还是空的，先录一条吧</div>}
      </div>
    </div>
  );
}
