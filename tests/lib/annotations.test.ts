import { describe, expect, it } from 'vitest'
import {
  annotationMarkXKey,
  annotationsForXKey,
  notesByMarkKey,
  normalizeChartAnnotation,
} from '../../src/lib/annotations'

describe('normalizeChartAnnotation', () => {
  it('keeps a valid year note and drops empty labels', () => {
    expect(normalizeChartAnnotation({ year: 2024, label: '  House  ' })).toMatchObject({
      year: 2024,
      month: null,
      label: 'House',
    })
    expect(normalizeChartAnnotation({ year: 2024, label: '   ' })).toBeNull()
    expect(normalizeChartAnnotation({ year: 99, label: 'x' })).toBeNull()
  })
})

describe('annotation placement', () => {
  const notes = [
    { id: 'a', year: 2024, month: null, label: 'House' },
    { id: 'b', year: 2025, month: 6, label: 'Job' },
  ]

  it('yearly column matches the calendar year', () => {
    expect(annotationsForXKey(notes, '2024').map((n) => n.id)).toEqual(['a'])
    expect(annotationsForXKey(notes, '2025').map((n) => n.id)).toEqual(['b'])
    expect(annotationsForXKey(notes, 'now')).toEqual([])
  })

  it('monthly column includes year-only notes and the matching month', () => {
    expect(annotationsForXKey(notes, '2024-06').map((n) => n.id)).toEqual(['a'])
    expect(annotationsForXKey(notes, '2025-06').map((n) => n.id)).toEqual(['b'])
    expect(annotationsForXKey(notes, '2025-07').map((n) => n.id)).toEqual([])
  })

  it('draws year-only notes on Dec when the chart is monthly', () => {
    const keys = ['2024-03', '2024-12', '2025-06']
    expect(annotationMarkXKey(notes[0]!, keys)).toBe('2024-12')
    expect(annotationMarkXKey(notes[1]!, keys)).toBe('2025-06')
    expect(annotationMarkXKey(notes[0]!, ['2024'])).toBe('2024')
  })

  it('marks only one tick per note', () => {
    const map = notesByMarkKey(notes, ['2024-03', '2024-12', '2025-06'])
    expect([...map.keys()]).toEqual(['2024-12', '2025-06'])
    expect(map.get('2024-12')?.map((n) => n.id)).toEqual(['a'])
  })
})
