import { describe, expect, it } from 'vitest'
import { APP_DATA_SNAPSHOT_VERSION, type AppDataSnapshot } from '../../src/lib/appDataSnapshot'
import {
  buildTableExportSheets,
  buildTableExportXlsx,
  tableExportFileName,
} from '../../src/lib/tableExport'

function emptySnapshot(partial: Partial<AppDataSnapshot> = {}): AppDataSnapshot {
  return {
    version: APP_DATA_SNAPSHOT_VERSION,
    exportedAt: '2026-08-15T12:00:00.000Z',
    scenarios: [],
    portfolios: [],
    incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
    savings: { version: 1, accounts: [] },
    overview: { version: 2, scenarios: [], selectedScenarioId: null },
    comparables: [],
    annotations: [],
    goals: [],
    ...partial,
  }
}

const sample = emptySnapshot({
  incomeCost: {
    version: 3,
    scenarios: [{ id: 'sc', name: 'Work 2026', sortOrder: 0, year: 2026 }],
    lines: [
      {
        id: 'i',
        scenarioId: 'sc',
        kind: 'income',
        name: 'Salary',
        cadence: 'recurring',
        yearlyAmount: 100_000,
      },
    ],
    draws: [],
  },
  savings: {
    version: 1,
    accounts: [
      {
        id: 'cash',
        name: 'Cash',
        role: 'cash',
        actuals: { '2026-01': 5_000 },
        contribution: 0,
        cadence: 'monthly',
        annualRatePercent: 0,
        sortOrder: 0,
      },
    ],
  },
  overview: {
    version: 2,
    selectedScenarioId: 'ov',
    scenarios: [
      {
        id: 'ov',
        name: 'Base',
        sortOrder: 0,
        startYear: 2026,
        endYear: 2040,
        series: [
          {
            id: 'l',
            name: 'Leftover cash',
            enabled: true,
            sortOrder: 0,
            type: 'incomeLeftover',
            contributeUntilYear: 2035,
          },
        ],
        runway: {
          periods: [
            {
              startYear: 2063,
              mode: 'ic-keep',
              incomeCostScenarioId: 'sc',
              manualIncomeChf: 0,
              drawMode: 'percent',
              drawPercent: 100,
              drawFixedChf: 0,
            },
          ],
        },
      },
    ],
  },
  goals: [{ id: 'g', name: 'FI', amountChf: 2_000_000, year: 2040 }],
  annotations: [{ id: 'n', year: 2028, label: 'House, "maybe"' }],
})

describe('tableExport', () => {
  it('names the file from the export date', () => {
    expect(tableExportFileName('2026-08-15T12:00:00.000Z')).toBe(
      'financial-model-tables-2026-08-15.xlsx',
    )
  })

  it('builds sheets for I/C, savings, leftover, runway, and notes', () => {
    const sheets = buildTableExportSheets(sample)
    const byName = new Map(sheets.map((s) => [s.name, s]))

    expect(byName.get('I-C lines')?.rows[0]).toEqual([
      'Work 2026',
      'income',
      'Salary',
      'recurring',
      100_000,
      '',
      '',
    ])
    expect(byName.get('Savings actuals')?.rows[0]).toEqual(['Cash', '2026-01', 5_000])
    expect(byName.get('Overview series')?.rows[0]?.slice(0, 4)).toEqual([
      'Base',
      'Leftover cash',
      'incomeLeftover',
      true,
    ])
    expect(byName.get('Overview series')?.rows[0]?.[7]).toBe(2035)
    expect(byName.get('Runway')?.rows[0]?.slice(0, 4)).toEqual([
      'Base',
      2063,
      'ic-keep',
      'Work 2026',
    ])
    expect(byName.get('Goals')?.rows[0]).toEqual(['FI', 2040, 2_000_000])
    expect(byName.get('Notes')?.rows[0]).toEqual([2028, '', 'House, "maybe"'])
  })

  it('writes a zip-based xlsx that contains the sheet values', () => {
    const bytes = buildTableExportXlsx(sample)
    expect(bytes[0]).toBe(0x50) // P
    expect(bytes[1]).toBe(0x4b) // K
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('I-C lines')
    expect(text).toContain('Salary')
    expect(text).toContain('100000')
    expect(text).toContain('House, &quot;maybe&quot;')
  })
})
