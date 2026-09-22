// 离线清理台控件：预览锁定候选、列出冲突、整批阻止与确认提交。
// 判定全部委托给 storage/cleanup，组件不自带业务规则。

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Clock3, Lock, RotateCcw, Save, Trash2, XCircle } from 'lucide-react';
import {
  buildCleanupPlan,
  describeRestriction,
  type CleanupPlan,
} from '../storage/cleanup';
import {
  daysBetween,
  formatSize,
  todayISO,
  type PendingTake,
  type Phrase,
  type Recording,
} from '../storage/ledger';

interface Props {
  open: boolean;
  onClose: () => void;
  recordings: Recording[];
  phrases: Phrase[];
  pending: PendingTake | null;
  onCommit: (plan: CleanupPlan) => Recording[]; // 返回实际删除的录音
  onReplay: (id: string) => void;
  onSavePending: () => void;
  onDiscardPending: () => void;
}

export default function CleanupConsole({
  open,
  onClose,
  recordings,
  phrases,
  pending,
  onCommit,
  onReplay,
  onSavePending,
  onDiscardPending,
}: Props) {
  const today = useMemo(() => todayISO(), []);
  const [plan, setPlan] = useState<CleanupPlan | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const scan = () => {
    setPlan(buildCleanupPlan(recordings, phrases, pending, today));
    setResult(null);
  };

  // 账本或待保存状态变化后，锁定结果自动失效并重算，旧录音状态始终与账本一致
  useEffect(() => {
    if (open) {
      setPlan(buildCleanupPlan(recordings, phrases, pending, today));
      setResult(null);
    }
  }, [open, recordings, phrases, pending, today]);

  if (!open) return null;

  const phraseOf = (id: number) => phrases.find((p) => p.id === id);
  const hasLatestConflict = plan?.blocked.some((b) => b.restriction === 'latest') ?? false;

  const handleCommit = () => {
    if (!plan || !plan.canCommit) return;
    const removed = onCommit(plan);
    setResult(`已清理 ${removed.length} 条旧版本录音，释放 ${formatSize(removed.reduce((s, r) => s + r.sizeKb, 0))} 空间。容量账本、录音状态与句子列表已同步。`);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cleanup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>离线清理台</h2>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>

        <p className="clean-rule">
          空间不足时，只允许清理<b>已掌握</b>、<b>七天内未复听</b>且<b>保留至已到</b>的旧版本；
          存在待保存录音或同一句最新版本时整批阻止，旧录音不会丢失。
        </p>

        {pending && (
          <div className="block-banner">
            <Ban size={16} />
            <div>
              <strong>存在待保存录音，整批清理已阻止</strong>
              <span>
                “{(phraseOf(pending.phraseId)?.text ?? '未知句子').slice(0, 28)}…” · {pending.date} · {formatSize(pending.sizeKb)}
              </span>
            </div>
            <div className="block-actions">
              <button className="secondary" onClick={onDiscardPending}><XCircle size={13} /> 放弃</button>
              <button className="primary" onClick={onSavePending}><Save size={13} /> 保存入账</button>
            </div>
          </div>
        )}

        {plan && hasLatestConflict && (
          <div className="block-banner warn">
            <AlertTriangle size={16} />
            <div>
              <strong>同一句最新版本命中清理范围，整批清理已阻止</strong>
              <span>请先对最新版本执行一次复听，使其重新进入七天保护，再重新锁定候选。</span>
            </div>
          </div>
        )}

        {result && (
          <div className="block-banner ok">
            <CheckCircle2 size={16} />
            <div><strong>{result}</strong></div>
          </div>
        )}

        <div className="scan-row">
          <button className="secondary" onClick={scan}><RotateCcw size={13} /> {plan ? '重新扫描并锁定候选' : '扫描并锁定候选'}</button>
          <span className="scan-meta">
            {plan && <>已锁定 <b>{plan.candidates.length}</b> 条候选 · 可释放 <b>{formatSize(plan.releasableKb)}</b></>}
          </span>
        </div>

        {plan && (
          <>
            <div className="clean-cols">
              <div className="clean-col">
                <div className="clean-col-head"><Lock size={13} /> 已锁定候选（可清理）</div>
                {plan.candidates.length === 0 && <div className="clean-empty">暂无满足全部条件的旧录音</div>}
                {plan.candidates.map((r) => (
                  <CleanupRow
                    key={r.id}
                    r={r}
                    phraseText={phraseOf(r.phraseId)?.text}
                    today={today}
                    tone="candidate"
                    note="保留至已到 · 已掌握 · 七天内未复听"
                  />
                ))}
              </div>
              <div className="clean-col">
                <div className="clean-col-head"><Ban size={13} /> 受保护 / 冲突（不会删除）</div>
                {plan.blocked.length === 0 && <div className="clean-empty">没有受限制条目</div>}
                {plan.blocked.map((b) => (
                  <CleanupRow
                    key={b.recording.id}
                    r={b.recording}
                    phraseText={b.phrase?.text}
                    today={today}
                    tone={b.restriction === 'latest' ? 'conflict' : 'blocked'}
                    note={describeRestriction(b.restriction, b.recording, today)}
                    action={
                      (b.restriction === 'latest' || b.restriction === 'replayed') &&
                      b.recording.lastReplayed !== today ? (
                        <button className="replay-mini" onClick={() => onReplay(b.recording.id)} title="标记复听，进入七天保护">
                          <Clock3 size={12} /> 复听
                        </button>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="secondary" onClick={onClose}>关闭</button>
              <button
                className="primary danger"
                disabled={!plan.canCommit}
                onClick={handleCommit}
                title={!plan.canCommit ? '存在整批阻止条件或没有候选' : ''}
              >
                <Trash2 size={14} /> 确认清理（{plan.candidates.length} 条 · {formatSize(plan.releasableKb)}）
              </button>
            </div>
            {!plan.canCommit && <p className="commit-hint">确认按钮已锁定：先解除待保存录音与最新版本冲突，且候选不为空。</p>}
          </>
        )}
      </div>
    </div>
  );
}

function CleanupRow({
  r,
  phraseText,
  today,
  tone,
  note,
  action,
}: {
  r: Recording;
  phraseText?: string;
  today: string;
  tone: 'candidate' | 'blocked' | 'conflict';
  note: string;
  action?: React.ReactNode;
}) {
  const since = r.lastReplayed ? daysBetween(r.lastReplayed, today) : null;
  return (
    <div className={`clean-row ${tone}`}>
      <div className="clean-row-main">
        <strong>{phraseText ? `“${phraseText}”` : '（句子已从列表删除）'}</strong>
        <span>
          日期 {r.date} · 体积 {formatSize(r.sizeKb)} · 保留至 {r.retainUntil}
          {since !== null && ` · ${since} 天前复听`}
        </span>
        <i>{note}</i>
      </div>
      {action}
    </div>
  );
}
