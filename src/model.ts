export const CATEGORIES = ['university', 'teaching', 'racing', 'gym', 'personal'] as const
export type Category = typeof CATEGORIES[number]
export type Frequency = 'weekly' | 'biweekly'
export type ChecklistItem = { id: string; text: string }
export type BlockFields = {
  title: string
  category: Category
  start: string | null
  end: string | null
  location: string
  notes: string
  checklist: ChecklistItem[]
}
export type RecurringBlock = BlockFields & {
  id: string
  weekday: number
  frequency: Frequency
  anchor: string
  effectiveFrom: string
  until: string | null
  active: boolean
  pausedFrom?: string | null
}
export type OneOffBlock = BlockFields & { id: string; date: string }
export type OccurrenceOverride = { id: string; ruleId: string; date: string; cancelled: boolean; fields: BlockFields | null }
export type CheckState = { id: string; checked: boolean }
export type PlannerData = {
  schemaVersion: 1
  exportedAt: string
  rules: RecurringBlock[]
  events: OneOffBlock[]
  overrides: OccurrenceOverride[]
  checks: CheckState[]
}
export type Occurrence = BlockFields & {
  key: string
  date: string
  ruleId?: string
  eventId?: string
}

export const emptyData = (): PlannerData => ({ schemaVersion: 1, exportedAt: new Date().toISOString(), rules: [], events: [], overrides: [], checks: [] })
export const freshId = () => crypto.randomUUID()

export function parseDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function addDays(key: string, days: number): string {
  const date = parseDate(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}
export function saturdayOf(key: string): string {
  const date = parseDate(key)
  return addDays(key, -((date.getDay() + 1) % 7))
}
export function dayKeys(week: string): string[] { return Array.from({ length: 7 }, (_, n) => addDays(week, n)) }
export function minutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}
export function timeLabel(time: string | null): string {
  if (!time) return 'Anytime'
  const [hour, minute] = time.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}
export function rangeLabel(start: string | null, end: string | null): string {
  return start && end ? `${timeLabel(start)} – ${timeLabel(end)}` : 'Anytime'
}
export function isRuleOnDate(rule: RecurringBlock, date: string): boolean {
  if (!rule.active || date < rule.effectiveFrom || (rule.until && date > rule.until) || (rule.pausedFrom && date >= rule.pausedFrom)) return false
  if (parseDate(date).getDay() !== rule.weekday) return false
  if (rule.frequency === 'weekly') return true
  const weeks = Math.round((parseDate(saturdayOf(date)).getTime() - parseDate(saturdayOf(rule.anchor)).getTime()) / 604800000)
  return weeks % 2 === 0
}
export function occurrencesOn(data: PlannerData, date: string): Occurrence[] {
  const occurrences: Occurrence[] = data.rules.filter(rule => isRuleOnDate(rule, date)).flatMap(rule => {
    const override = data.overrides.find(item => item.ruleId === rule.id && item.date === date)
    if (override?.cancelled) return []
    const fields = override?.fields ?? rule
    return [{ ...fields, key: `rule:${rule.id}:${date}`, date, ruleId: rule.id }]
  })
  for (const event of data.events.filter(item => item.date === date)) {
    occurrences.push({ ...event, key: `event:${event.id}`, eventId: event.id })
  }
  return occurrences.sort((a, b) => (a.start === null ? -1 : b.start === null ? 1 : minutes(a.start) - minutes(b.start)) || a.title.localeCompare(b.title))
}
export function overlaps(items: Occurrence[]): Set<string> {
  const result = new Set<string>()
  const timed = items.filter(item => item.start && item.end)
  for (let a = 0; a < timed.length; a++) for (let b = a + 1; b < timed.length; b++) {
    if (minutes(timed[a].start!) < minutes(timed[b].end!) && minutes(timed[b].start!) < minutes(timed[a].end!)) {
      result.add(timed[a].key); result.add(timed[b].key)
    }
  }
  return result
}
export function splitRuleForFuture(rule: RecurringBlock, fromDate: string, fields: BlockFields, newDate: string, frequency: Frequency): [RecurringBlock, RecurringBlock] {
  return [
    { ...rule, until: addDays(fromDate, -1) },
    { ...fields, id: freshId(), weekday: parseDate(newDate).getDay(), frequency, anchor: rule.anchor, effectiveFrom: newDate, until: rule.until, active: true, pausedFrom: rule.pausedFrom ?? null },
  ]
}
export function validateImport(value: unknown): PlannerData {
  if (!value || typeof value !== 'object') throw new Error('This is not a Planner backup.')
  const v = value as Record<string, unknown>
  if (v.schemaVersion !== 1 || !Array.isArray(v.rules) || !Array.isArray(v.events) || !Array.isArray(v.overrides) || !Array.isArray(v.checks)) throw new Error('Unsupported or incomplete Planner backup.')
  const validDate = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && dateKey(parseDate(x)) === x
  const validTime = (x: unknown) => x === null || (typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x))
  const validFields = (x: unknown): x is BlockFields => {
    if (!x || typeof x !== 'object') return false
    const f = x as Record<string, unknown>
    return typeof f.title === 'string' && CATEGORIES.includes(f.category as Category) && validTime(f.start) && validTime(f.end) && ((f.start === null && f.end === null) || (typeof f.start === 'string' && typeof f.end === 'string' && minutes(f.end) > minutes(f.start))) && typeof f.location === 'string' && typeof f.notes === 'string' && Array.isArray(f.checklist) && f.checklist.every((c: unknown) => !!c && typeof c === 'object' && typeof (c as ChecklistItem).id === 'string' && typeof (c as ChecklistItem).text === 'string')
  }
  if (!v.rules.every((x: RecurringBlock) => validFields(x) && typeof x.id === 'string' && Number.isInteger(x.weekday) && x.weekday >= 0 && x.weekday <= 6 && ['weekly', 'biweekly'].includes(x.frequency) && validDate(x.anchor) && validDate(x.effectiveFrom) && (x.until === null || validDate(x.until)) && typeof x.active === 'boolean' && (x.pausedFrom === undefined || x.pausedFrom === null || validDate(x.pausedFrom)))) throw new Error('A repeating block is invalid.')
  if (!v.events.every((x: OneOffBlock) => validFields(x) && typeof x.id === 'string' && validDate(x.date))) throw new Error('A one-time block is invalid.')
  if (!v.overrides.every((x: OccurrenceOverride) => !!x && typeof x.id === 'string' && typeof x.ruleId === 'string' && validDate(x.date) && typeof x.cancelled === 'boolean' && (x.fields === null || validFields(x.fields)))) throw new Error('A one-day change is invalid.')
  if (!v.checks.every((x: CheckState) => !!x && typeof x.id === 'string' && typeof x.checked === 'boolean')) throw new Error('A checklist state is invalid.')
  const ids = [...v.rules.map((x: RecurringBlock) => x.id), ...v.events.map((x: OneOffBlock) => x.id)]
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate block IDs in backup.')
  return value as PlannerData
}
