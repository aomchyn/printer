import { describe, expect, it } from 'vitest';
import { resolveSelectedPeakDay, type PeakDayData } from './PeakTimeExplorer';

const days: PeakDayData[] = [
    {
        key: '2026-08-18',
        date: '18/08/2569',
        orders: 3,
        quantity: 300,
        peakHour: '09:00',
        peakOrders: 2,
        hourlyData: [],
    },
    {
        key: '2026-08-29',
        date: '29/08/2569',
        orders: 5,
        quantity: 500,
        peakHour: '14:00',
        peakOrders: 3,
        hourlyData: [],
    },
];

describe('resolveSelectedPeakDay', () => {
    it('selects the latest available day by default', () => {
        expect(resolveSelectedPeakDay(days, null)?.key).toBe('2026-08-29');
    });

    it('uses the day selected by the user', () => {
        expect(resolveSelectedPeakDay(days, '2026-08-18')?.key).toBe('2026-08-18');
    });

    it('keeps an existing selection when the dataset changes', () => {
        const updatedDays = [days[0], { ...days[1], orders: 7 }];

        expect(resolveSelectedPeakDay(updatedDays, '2026-08-18')?.key).toBe('2026-08-18');
    });

    it('falls back to the latest day when the selected day disappears', () => {
        expect(resolveSelectedPeakDay([days[1]], '2026-08-18')?.key).toBe('2026-08-29');
    });

    it('returns null for an empty dataset', () => {
        expect(resolveSelectedPeakDay([], '2026-08-18')).toBeNull();
    });
});
