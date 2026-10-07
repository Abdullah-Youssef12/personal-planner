import Dexie, { type EntityTable } from 'dexie'
import { emptyData, type CheckState, type OccurrenceOverride, type OneOffBlock, type PlannerData, type RecurringBlock, validateImport } from './model'

class PlannerDB extends Dexie {
  rules!: EntityTable<RecurringBlock, 'id'>
  events!: EntityTable<OneOffBlock, 'id'>
  overrides!: EntityTable<OccurrenceOverride, 'id'>
  checks!: EntityTable<CheckState, 'id'>
  constructor() {
    super('planner-v1')
    this.version(1).stores({ rules: 'id, weekday', events: 'id, date', overrides: 'id, [ruleId+date]', checks: 'id' })
  }
}
export const db = new PlannerDB()

export async function loadData(): Promise<PlannerData> {
  const [rules, events, overrides, checks] = await Promise.all([db.rules.toArray(), db.events.toArray(), db.overrides.toArray(), db.checks.toArray()])
  return { ...emptyData(), rules, events, overrides, checks }
}
export async function replaceData(value: unknown): Promise<void> {
  const data = validateImport(value)
  await db.transaction('rw', db.rules, db.events, db.overrides, db.checks, async () => {
    await Promise.all([db.rules.clear(), db.events.clear(), db.overrides.clear(), db.checks.clear()])
    await db.rules.bulkAdd(data.rules)
    await db.events.bulkAdd(data.events)
    await db.overrides.bulkAdd(data.overrides)
    await db.checks.bulkAdd(data.checks)
  })
}
export async function exportData(): Promise<PlannerData> { return { ...(await loadData()), exportedAt: new Date().toISOString() } }
