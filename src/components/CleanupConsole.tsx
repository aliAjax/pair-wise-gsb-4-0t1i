import { useMemo, useState } from 'react';
import { AlertOctagon, Ban, Lock, ShieldCheck, Trash2, X } from 'lucide-react';
import type { CleanupConflict, CleanupPreview } from '../recording/cleanup';
import { REASON_LABEL } from '../recording/cleanup';
import { formatCN, formatKB } from '../recording/time';

interface Props {
  preview: CleanupPreview;
  /** 确认：由上层用锁定快照复验并执行；返回错误提示，成功返回 null */
  onConfirm: () => string | null;
  onClose: () => void;
}

function ConflictRow({ c, kind }: { c: CleanupConflict; kind: 'block' | 'hold' }) {
  return (
    <div className={`conflict-row ${kind}`}>
      <span className="conflict-phrase">{kind === 'block' ? <Ban size={13}/> : <Lock size={13}/>}{c.phraseText}</span>
      <span>{formatCN(c.date)}</span>
      <span>{formatKB(c.sizeKB)}</span>
      <span className="conflict-reason">{REASON_LABEL[c.reason]}</span>
    </div>
  );
}

/** 离线清理台：先锁定候选并预览，列出冲突，确认后才动账本 */
export default function CleanupConsole({ preview, onConfirm, onClose }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const reclaim = useMemo(() => preview.locked.reduce((s, l) => s + l.sizeKB, 0), [preview]);
  const afterFree = preview.freeKB + reclaim;

  const confirm = () => {
    const err = onConfirm();
    if (err) setMessage(err);
    // 成功时由上层关闭弹窗并给出回收提示
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>离线清理台</h2>
            <p className="modal-sub">候选已按预览瞬间锁定；只清理“已掌握且七天内未复听”的历史版本。</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18}/></button>
        </div>

        <div className="cleanup-stats">
          <div><span>剩余空间</span><strong className={preview.shortageKB > 0 ? 'danger-text' : ''}>{formatKB(preview.freeKB)}</strong></div>
          <div><span>{preview.blockers.some(b => b.reason === 'pending') ? '待保存需要' : '安全水位'}</span><strong>{formatKB(preview.requiredKB)}</strong></div>
          <div><span>锁定候选可回收</span><strong className={reclaim >= preview.shortageKB ? 'ok-text' : 'warn-text'}>{formatKB(reclaim)}</strong></div>
          <div><span>清理后剩余</span><strong>{formatKB(afterFree)}</strong></div>
        </div>

        {preview.shortageKB === 0 && (
          <div className="notice ok"><ShieldCheck size={15}/>当前空间充足，规则要求“空间不足时才允许清理”，本次无可执行操作。</div>
        )}

        {preview.shortageKB > 0 && (
          <div className="notice warn">空间缺口 {formatKB(preview.shortageKB)}；整批清理规则：存在待保存录音或候选中出现同一句最新版本时，一律阻止。</div>
        )}

        {preview.blockers.length > 0 && (
          <div className="conflict-group block">
            <h4><AlertOctagon size={14}/>整批阻止项（{preview.blockers.length}）</h4>
            <div className="conflict-grid head"><span>句子</span><span>日期</span><span>体积</span><span>限制</span></div>
            {preview.blockers.map((c, i) => <ConflictRow key={`${c.date}-${c.phraseId}-${i}`} c={c} kind="block"/>)}
          </div>
        )}

        <div className="lock-group">
          <h4><Lock size={14}/>已锁定候选（{preview.locked.length}）— 预览后不会变动</h4>
          {preview.locked.length === 0 && <div className="empty small">没有符合全部规则的旧版本，旧录音不会被删除。</div>}
          {preview.locked.map(l => (
            <div key={l.id} className="lock-row">
              <span className="conflict-phrase">{l.phraseText}</span>
              <span>{formatCN(l.recordedAt)}</span>
              <span>{formatKB(l.sizeKB)}</span>
              <span className="lock-ok">已掌握 · 过保留期 · 七天内未复听 · 非最新版本</span>
            </div>
          ))}
        </div>

        {preview.holds.length > 0 && (
          <div className="conflict-group hold">
            <h4>受保护版本（{preview.holds.length}）</h4>
            <div className="conflict-grid head"><span>句子</span><span>日期</span><span>体积</span><span>限制</span></div>
            {preview.holds.map((c, i) => <ConflictRow key={`${c.date}-${c.phraseId}-${i}`} c={c} kind="hold"/>)}
          </div>
        )}

        {message && <div className="notice block-msg"><AlertOctagon size={15}/>{message}</div>}

        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>取消</button>
          <button className="primary danger-btn" disabled={!preview.canConfirm} onClick={confirm}>
            <Trash2 size={15}/>确认清理 {preview.locked.length} 条 · 回收 {formatKB(reclaim)}
          </button>
        </div>
      </div>
    </div>
  );
}
