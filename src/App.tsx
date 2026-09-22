import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Clock3, Mic, Pause, Play, Plus, RotateCcw, Search, Trash2, Volume2 } from 'lucide-react';
import StorageBar from './components/StorageBar';
import CleanupConsole from './components/CleanupConsole';
import { commitCleanup, markReplayed, type CleanupPlan } from './storage/cleanup';
import {
  addDaysISO,
  capacityOf,
  daysBetween,
  estimateSize,
  formatSize,
  loadLedger,
  loadPhrases,
  saveLedger,
  savePhrases,
  todayISO,
  type PendingTake,
  type Phrase,
  type Recording,
} from './storage/ledger';

const bars = Array.from({ length: 68 }, (_, i) => 18 + ((i * 29) % 44));
const RETAIN_OPTIONS = [7, 30, 90];

export default function App() {
  const [phrases, setPhrases] = useState<Phrase[]>(() => loadPhrases());
  const [recordings, setRecordings] = useState<Recording[]>(() => loadLedger());
  const [selected, setSelected] = useState(phrases[0]?.id ?? 1);
  const [filter, setFilter] = useState('全部');
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState('');
  const [pending, setPending] = useState<PendingTake | null>(null);
  const [retainDays, setRetainDays] = useState(30);
  const [showCleanup, setShowCleanup] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveBlocked, setSaveBlocked] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const current = phrases.find((p) => p.id === selected) ?? phrases[0];
  const capacity = useMemo(() => capacityOf(recordings), [recordings]);
  const currentVersions = useMemo(
    () =>
      current
        ? recordings
            .filter((r) => r.phraseId === current.id)
            .sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1))
        : [],
    [recordings, current],
  );
  const latestVersionId = currentVersions[0]?.id;

  const filtered = useMemo(() => phrases.filter(p => (filter === '全部' || p.tag === filter || p.level === filter || (filter === '待练' && p.status !== 'mastered')) && p.text.toLowerCase().includes(query.toLowerCase())), [phrases, filter, query]);
  const tags = ['全部', ...Array.from(new Set(phrases.map(p => p.tag)))];

  // 三处同步：容量账本（recordings）、录音状态、句子列表全部持久化
  useEffect(() => { savePhrases(phrases); }, [phrases]);
  useEffect(() => { saveLedger(recordings); }, [recordings]);
  useEffect(() => () => window.clearInterval(timer.current), []);
  useEffect(() => { if (!notice) return; const t = window.setTimeout(() => setNotice(null), 3500); return () => window.clearTimeout(t); }, [notice]);

  // 第一段录音流程：停止后进入「待保存」，登记句子、日期、体积和保留至
  const startRecord = () => {
    if (recording) {
      window.clearInterval(timer.current);
      setRecording(false);
      const durationSec = Math.max(1, seconds);
      setPending({ phraseId: selected, date: todayISO(), sizeKb: estimateSize(durationSec), durationSec });
      setSaveBlocked(false);
      return;
    }
    setSeconds(0);
    setRecording(true);
    timer.current = window.setInterval(() => setSeconds(s => s + 1), 1000);
  };

  // 待保存录音入账：容量不足时不允许落账，提示先去清理台（清理仍受待保存录音整批阻止约束）
  const savePending = () => {
    if (!pending) return;
    if (pending.sizeKb > capacity.remainingKb) {
      setSaveBlocked(true);
      return;
    }
    const entry: Recording = {
      id: `rec-${Date.now()}`,
      phraseId: pending.phraseId,
      date: pending.date,
      sizeKb: pending.sizeKb,
      durationSec: pending.durationSec,
      retainUntil: addDaysISO(pending.date, retainDays),
    };
    setRecordings(rs => [...rs, entry]);
    setPhrases(ps => ps.map(p => p.id === entry.phraseId ? { ...p, attempts: p.attempts + 1, status: 'practice', last: '刚刚' } : p));
    setPending(null);
    setSaveBlocked(false);
    setNotice(`录音已登记入账，保留至 ${entry.retainUntil}。`);
  };

  const discardPending = () => { setPending(null); setSaveBlocked(false); };

  const replayRecording = (id: string) => {
    setRecordings(rs => markReplayed(rs, id, todayISO()));
    setPlaying(true);
    window.setTimeout(() => setPlaying(false), 1400);
  };

  const toggleMastered = () => {
    if (!current) return;
    setPhrases(ps => ps.map(p => p.id === current.id ? { ...p, status: p.status === 'mastered' ? 'practice' : 'mastered' } : p));
  };

  // 确认清理：原子提交，只删除已锁定候选
  const commitPlan = (plan: CleanupPlan): Recording[] => {
    const { kept, removed } = commitCleanup(recordings, plan);
    if (removed.length) setRecordings(kept);
    return removed;
  };

  // 旧录音不得丢失：句子下仍有入账录音时，禁止从句子列表删除
  const removePhrase = () => {
    if (!current) return;
    if (recordings.some(r => r.phraseId === current.id)) {
      setNotice(`“${current.text.slice(0, 16)}…” 还有 ${recordings.filter(r => r.phraseId === current.id).length} 条在账录音，请先在清理台处理，句子不可删除。`);
      return;
    }
    setPhrases(ps => ps.filter(p => p.id !== current.id));
    setSelected(filtered.find(p => p.id !== current.id)?.id ?? phrases.find(p => p.id !== current.id)?.id ?? 0);
  };

  const addPhrase = () => { if (!newText.trim()) return; const id = Date.now(); setPhrases(ps => [...ps, { id, text: newText.trim(), translation: '待补充译文', tag: '自定义', level: '入门', status: 'new', attempts: 0 }]); setSelected(id); setNewText(''); setShowAdd(false); };

  const versionsOf = (phraseId: number) => recordings.filter(r => r.phraseId === phraseId);

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><div className="brand-mark"><Volume2 size={19}/></div><div><strong>声线练习室</strong><span>Pronounce / practice</span></div></div><div className="side-label">我的练习</div><nav><button className="side-link active"><Mic size={17}/>练习库 <b>{phrases.length}</b></button><button className="side-link" onClick={() => setShowCleanup(true)}><Clock3 size={17}/>保管与清理 <b>{recordings.length}</b></button><button className="side-link"><Check size={17}/>已掌握 <b>{phrases.filter(p => p.status === 'mastered').length}</b></button></nav><div className="sidebar-foot"><div className="streak"><span>连续练习</span><strong>5 <small>天</small></strong><i>↗ +2</i></div><div className="profile"><div className="avatar">YL</div><div><strong>Yuki Lin</strong><span>普通计划</span></div><ChevronRight size={16}/></div></div></aside>
    <main className="main"><header className="topbar"><div><p className="eyebrow">TUESDAY, SEP 22</p><h1>今天练什么？</h1></div><div className="top-actions"><div className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索句子"/></div><button className="primary" onClick={() => setShowAdd(true)}><Plus size={17}/>添加句子</button></div></header>
      <section className="stats"><div><span>本周完成</span><strong>12 <em>/ 20</em></strong><div className="progress"><i style={{width:'60%'}}/></div></div><div><span>练习时长</span><strong>38 <em>分钟</em></strong><small>比上周多 8 分钟</small></div><div><span>最佳发音</span><strong>92 <em>分</em></strong><small className="green">↑ 6 分</small></div></section>
      <div className="storage-strip"><StorageBar capacity={capacity} pending={pending} onOpenCleanup={() => setShowCleanup(true)} /></div>
      {notice && <div className="app-notice">{notice}</div>}
      <div className="content-grid"><section className="library"><div className="section-head"><div><h2>句子库</h2><p>选择一句开始你的声音训练</p></div><button className="ghost" onClick={() => setFilter('待练')}>只看待练</button></div><div className="filters">{tags.map(t => <button key={t} className={filter === t ? 'chip active' : 'chip'} onClick={() => setFilter(t)}>{t}</button>)}</div><div className="phrase-list">{filtered.map(p => { const vs = versionsOf(p.id); return <button key={p.id} onClick={() => {setSelected(p.id);}} className={p.id === selected ? 'phrase selected' : 'phrase'}><div className="phrase-icon">{p.status === 'mastered' ? <Check size={15}/> : <Mic size={15}/>}</div><div className="phrase-copy"><strong>{p.text}</strong><span>{p.translation}</span><div className="phrase-meta"><i>{p.tag}</i><i>{p.level}</i>{vs.length > 0 && <small className="ledger-meta">在账 {vs.length} 版 · {formatSize(vs.reduce((s, r) => s + r.sizeKb, 0))}</small>}</div></div><ChevronRight size={17}/></button>; })} {filtered.length === 0 && <div className="empty">没有找到匹配句子</div>}</div></section>
        {current && <section className="practice"><div className="practice-head"><div><span className="label">CURRENT PHRASE</span><h2>跟着感觉读</h2></div><div className="practice-head-btns"><button className="secondary mini" onClick={toggleMastered}>{current.status === 'mastered' ? <><Check size={13}/> 已掌握</> : '标记掌握'}</button><button className="icon-btn" onClick={removePhrase} title="删除句子"><Trash2 size={17}/></button></div></div><div className="focus-card"><div className="focus-tag">{current.tag} · {current.level} · {current.status === 'mastered' ? '已掌握' : current.status === 'practice' ? '练习中' : '新句子'}</div><p className="focus-text">{current.text}</p><p className="focus-translation">{current.translation}</p><div className="audio-sample"><button className="round-btn" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><div className="sample-wave">{bars.map((h,i) => <i key={i} style={{height: `${h * (playing ? 1.15 : 0.72)}%`}}/> )}</div><span>0:08</span></div></div>
          <div className="record-card"><div className="record-top"><div><span className="label">YOUR RECORDING</span><h3>{pending ? '待保存录音：确认后才会计入保管账本' : recording ? '正在录音…' : '准备好后开始录音'}</h3></div><span className="record-time">{String(Math.floor(seconds / 60)).padStart(2,'0')}:{String(seconds % 60).padStart(2,'0')}</span></div>
            {!pending && <><div className="record-wave">{bars.slice(5,58).map((h,i) => <i key={i} className={recording ? 'live' : ''} style={{height: `${h * (recording ? (0.4 + ((i%5)/7)) : 0.4)}%`}}/> )}</div><div className="record-actions"><button className={recording ? 'record-button recording' : 'record-button'} onClick={startRecord}><span>{recording ? <Pause size={16}/> : <Mic size={16}/>}</span>{recording ? '结束录音' : '开始录音'}</button></div></>}
            {pending && <div className="pending-card">
              <div className="pending-fields">
                <span>句子：{phrases.find(p => p.id === pending.phraseId)?.text.slice(0, 22)}…</span>
                <span>日期：{pending.date}</span>
                <span>体积：{formatSize(pending.sizeKb)}</span>
                <label className="retain-pick">保留至
                  <select value={retainDays} onChange={e => setRetainDays(Number(e.target.value))}>
                    {RETAIN_OPTIONS.map(d => <option key={d} value={d}>{d} 天（至 {addDaysISO(pending.date, d)}）</option>)}
                  </select>
                </label>
              </div>
              {saveBlocked && <p className="pending-block">剩余空间 {formatSize(capacity.remainingKb)}，不足以登记 {formatSize(pending.sizeKb)}。该录音处于待保存状态，清理台会被整批阻止；请先放弃当前录音，清理空间后再重录。<button className="secondary mini" onClick={() => setShowCleanup(true)}>去清理台看看</button></p>}
              <div className="record-actions"><button className="primary" onClick={savePending}><Check size={14}/> 保存入账</button><button className="secondary" onClick={discardPending}>放弃录音</button></div>
            </div>}
          </div>

          <div className="ledger-card">
            <div className="ledger-head"><span className="label">OFFLINE LEDGER · {currentVersions.length} 条在账</span><button className="ghost mini" onClick={() => setShowCleanup(true)}>打开清理台</button></div>
            {currentVersions.length === 0 && <p className="ledger-empty">这句还没有登记的离线录音。</p>}
            {currentVersions.map((r, idx) => (
              <div key={r.id} className={r.id === latestVersionId ? 'ledger-row latest' : 'ledger-row'}>
                <div className="ledger-row-icon">{current.status === 'mastered' ? <Check size={13}/> : <Mic size={13}/>}</div>
                <div className="ledger-row-copy">
                  <strong>{r.date} <span className="duration">{Math.floor(r.durationSec / 60)}:{String(r.durationSec % 60).padStart(2, '0')}</span>{idx === 0 && <em className="latest-badge">最新版本</em>}</strong>
                  <span>{formatSize(r.sizeKb)} · 保留至 {r.retainUntil}{r.lastReplayed ? ` · ${daysBetweenText(r.lastReplayed, todayISO())}` : ' · 未复听'}{current.status !== 'mastered' && ' · 未掌握'}</span>
                </div>
                <button className="replay-mini" onClick={() => replayRecording(r.id)} title="复听并重新进入七天保护"><Play size={12}/> 复听</button>
              </div>
            ))}
          </div>

          <div className="tip"><span>练习小贴士</span><p>放慢速度，先把每个音节读清楚，再自然地连起来。</p><RotateCcw size={15}/></div>
        </section>}
      </div>
    </main>
    {showAdd && <div className="modal-backdrop" onClick={() => setShowAdd(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><h2>添加练习句子</h2><button className="icon-btn" onClick={() => setShowAdd(false)}>×</button></div><label>英文句子<textarea autoFocus value={newText} onChange={e => setNewText(e.target.value)} placeholder="例如：I can make this happen."/></label><div className="modal-actions"><button className="secondary" onClick={() => setShowAdd(false)}>取消</button><button className="primary" onClick={addPhrase}>加入句子库</button></div></div></div>}
    <CleanupConsole
      open={showCleanup}
      onClose={() => setShowCleanup(false)}
      recordings={recordings}
      phrases={phrases}
      pending={pending}
      onCommit={commitPlan}
      onReplay={replayRecording}
      onSavePending={savePending}
      onDiscardPending={discardPending}
    />
  </div>;
}

function daysBetweenText(a: string, b: string): string {
  const d = daysBetween(a, b);
  return d <= 0 ? '今天复听过' : `${d} 天前复听`;
}
