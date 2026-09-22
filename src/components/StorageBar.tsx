// 容量账本控件：只负责展示容量账本并打开清理台，判定逻辑全部来自 storage 模块。

import { HardDrive, ShieldCheck, Trash2 } from 'lucide-react';
import { formatSize, type Capacity, type PendingTake } from '../storage/ledger';

interface Props {
  capacity: Capacity;
  pending: PendingTake | null;
  onOpenCleanup: () => void;
}

export default function StorageBar({ capacity, pending, onOpenCleanup }: Props) {
  const tight = capacity.remainingKb < capacity.totalKb * 0.15;
  return (
    <div className="storage-card">
      <div className="storage-head">
        <span className="storage-title"><HardDrive size={15} /> 离线保管容量</span>
        <button className="storage-clean-btn" onClick={onOpenCleanup}>
          <Trash2 size={13} /> 清理台
        </button>
      </div>
      <div className="storage-track">
        <i className={tight ? 'tight' : ''} style={{ width: `${capacity.usedRatio * 100}%` }} />
      </div>
      <div className="storage-nums">
        <strong className={tight ? 'tight-text' : ''}>{formatSize(capacity.usedKb)}</strong>
        <span> / {formatSize(capacity.totalKb)} · 剩余 {formatSize(capacity.remainingKb)}</span>
        {pending && <em className="pending-pill">待保存 {formatSize(pending.sizeKb)}</em>}
        {!pending && <i className="ledger-ok"><ShieldCheck size={11} /> 账本一致</i>}
      </div>
    </div>
  );
}
