import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Copy, MapPin, Plus, Repeat2, Settings2, Trash2, TriangleAlert, X } from 'lucide-react'
import { addDays, dateKey, dayKeys, emptyData, freshId, minutes, occurrencesOn, overlaps, parseDate, rangeLabel, saturdayOf, timeLabel, type BlockFields, type Category, type Frequency, type Occurrence, type PlannerData, type RecurringBlock } from './model'
import { db, exportData, loadData, replaceData } from './storage'

const CATEGORY_LABEL: Record<Category, string> = { university: 'University', teaching: 'Teaching', racing: 'Racing team', gym: 'Gym', personal: 'Personal' }
const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[]
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TODAY = dateKey(new Date())
const HOUR_HEIGHT = 76
type Editor = { source?: Occurrence; date: string; fields: BlockFields; frequency: 'none' | Frequency; scope: 'day' | 'future' }
const defaultFields = (start: string | null = null): BlockFields => ({ title: '', category: 'personal', start, end: start ? clockFromMinutes(Math.min(minutes(start) + 60, 1439)) : null, location: '', notes: '', checklist: [] })
function clockFromMinutes(value: number) { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` }
function dateTitle(key: string) { return parseDate(key).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) }
function weekTitle(week: string) { const end = addDays(week, 6); const a = parseDate(week); const b = parseDate(end); return `${a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${b.toLocaleDateString('en-US', { month: a.getMonth() === b.getMonth() ? undefined : 'short', day: 'numeric' })}` }
function categoryClass(category: Category) { return `cat-${category}` }
function timeParts(time: string) { const [h, m] = time.split(':').map(Number); return { hour: h % 12 || 12, minute: m, period: h < 12 ? 'AM' : 'PM' } }
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const parts = timeParts(value)
  const change = (hour: number, minute: number, period: string) => onChange(clockFromMinutes(((hour % 12) + (period === 'PM' ? 12 : 0)) * 60 + minute))
  return <div className="time-field"><span>{label}</span><div className="time-controls">
    <select aria-label={`${label} hour`} value={parts.hour} onChange={e => change(Number(e.target.value), parts.minute, parts.period)}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select>
    <span>:</span><input aria-label={`${label} minute`} type="number" inputMode="numeric" min="0" max="59" value={String(parts.minute).padStart(2, '0')} onChange={e => change(parts.hour, Math.min(59, Math.max(0, Number(e.target.value) || 0)), parts.period)} />
    <select aria-label={`${label} period`} value={parts.period} onChange={e => change(parts.hour, parts.minute, e.target.value)}><option>AM</option><option>PM</option></select>
  </div></div>
}

export default function App() {
  const [data, setData] = useState<PlannerData>(emptyData)
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const week = saturdayOf(selectedDate)
  const dates = useMemo(() => dayKeys(week), [week])
  const entries = useMemo(() => occurrencesOn(data, selectedDate), [data, selectedDate])
  const timed = entries.filter(item => item.start && item.end)
  const anytime = entries.filter(item => !item.start)
  const conflicts = useMemo(() => overlaps(entries), [entries])
  const checks = useMemo(() => new Map(data.checks.map(item => [item.id, item.checked])), [data.checks])

  useEffect(() => { loadData().then(setData).catch(error => say(`Could not open local data: ${String(error)}`)) }, [])
  useEffect(() => {
    if (!timelineRef.current) return
    const first = timed.length ? Math.max(0, minutes(timed[0].start!) - 60) : 7 * 60
    timelineRef.current.scrollTop = first / 60 * HOUR_HEIGHT
  }, [selectedDate])
  function say(message: string) { setToast(message); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(''), 4500) }
  async function refresh() { setData(await loadData()) }
  function openNew(date: string, start: string | null = null) { setEditor({ date, fields: defaultFields(start), frequency: 'none', scope: 'day' }) }
  function openExisting(item: Occurrence) {
    const rule = item.ruleId ? data.rules.find(r => r.id === item.ruleId) : undefined
    setEditor({ source: item, date: item.date, fields: { title: item.title, category: item.category, start: item.start, end: item.end, location: item.location, notes: item.notes, checklist: item.checklist.map(c => ({ ...c })) }, frequency: rule?.frequency ?? 'none', scope: 'day' })
  }
  async function save() {
    if (!editor || busy) return
    const title = editor.fields.title.trim()
    if (!title) return say('Add a title first.')
    if ((editor.fields.start === null) !== (editor.fields.end === null) || (editor.fields.start && editor.fields.end && minutes(editor.fields.end) <= minutes(editor.fields.start))) return say('End time must be after start time. Use Anytime for tasks without a time.')
    const fields = { ...editor.fields, title, location: editor.fields.location.trim(), notes: editor.fields.notes.trim(), checklist: editor.fields.checklist.filter(c => c.text.trim()).map(c => ({ ...c, text: c.text.trim() })) }
    setBusy(true)
    try {
      const source = editor.source
      if (!source) {
        if (editor.frequency === 'none') await db.events.put({ ...fields, id: freshId(), date: editor.date })
        else await db.rules.put({ ...fields, id: freshId(), weekday: parseDate(editor.date).getDay(), frequency: editor.frequency, anchor: saturdayOf(editor.date), effectiveFrom: editor.date, until: null, active: true, pausedFrom: null })
      } else if (source.eventId) {
        if (editor.frequency === 'none') await db.events.put({ ...fields, id: source.eventId, date: editor.date })
        else await db.transaction('rw', db.events, db.rules, async () => {
          await db.events.delete(source.eventId!)
          await db.rules.put({ ...fields, id: freshId(), weekday: parseDate(editor.date).getDay(), frequency: editor.frequency as Frequency, anchor: saturdayOf(editor.date), effectiveFrom: editor.date, until: null, active: true, pausedFrom: null })
        })
      } else if (source.ruleId) {
        const rule = data.rules.find(r => r.id === source.ruleId)!
        if (editor.scope === 'future') {
          await db.transaction('rw', db.rules, db.overrides, db.events, async () => {
            const futureOverrides = await db.overrides.filter(item => item.ruleId === rule.id && item.date >= source.date).toArray()
            await db.rules.put({ ...rule, until: addDays(source.date, -1) })
            if (editor.frequency === 'none') {
              await db.events.put({ ...fields, id: freshId(), date: editor.date })
            } else {
              const newId = freshId()
              await db.rules.put({ ...fields, id: newId, weekday: parseDate(editor.date).getDay(), frequency: editor.frequency, anchor: rule.anchor, effectiveFrom: editor.date, until: rule.until, active: true, pausedFrom: rule.pausedFrom ?? null })
              for (const item of futureOverrides.filter(item => item.date > source.date)) await db.overrides.put({ ...item, id: `${newId}:${item.date}`, ruleId: newId })
            }
            await db.overrides.bulkDelete(futureOverrides.map(item => item.id))
          })
        } else if (editor.date === source.date) {
          await db.overrides.put({ id: `${rule.id}:${source.date}`, ruleId: rule.id, date: source.date, cancelled: false, fields })
        } else {
          await db.transaction('rw', db.events, db.overrides, async () => {
            await db.overrides.put({ id: `${rule.id}:${source.date}`, ruleId: rule.id, date: source.date, cancelled: true, fields: null })
            await db.events.put({ ...fields, id: freshId(), date: editor.date })
          })
        }
      }
      await refresh(); setSelectedDate(editor.date); setEditor(null); say('Saved')
    } catch (error) { say(`Save failed: ${String(error)}`) } finally { setBusy(false) }
  }
  async function remove() {
    if (!editor?.source || busy || !window.confirm('Delete this block?')) return
    const source = editor.source
    setBusy(true)
    try {
      if (source.eventId) await db.events.delete(source.eventId)
      else if (source.ruleId) {
        const rule = data.rules.find(r => r.id === source.ruleId)!
        if (editor.scope === 'future') await db.rules.put({ ...rule, until: addDays(source.date, -1) })
        else await db.overrides.put({ id: `${rule.id}:${source.date}`, ruleId: rule.id, date: source.date, cancelled: true, fields: null })
      }
      await refresh(); setEditor(null); say('Deleted')
    } catch (error) { say(`Delete failed: ${String(error)}`) } finally { setBusy(false) }
  }
  function duplicate() {
    if (!editor) return
    setEditor({ date: editor.date, fields: { ...editor.fields, title: `${editor.fields.title} copy`, checklist: editor.fields.checklist.map(item => ({ ...item, id: freshId() })) }, frequency: 'none', scope: 'day' })
    say('Copy ready to save')
  }
  async function toggleCheck(item: Occurrence, checklistId: string) {
    const id = `${item.key}:${checklistId}`
    try { await db.checks.put({ id, checked: !checks.get(id) }); await refresh() } catch (error) { say(`Could not save checklist: ${String(error)}`) }
  }
  async function downloadBackup() {
    try {
      const backup = await exportData()
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = `planner-backup-${TODAY}.json`; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      say('Backup downloaded')
    } catch (error) { say(`Export failed: ${String(error)}`) }
  }
  async function importBackup(file: File) {
    try {
      const value = JSON.parse(await file.text())
      if (data.rules.length + data.events.length > 0 && !window.confirm('Import replaces every current Planner block and checklist. Continue?')) return
      await replaceData(value); await refresh(); setShowSettings(false); say('Schedule imported')
    } catch (error) { say(error instanceof Error ? error.message : 'Import failed') }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }
  async function toggleRule(rule: RecurringBlock) {
    try { const paused = !rule.pausedFrom; await db.rules.put({ ...rule, pausedFrom: paused ? dateKey(new Date()) : null }); await refresh(); say(paused ? 'Upcoming repeats paused' : 'Repeating block resumed') } catch (error) { say(`Could not change repeat: ${String(error)}`) }
  }
  function timelineClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains('timeline-hit')) return
    const rect = event.currentTarget.getBoundingClientRect()
    const clicked = event.clientY - rect.top + event.currentTarget.scrollTop
    const value = Math.max(0, Math.min(23 * 60, Math.round(clicked / HOUR_HEIGHT * 60 / 30) * 30))
    openNew(selectedDate, clockFromMinutes(value))
  }

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-row"><div className="brand-mark"><CalendarDays size={23} strokeWidth={2.6} /></div><div><span className="eyebrow">YOUR SPACE TO PLAN</span><h1>Planner<span className="brand-dot">.</span></h1></div><button className="icon-button settings-button" aria-label="Open settings" onClick={() => setShowSettings(true)}><Settings2 size={21} /></button></div>
      <div className="week-heading"><div><span className="eyebrow">WEEK OF</span><h2>{weekTitle(week)}</h2></div><div className="week-controls"><button aria-label="Previous week" onClick={() => setSelectedDate(addDays(selectedDate, -7))}><ChevronLeft size={20} /></button><button aria-label="Go to today" className="today-button" onClick={() => setSelectedDate(dateKey(new Date()))}>Today</button><button aria-label="Next week" onClick={() => setSelectedDate(addDays(selectedDate, 7))}><ChevronRight size={20} /></button></div></div>
      <div className="week-strip" aria-label="Days of this week">{dates.map(date => {
        const d = parseDate(date), list = occurrencesOn(data, date), active = date === selectedDate
        return <button key={date} className={`day-chip ${active ? 'active' : ''} ${date === TODAY ? 'is-today' : ''}`} aria-pressed={active} onClick={() => setSelectedDate(date)}><span>{DAY_SHORT[d.getDay()]}</span><strong>{d.getDate()}</strong><i>{list.length ? Array.from(new Set(list.map(x => x.category))).slice(0, 3).map(cat => <b key={cat} className={categoryClass(cat)} />) : <b className="empty-dot" />}</i></button>
      })}</div>
    </header>

    <main className="main-content"><div className="day-head"><div><span className="eyebrow">{selectedDate === TODAY ? 'TODAY · ' : ''}{entries.length} {entries.length === 1 ? 'BLOCK' : 'BLOCKS'}</span><h2>{dateTitle(selectedDate)}</h2></div><button className="add-button" aria-label="Add block" onClick={() => openNew(selectedDate)}><Plus size={22} /></button></div>
      <div className="category-legend">{CATEGORIES.map(cat => <span key={cat}><i className={categoryClass(cat)} />{CATEGORY_LABEL[cat]}</span>)}</div>
      <section className="anytime-section"><div className="section-label"><span>ANYTIME</span><button onClick={() => openNew(selectedDate)}><Plus size={15} /> Add task</button></div>{anytime.length ? <div className="anytime-list">{anytime.map(item => <BlockCard key={item.key} item={item} compact conflict={false} checks={checks} onOpen={openExisting} onCheck={toggleCheck} />)}</div> : <button className="empty-anytime" onClick={() => openNew(selectedDate)}>Nothing planned here <Plus size={15} /></button>}</section>
      <section className="timeline-section"><div className="section-label"><span>DAY TIMELINE</span><span className="hint">Tap a free time to add</span></div><div className="timeline-scroll" ref={timelineRef} onClick={timelineClick}><div className="timeline-canvas timeline-hit">{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="hour-line timeline-hit" style={{ top: hour * HOUR_HEIGHT }}><span>{timeLabel(clockFromMinutes(hour * 60))}</span></div>)}{timed.map((item, index) => { const top = minutes(item.start!) / 60 * HOUR_HEIGHT, height = Math.max(56, (minutes(item.end!) - minutes(item.start!)) / 60 * HOUR_HEIGHT); const conflict = conflicts.has(item.key); return <div key={item.key} className={`timeline-position ${conflict ? `overlap-lane lane-${index % 2}` : ''}`} style={{ top, height }}><BlockCard item={item} conflict={conflict} checks={checks} onOpen={openExisting} onCheck={toggleCheck} /></div> })}</div></div></section>
      <p className="footer-note">Your plans stay on this device. Export a backup from Settings.</p>
    </main>
    <button className="floating-add" onClick={() => openNew(selectedDate)}><Plus size={23} /> New block</button>
    {toast && <div className="toast" role="status">{toast}</div>}

    {editor && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setEditor(null) }}><div className="sheet editor-sheet" role="dialog" aria-modal="true" aria-label={editor.source ? 'Edit block' : 'New block'}><div className="sheet-handle" /><div className="sheet-top"><div><span className="eyebrow">{editor.source ? 'EDIT YOUR PLAN' : 'MAKE A PLAN'}</span><h2>{editor.source ? 'Edit block' : 'New block'}</h2></div><button className="icon-button" aria-label="Close editor" onClick={() => setEditor(null)}><X size={21} /></button></div>
      <div className="sheet-body"><label className="field-label">WHAT ARE YOU PLANNING?<input autoFocus placeholder="e.g. Gym, project work, class…" value={editor.fields.title} onChange={e => setEditor({ ...editor, fields: { ...editor.fields, title: e.target.value } })} /></label>
        <div className="field-label">CATEGORY<div className="category-picker">{CATEGORIES.map(cat => <button key={cat} className={`${categoryClass(cat)} ${editor.fields.category === cat ? 'selected' : ''}`} onClick={() => setEditor({ ...editor, fields: { ...editor.fields, category: cat } })}>{CATEGORY_LABEL[cat]}</button>)}</div></div>
        <div className="editor-grid"><label className="field-label">DATE<input type="date" value={editor.date} onChange={e => setEditor({ ...editor, date: e.target.value })} /></label><label className="field-label">REPEAT<select value={editor.frequency} disabled={!!editor.source?.ruleId && editor.scope === 'day'} onChange={e => setEditor({ ...editor, frequency: e.target.value as Editor['frequency'] })}><option value="none">Once</option><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option></select></label></div>
        {editor.source?.ruleId && <div className="scope-picker"><span><Repeat2 size={16} /> Apply changes to</span><div><button className={editor.scope === 'day' ? 'selected' : ''} onClick={() => setEditor({ ...editor, scope: 'day' })}>This day</button><button className={editor.scope === 'future' ? 'selected' : ''} onClick={() => setEditor({ ...editor, scope: 'future' })}>This & future</button></div></div>}
        <label className="anytime-toggle"><input type="checkbox" checked={editor.fields.start === null} onChange={e => setEditor({ ...editor, fields: { ...editor.fields, start: e.target.checked ? null : '09:00', end: e.target.checked ? null : '10:00' } })} /> No set time <span>Put it in Anytime</span></label>
        {editor.fields.start && editor.fields.end && <div className="editor-grid"><TimeField label="START" value={editor.fields.start} onChange={value => setEditor({ ...editor, fields: { ...editor.fields, start: value } })} /><TimeField label="END" value={editor.fields.end} onChange={value => setEditor({ ...editor, fields: { ...editor.fields, end: value } })} /></div>}
        <label className="field-label">LOCATION <span className="optional">OPTIONAL</span><input placeholder="Room, campus, online…" value={editor.fields.location} onChange={e => setEditor({ ...editor, fields: { ...editor.fields, location: e.target.value } })} /></label>
        <label className="field-label">NOTES <span className="optional">OPTIONAL</span><textarea placeholder="Anything to remember…" rows={2} value={editor.fields.notes} onChange={e => setEditor({ ...editor, fields: { ...editor.fields, notes: e.target.value } })} /></label>
        <div className="checklist-editor"><div className="section-label"><span>CHECKLIST</span><button onClick={() => setEditor({ ...editor, fields: { ...editor.fields, checklist: [...editor.fields.checklist, { id: freshId(), text: '' }] } })}><Plus size={15} /> Add item</button></div>{editor.fields.checklist.map((item, index) => <div className="checklist-edit-row" key={item.id}>{editor.source && <button className={`small-check ${checks.get(`${editor.source.key}:${item.id}`) ? 'checked' : ''}`} aria-label="Toggle checklist item" onClick={() => toggleCheck(editor.source!, item.id)}>{checks.get(`${editor.source.key}:${item.id}`) && <Check size={13} />}</button>}<input placeholder="Checklist item" value={item.text} onChange={e => { const list = editor.fields.checklist.map((c, i) => i === index ? { ...c, text: e.target.value } : c); setEditor({ ...editor, fields: { ...editor.fields, checklist: list } }) }} /><button aria-label="Remove checklist item" onClick={() => setEditor({ ...editor, fields: { ...editor.fields, checklist: editor.fields.checklist.filter(c => c.id !== item.id) } })}><X size={16} /></button></div>)}</div>
      </div><div className="sheet-actions">{editor.source && <div className="secondary-actions"><button onClick={duplicate}><Copy size={17} /> Duplicate</button><button className="danger" onClick={remove}><Trash2 size={17} /> Delete</button></div>}<button className="primary-action" disabled={busy} onClick={save}>{busy ? 'Saving…' : editor.source ? 'Save changes' : 'Add to plan'} <Check size={18} /></button></div>
    </div></div>}

    {showSettings && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setShowSettings(false) }}><div className="sheet settings-sheet" role="dialog" aria-modal="true" aria-label="Settings"><div className="sheet-handle" /><div className="sheet-top"><div><span className="eyebrow">YOUR PLANNER</span><h2>Settings</h2></div><button className="icon-button" aria-label="Close settings" onClick={() => setShowSettings(false)}><X size={21} /></button></div><div className="sheet-body"><div className="settings-card"><h3>Backup & restore</h3><p>Your schedule lives on this device. Save a JSON backup regularly, especially before changing phones.</p><div className="settings-actions"><button onClick={downloadBackup}><ArrowDownToLine size={18} /> Export backup</button><button onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={18} /> Import JSON</button></div><input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void importBackup(file) }} /><p className="microcopy">Import replaces the current schedule. Export it first if you want to keep it.</p></div><div className="settings-card"><h3>Repeating blocks</h3><p>Pause a rule to hide it from upcoming weeks. Open a block on its day to change this occurrence or all future ones.</p>{data.rules.length ? <div className="rule-list">{data.rules.map(rule => <div key={rule.id} className="rule-row"><span className={`rule-icon ${categoryClass(rule.category)}`}><Repeat2 size={16} /></span><div><strong>{rule.title}</strong><small>{DAY_SHORT[rule.weekday]} · {rule.frequency === 'biweekly' ? 'Every 2 weeks' : 'Weekly'} · {rangeLabel(rule.start, rule.end)}</small></div><button className={!rule.pausedFrom ? 'switch on' : 'switch'} aria-label={`${rule.pausedFrom ? 'Resume' : 'Pause'} ${rule.title}`} aria-pressed={!rule.pausedFrom} onClick={() => toggleRule(rule)}><i /></button></div>)}</div> : <div className="empty-rule">No repeating blocks yet. Import your timetable or add one.</div>}</div><div className="settings-card"><h3>Install on iPhone</h3><p>Open the Planner link in Safari, tap Share, then Add to Home Screen. Open the installed app and import your private timetable through Import JSON.</p></div><p className="footer-note">Planner v1 · Local first · No account or alerts</p></div></div></div>}
  </div>
}

function BlockCard({ item, conflict, compact = false, checks, onOpen, onCheck }: { item: Occurrence; conflict: boolean; compact?: boolean; checks: Map<string, boolean>; onOpen: (item: Occurrence) => void; onCheck: (item: Occurrence, id: string) => void }) {
  const done = item.checklist.filter(c => checks.get(`${item.key}:${c.id}`)).length
  return <div className={`block-card ${categoryClass(item.category)} ${compact ? 'compact' : ''}`}><button className="block-open" onClick={() => onOpen(item)}><span className="block-category">{CATEGORY_LABEL[item.category]} {item.ruleId && <Repeat2 size={12} />}</span><strong>{item.title}</strong><span className="block-meta">{item.start ? <><Clock3 size={13} />{rangeLabel(item.start, item.end)}</> : 'Anytime'}{item.location && <><MapPin size={13} />{item.location}</>}</span>{conflict && <span className="conflict"><TriangleAlert size={13} /> Overlaps another block</span>}</button>{item.checklist.length > 0 && <div className="block-checklist">{item.checklist.slice(0, compact ? 3 : 2).map(check => <button key={check.id} className={checks.get(`${item.key}:${check.id}`) ? 'done' : ''} onClick={() => onCheck(item, check.id)}><span className="check-box">{checks.get(`${item.key}:${check.id}`) && <Check size={11} />}</span><span>{check.text}</span></button>)}{item.checklist.length > (compact ? 3 : 2) && <span className="more-checks">{done}/{item.checklist.length} done</span>}</div>}</div>
}
