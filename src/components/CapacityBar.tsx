import { HardDrive } from 'lucide-react';
import { formatKB } from '../recording/time';

interface Props {
  usedKB: number;
  totalKB: number;
  pendingKB?: number;
  compact?: boolean;
}

export default function CapacityBar({ usedKB, totalKB, pendingKB = 0, compact }: Props) {
  const committed = Math.min(100, (usedKB / totalKB) * 100);
  const pending = Math.min(100 - committed, (pendingKB / totalKB) * 100);
  const tight = usedKB + pendingKB > totalKB * 0.85;
  return (
    <div className={compact ? 'capacity compact' : 'capacity'}>
      <div className="capacity-head">
        <span><HardDrive size={14}/> 离线容量账本</span>
        <b className={tight ? 'danger-text' : ''}>{formatKB(usedKB)} / {formatKB(totalKB)}</b>
      </div>
      <div className="capacity-track">
        <i className="used" style={{ width: `${committed}%` }}/>
        {pending > 0 && <i className="pending-fill" style={{ width: `${pending}%` }}/>}
      </div>
      <div className="capacity-foot">
        <span>剩余 {formatKB(Math.max(0, totalKB - usedKB))}</span>
        {pendingKB > 0 && <span className="pending-text">待保存占用 {formatKB(pendingKB)}</span>}
      </div>
    </div>
  );
}
