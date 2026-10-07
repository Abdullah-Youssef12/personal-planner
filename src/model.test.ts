import { describe, expect, it } from 'vitest'
import { addDays, emptyData, isRuleOnDate, occurrencesOn, overlaps, saturdayOf, splitRuleForFuture, timeLabel, validateImport, type RecurringBlock } from './model'

const rule: RecurringBlock = {
  id: 'biweekly', weekday: 6, frequency: 'biweekly', anchor: '2026-10-10',
  effectiveFrom: '2026-10-10', until: null, active: true,
  title: 'Modern Control', category: 'university', start: '14:30', end: '15:20',
  location: 'Room 913', notes: 'Tutorial', checklist: [{ id: 'prepare', text: 'Prepare' }],
}

describe('planner schedule', () => {
  it('starts weeks on Saturday and preserves dates across DST changes', () => {
    expect(saturdayOf('2026-10-08')).toBe('2026-10-03')
    expect(addDays('2026-10-10', 14)).toBe('2026-10-24')
  })
  it('shows alternating weeks from October 10', () => {
    expect(isRuleOnDate(rule, '2026-10-10')).toBe(true)
    expect(isRuleOnDate(rule, '2026-10-17')).toBe(false)
    expect(isRuleOnDate(rule, '2026-10-24')).toBe(true)
    expect(isRuleOnDate({ ...rule, pausedFrom: '2026-10-17' }, '2026-10-10')).toBe(true)
    expect(isRuleOnDate({ ...rule, pausedFrom: '2026-10-17' }, '2026-10-24')).toBe(false)
  })
  it('applies a one-day change without touching later weeks', () => {
    const data = { ...emptyData(), rules: [rule], overrides: [{ id: 'o', ruleId: rule.id, date: '2026-10-10', cancelled: false, fields: { ...rule, title: 'Rescheduled tutorial', start: '16:00', end: '16:50' } }] }
    expect(occurrencesOn(data, '2026-10-10')[0].title).toBe('Rescheduled tutorial')
    expect(occurrencesOn(data, '2026-10-24')[0].title).toBe('Modern Control')
  })
  it('splits future edits while keeping the original biweekly rotation', () => {
    const [past, future] = splitRuleForFuture(rule, '2026-10-24', { ...rule, title: 'New room' }, '2026-10-24', 'biweekly')
    expect(isRuleOnDate(past, '2026-10-24')).toBe(false)
    expect(isRuleOnDate(future, '2026-10-24')).toBe(true)
    expect(isRuleOnDate(future, '2026-10-31')).toBe(false)
  })
  it('detects conflicts but keeps both blocks', () => {
    const a = { ...rule, key: 'a', date: '2026-10-10' }
    const b = { ...rule, key: 'b', date: '2026-10-10', start: '15:00', end: '16:00' }
    expect(overlaps([a, b])).toEqual(new Set(['a', 'b']))
  })
  it('validates backups and formats 12-hour labels', () => {
    const data = { ...emptyData(), rules: [rule] }
    expect(validateImport(JSON.parse(JSON.stringify(data))).rules).toHaveLength(1)
    expect(() => validateImport({ ...data, schemaVersion: 2 })).toThrow()
    expect(timeLabel('18:30')).toBe('6:30 PM')
  })
})
