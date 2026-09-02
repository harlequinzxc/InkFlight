import { useMemo, useState } from 'react';
import { dowShorts, monthName } from '../lib/flight';

interface DatePickerProps {
  minISO: string;
  maxISO: string;
  value: string | null;
  onPick: (iso: string) => void;
  onClose: () => void;
}

interface DayCell {
  iso: string;
  day: number;
  disabled: boolean;
}

export default function DatePicker({ minISO, maxISO, value, onPick, onClose }: DatePickerProps) {
  const [cursor, setCursor] = useState(() => {
    const base = value ?? minISO;
    return { y: Number(base.slice(0, 4)), m: Number(base.slice(5, 7)) - 1 };
  });

  const maxD = useMemo(() => ({ y: Number(maxISO.slice(0, 4)), m: Number(maxISO.slice(5, 7)) - 1 }), [maxISO]);

  const weeks = useMemo((): DayCell[][] => {
    const first = new Date(cursor.y, cursor.m, 1);
    const startPad = first.getDay(); // 0 = Sunday
    const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const cells: (DayCell | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ iso, day: d, disabled: iso < minISO || iso > maxISO });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: DayCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7).map((c) => c ?? ({ iso: '', day: 0, disabled: true } as DayCell)));
    }
    return rows;
  }, [cursor, minISO, maxISO]);

  const canPrev = cursor.y > Number(minISO.slice(0, 4)) || cursor.m > Number(minISO.slice(5, 7)) - 1;
  const canNext = cursor.y < maxD.y || cursor.m < maxD.m;

  const shiftMonth = (delta: number): void => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <>
      <div className="dp-backdrop" onClick={onClose} />
      <div className="dp-pop" role="dialog" aria-label="Choose a date">
        <div className="dp-head">
          <button type="button" className="dp-nav" disabled={!canPrev} onClick={() => shiftMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <div className="dp-title">
            {monthName(cursor.m)} {cursor.y}
          </div>
          <button type="button" className="dp-nav" disabled={!canNext} onClick={() => shiftMonth(1)} aria-label="Next month">
            ›
          </button>
        </div>
        <div className="dp-grid">
          {dowShorts().map((d, i) => (
            <div className="dp-dow" key={i}>{d}</div>
          ))}
          {weeks.flat().map((cell, i) =>
            cell.iso === '' ? (
              <div className="dp-cell empty" key={i} />
            ) : (
              <button
                type="button"
                key={i}
                disabled={cell.disabled}
                className={`dp-cell${cell.disabled ? ' disabled' : ''}${cell.iso === value ? ' selected' : ''}`}
                onClick={() => onPick(cell.iso)}
              >
                {cell.day}
              </button>
            )
          )}
        </div>
      </div>
    </>
  );
}
