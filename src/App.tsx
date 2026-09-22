import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Check, CheckCircle2, ChevronRight, Clock3, Mic, Pause, Play, Plus, RotateCcw, Save, Search, Trash2, Volume2, X } from 'lucide-react';
import type { LabState, PendingRecording } from './recording/types';
import { loadState, saveState, seedState } from './recording/storage';
import { canFit, commitPending, estimateSizeKB, markReplayed, purgeRecordings, recordingsOfPhrase } from './recording/ledger';
import { buildCleanupPreview, validateLockedPurge, REASON_LABEL } from './recording/cleanup';
import { formatKB, todayISO } from './recording/time';
import VersionList from './components/VersionList';
import VaultPanel from './components/VaultPanel';
import CleanupConsole from './components/CleanupConsole';

export default function App() {
  const [state, setState] = useState<LabState>(loadState);
  const [view, setView] = useState<'practice' | 'vault'>('practice');
  const [selected, setSelected] = useState(state.phrases[0]?.id ?? 1);
  const [filter, setFilter] = useState('全部');
  const [query, setQuery] = useState('');
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState<PendingRecording | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [newText, setNewText] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const current = state.phrases.find(p => p.id === selected) ?? state.phrases[0];
  const filtered = useMemo(
    () => state.phrases.filter(p => (filter === '全部' || p.tag === filter || p.level === filter || (filter === '待练' && p.status !== 'mastered')) && p.text.toLowerCase().includes(query.toLowerCase())),
    [state.phrases, filter, query],
  );
  const tags = useMemo(() => ['全部', ...Array.from(new Set(state.phrases.map(p => p.tag)))], [state.phrases]);
  const preview = useMemo(() => buildCleanupPreview(state, pending, todayISO()), [state, pending]);

  useEffect(() => saveState(state), [state]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 3200); return () => window.clearTimeout(t); }, [toast]);
  useEffect(() => () => window.clearInterval(timer.current), []);

  const notify = (msg: string) => setToast(msg);

  const toggleRecord = () => {
    if (recording) {
      window.clearInterval(timer.current);
      setRecording(false);
      const secs = Math.max(1, seconds);
      setPending({ phraseId: selected, date: todayISO(), seconds: secs, sizeKB: estimateSizeKB(secs) });
      setSeconds(0);
      return;
    }
    setSeconds(0);
    setRecording(true);
    timer.current = window.setInterval(() => setSeconds(s => s + 1), 1000);
  };

  const savePending = () => {
    if (!pending) return;
    if (!canFit(state.capacity, state.recordings, pending.sizeKB)) {
      notify(`空间不足：保存需要 ${formatKB(pending.sizeKB)}，请先在离线清理台回收空间。`);
      return;
    }
    setState(s => commitPending(s, pending));
    setPending(null);
    notify('录音已入库，句子列表与容量账本已同步。');
  };

  const discardPending = () => {
    setPending(null);
    setSeconds(0);
    notify('未入库录音已放弃，保管账本未变动。');
  };

  const replay = (id: string) => {
    setState(s => markReplayed(s, id));
    notify('已登记一次复听：七天内复听过的版本不会进入清理候选。');
  };

  const addPhrase = () => {
    if (!newText.trim()) return;
    const id = Date.now();
    setState(s => ({
      ...s,
      phrases: [...s.phrases, { id, text: newText.trim(), translation: '待补充译文', tag: '自定义', level: '入门', status: 'new', attempts: 0 }],
    }));
    setSelected(id);
    setNewText('');
    setShowAdd(false);
  };

  const removePhrase = () => {
    if (!current) return;
    if (state.recordings.some(r => r.phraseId === current.id)) {
      notify('该句子仍有保管中的录音，旧录音不得丢失，请先在保管台处理。');
      return;
    }
    setState(s => ({ ...s, phrases: s.phrases.filter(p => p.id !== current.id) }));
    setSelected(state.phrases.find(p => p.id !== current.id)?.id ?? 0);
  };

  const confirmPurge = (): string | null => {
    const check = validateLockedPurge(state, preview.lockIds, pending, todayISO());
    if (!check.ok) {
      if (check.conflicts.length === 0) {
        return '锁定后状态已变化或空间已恢复充足，已整批阻止以保护旧录音。请关闭后重新预览。';
      }
      const reasons = Array.from(new Set(check.conflicts.map(c => REASON_LABEL[c.reason]))).join('；');
      return `锁定后检测到 ${check.conflicts.length} 项冲突（${reasons}），已整批阻止，请重新预览。`;
    }
    const count = preview.locked.length;
    const reclaim = preview.locked.reduce((s, l) => s + l.sizeKB, 0);
    setState(s => purgeRecordings(s, preview.lockIds));
    setShowCleanup(false);
    notify(`已清理 ${count} 条旧录音，回收 ${formatKB(reclaim)}；容量账本、录音状态与句子列表已同步。`);
    return null;
  };

  const resetDemo = () => {
    const fresh = seedState();
    setState(fresh);
    setPending(null);
    setSelected(fresh.phrases[0].id);
    notify('已重置为示例数据。');
  };

  const bars = Array.from({ length: 68 }, (_, i) => 18 + ((i * 29) % 44));

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Volume2 size={19}/></div><div><strong>声线练习室</strong><span>Pronounce / practice</span></div></div>
      <div className="side-label">我的练习</div>
      <nav>
        <button className={view === 'practice' ? 'side-link active' : 'side-link'} onClick={() => setView('practice')}><Mic size={17}/>练习库 <b>{state.phrases.length}</b></button>
        <button className={view === 'vault' ? 'side-link active' : 'side-link'} onClick={() => setView('vault')}><Archive size={17}/>录音保管台 {pending && <em className="nav-dot"/>}</button>
        <button className="side-link"><Clock3 size={17}/>练习记录</button>
        <button className="side-link"><Check size={17}/>已掌握 <b>{state.phrases.filter(p => p.status === 'mastered').length}</b></button>
      </nav>
      <div className="sidebar-foot">
        <div className="streak"><span>连续练习</span><strong>5 <small>天</small></strong><i>↗ +2</i></div>
        <div className="profile"><div className="avatar">YL</div><div><strong>Yuki Lin</strong><span>普通计划</span></div><ChevronRight size={16}/></div>
        <button className="reset-demo" onClick={resetDemo}><RotateCcw size={12}/>重置示例数据</button>
      </div>
    </aside>

    <main className="main">
      {view === 'practice' && <>
        <header className="topbar"><div><p className="eyebrow">WEDNESDAY, SEP 22</p><h1>今天练什么？</h1></div><div className="top-actions"><div className="search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索句子"/></div><button className="primary" onClick={() => setShowAdd(true)}><Plus size={17}/>添加句子</button></div></header>
        <section className="stats">
          <div><span>本周完成</span><strong>12 <em>/ 20</em></strong><div className="progress"><i style={{ width: '60%' }}/></div></div>
          <div><span>保管中录音</span><strong>{state.recordings.length} <em>条</em></strong><small>剩余 {formatKB(preview.freeKB)}</small></div>
          <div><span>最佳发音</span><strong>92 <em>分</em></strong><small className="green">↑ 6 分</small></div>
        </section>
        <div className="content-grid">
          <section className="library">
            <div className="section-head"><div><h2>句子库</h2><p>选择一句开始你的声音训练</p></div><button className="ghost" onClick={() => setFilter(filter === '待练' ? '全部' : '待练')}>只看待练</button></div>
            <div className="filters">{tags.map(t => <button key={t} className={filter === t ? 'chip active' : 'chip'} onClick={() => setFilter(t)}>{t}</button>)}</div>
            <div className="phrase-list">
              {filtered.map(p => <button key={p.id} onClick={() => { setSelected(p.id); }} className={p.id === selected ? 'phrase selected' : 'phrase'}>
                <div className="phrase-icon">{p.status === 'mastered' ? <Check size={15}/> : <Mic size={15}/>}</div>
                <div className="phrase-copy"><strong>{p.text}</strong><span>{p.translation}</span><div className="phrase-meta"><i>{p.tag}</i><i>{p.level}</i>{p.attempts > 0 && <small>{p.attempts} 次练习</small>}</div></div>
                <ChevronRight size={17}/>
              </button>)}
              {filtered.length === 0 && <div className="empty">没有找到匹配句子</div>}
            </div>
          </section>

          {current && <section className="practice">
            <div className="practice-head"><div><span className="label">CURRENT PHRASE</span><h2>跟着感觉读</h2></div><button className="icon-btn" onClick={removePhrase} title="删除句子"><Trash2 size={17}/></button></div>
            <div className="focus-card">
              <div className="focus-tag">{current.tag} · {current.level}{current.status === 'mastered' && ' · 已掌握'}</div>
              <p className="focus-text">{current.text}</p>
              <p className="focus-translation">{current.translation}</p>
              <div className="audio-sample"><button className="round-btn" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button><div className="sample-wave">{bars.map((h, i) => <i key={i} style={{ height: `${h * (playing ? 1.15 : 0.72)}%` }}/>)}</div><span>0:08</span></div>
            </div>
            <div className="record-card">
              <div className="record-top"><div><span className="label">YOUR RECORDING</span><h3>{recording ? '正在录音…' : pending ? '录音待保存：请入库后才允许清理' : '准备好后开始录音'}</h3></div><span className="record-time">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span></div>
              <div className="record-wave">{bars.slice(5, 58).map((h, i) => <i key={i} className={recording ? 'live' : ''} style={{ height: `${h * (recording ? (0.4 + ((i % 5) / 7)) : 0.4)}%` }}/>)}</div>
              <div className="record-actions">
                <button className={recording ? 'record-button recording' : 'record-button'} onClick={toggleRecord} disabled={!!pending && !recording}><span>{recording ? <Pause size={16}/> : <Mic size={16}/>}</span>{recording ? '结束录音' : pending ? '先保存或放弃待保存录音' : '开始录音'}</button>
                {pending && <>
                  <button className="primary" onClick={savePending}><Save size={15}/>保存入库</button>
                  <button className="secondary" onClick={discardPending}><X size={15}/>放弃</button>
                </>}
                {!pending && <button className="secondary" onClick={() => setPlaying(!playing)}>{playing ? <Pause size={15}/> : <Play size={15}/>} 回放</button>}
              </div>
              {pending && <p className="pending-note">待保存 {formatKB(pending.sizeKB)}；存在待保存录音时，离线清理台整批阻止。</p>}
            </div>
            <VersionList recordings={recordingsOfPhrase(state.recordings, current.id)} mastered={current.status === 'mastered'} onReplay={replay}/>
            <div className="tip"><span>练习小贴士</span><p>放慢速度，先把每个音节读清楚，再自然地连起来。</p><RotateCcw size={15}/></div>
          </section>}
        </div>
      </>}

      {view === 'vault' && <VaultPanel state={state} pending={pending} onOpenCleanup={() => setShowCleanup(true)} onReplay={replay} onSavePending={savePending} onDiscardPending={discardPending}/>}
    </main>

    {showAdd && <div className="modal-backdrop" onClick={() => setShowAdd(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><h2>添加练习句子</h2><button className="icon-btn" onClick={() => setShowAdd(false)}>×</button></div><label>英文句子<textarea autoFocus value={newText} onChange={e => setNewText(e.target.value)} placeholder="例如：I can make this happen."/></label><div className="modal-actions"><button className="secondary" onClick={() => setShowAdd(false)}>取消</button><button className="primary" onClick={addPhrase}>加入句子库</button></div></div></div>}
    {showCleanup && <CleanupConsole preview={preview} onConfirm={confirmPurge} onClose={() => setShowCleanup(false)}/>}
    {toast && <div className="toast"><CheckCircle2 size={15}/>{toast}</div>}
  </div>;
}
