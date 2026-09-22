// 日历工具：全部按“天”计算，避免时分秒干扰七天判定。

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function offsetISO(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** b - a 的整天差，例如 diffDays('2026-09-15','2026-09-22') === 7 */
export function diffDays(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`).getTime();
  const db = new Date(`${b}T00:00:00`).getTime();
  return Math.round((db - da) / 86400000);
}

export function formatCN(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

/** 相对今天的中文描述 */
export function relativeCN(iso: string, today: string): string {
  const n = diffDays(today, iso);
  if (n === 0) return '今天';
  if (n > 0) return `${n} 天后`;
  const past = -n;
  if (past === 1) return '昨天';
  return `${past} 天前`;
}

export function formatKB(kb: number): string {
  if (kb >= 1024) return `${(kb / 1024).toFixed(kb % 1024 === 0 ? 0 : 1)} MB`;
  return `${Math.round(kb)} KB`;
}
