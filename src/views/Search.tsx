import { useEffect, useMemo, useRef, useState } from 'react';
import DatePicker from '../components/DatePicker';
import { addDaysISO, daysBetweenISO, normalizeFlight, prettyDate, todayISO } from '../lib/flight';
import type { CabinCode, CabinOption } from '../lib/types';

export type CheckState = 'idle' | 'checking' | 'ok' | 'error';

interface SearchProps {
  flightInput: string;
  onFlightInput: (v: string) => void;
  dateISO: string | null;
  onPickDate: (iso: string) => void;
  checkState: CheckState;
  cabinOptions: CabinOption[];
  selectedCabins: CabinCode[];
  onToggleCabin: (c: CabinCode) => void;
  error: { code: string; message: string } | null;
  staleNotice: boolean;
  onSubmitCheck: () => void;
  fetching: boolean;
  onFetch: () => void;
  onBack: () => void;
}

const ERROR_TITLES: Record<string, string> = {
  NOT_FOUND: 'No flight found',
  BAD_DATE: 'That date is out of the menu window',
  NO_CABINS: 'No cabins open yet',
  UPSTREAM_TIMEOUT: 'The seat pocket didn’t answer',
  UPSTREAM_NETWORK: 'The seat pocket didn’t answer',
  UPSTREAM_HTTP: 'The seat pocket didn’t answer',
  RATE_LIMITED: 'Easy, tiger'
};

export default function Search(props: SearchProps) {
  const { flightInput, onFlightInput, dateISO, onPickDate, checkState, cabinOptions, selectedCabins, error, staleNotice, fetching } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const cabinsRef = useRef<HTMLDivElement>(null);

  const minISO = useMemo(() => todayISO(), []);
  const maxISO = useMemo(() => addDaysISO(minISO, 42), [minISO]); // browse up to 6 weeks ahead
  const windowEndISO = useMemo(() => addDaysISO(minISO, 8), [minISO]);

  const gate = normalizeFlight(flightInput);
  const gateValue = gate.ok ? gate.value : '';
  const showPills = gate.ok;
  const tomorrow = addDaysISO(minISO, 1);

  const dateShift = dateISO ? daysBetweenISO(minISO, dateISO) : null;
  const outOfWindow = dateShift !== null && (dateShift < 0 || dateShift > 8);
  const canCheck = gate.ok && dateISO !== null && !outOfWindow && checkState !== 'checking' && !fetching;
  const dateLabel = dateISO === minISO ? 'Today' : dateISO === tomorrow ? 'Tomorrow' : dateISO ? prettyDate(dateISO) : null;

  // auto-scroll the revealed picker into view (small screens)
  useEffect(() => {
    if (checkState === 'ok') cabinsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [checkState]);

  const onFlightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key !== 'Enter') return;
    if (!gate.ok) return;
    if (!dateISO) {
      document.querySelector<HTMLButtonElement>('.pill.today')?.classList.add('pulse');
      setTimeout(() => document.querySelector<HTMLButtonElement>('.pill.today')?.classList.remove('pulse'), 1200);
      return;
    }
    if (canCheck) props.onSubmitCheck();
  };

  const errorTitle = error ? ERROR_TITLES[error.code] ?? 'Something went wrong' : '';

  return (
    <div className="view search">
      <button type="button" className="backlink" onClick={props.onBack}>
        ‹ Home
      </button>

      <h1 className="search-title">Which flight are we dressing today?</h1>
      <p className="search-sub">Key in your flight number — we’ll pull the live menu from the seat pocket servers.</p>

      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          if (canCheck) props.onSubmitCheck();
        }}
      >
        <label className="field-label" htmlFor="flight">Flight number</label>
        <input
          id="flight"
          className={`flight-input${gate.ok ? ' valid' : ''}`}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="e.g. SQ 326 or 326"
          value={flightInput}
          aria-invalid={error !== null && checkState === 'error'}
          aria-describedby="flight-err"
          onChange={(e) => onFlightInput(e.target.value)}
          onKeyDown={onFlightKeyDown}
        />
        {flightInput.trim() !== '' && !gate.ok && (
          <div className="field-hint">Key in the digits — e.g. <strong>326</strong> or <strong>SQ326</strong>.</div>
        )}
        {gate.ok && <div className="field-ok">SQ {gate.value}</div>}

        {showPills && (
          <div className="pills-wrap">
            <div className="pills-label">Travel date</div>
            <div className="pills">
              <button type="button" className={`pill today${dateISO === minISO ? ' on' : ''}`} onClick={() => onPickDate(minISO)}>
                Today
              </button>
              <button type="button" className={`pill${dateISO === tomorrow ? ' on' : ''}`} onClick={() => onPickDate(tomorrow)}>
                Tomorrow
              </button>
              <button
                type="button"
                className={`pill pick${dateISO && dateISO !== minISO && dateISO !== tomorrow ? ` on${outOfWindow ? ' warn' : ''}` : ''}`}
                onClick={() => setPickerOpen(true)}
              >
                {dateLabel && dateISO && dateISO !== minISO && dateISO !== tomorrow ? dateLabel : 'Pick a date…'}
              </button>
            </div>
            {dateISO && outOfWindow ? (
              <div className="pills-note warn">
                {prettyDate(dateISO)} is beyond the 8-day menu window — you can still check, but the menu service won’t have it yet.
              </div>
            ) : (
              <div className="pills-note">
                Menus are published up to 8 days before departure — anything further out will show “no flight found”.
              </div>
            )}
          </div>
        )}

        {checkState !== 'ok' && (
          <div className="submitrow">
            <button type="submit" className="btn btn-primary btn-lg check-btn" disabled={!canCheck}>
              {checkState === 'checking' ? (
                <>
                  <span className="ring ring-sm" /> Checking cabins…
                </>
              ) : (
                'Check flight'
              )}
            </button>
          </div>
        )}
      </form>

      {checkState === 'error' && error && (
        <div className={`error-card${error.code === 'NOT_FOUND' || error.code === 'NO_CABINS' || error.code === 'BAD_DATE' ? '' : ' transient'}`} role="alert" id="flight-err">
          <div className="error-title">{errorTitle}</div>
          <div className="error-msg">
            {error.code === 'NOT_FOUND' ? (
              <>
                <strong>SQ {gateValue}</strong> on <strong>{dateISO ? prettyDate(dateISO) : ''}</strong> isn’t in the menu system. Menus appear from
                today up to 8 days before departure — try a date closer to today.
              </>
            ) : (
              error.message
            )}
          </div>
          <div className="error-code">ref: {error.code}</div>
          <button type="button" className="btn btn-ghost" onClick={props.onSubmitCheck}>
            {error.code === 'NOT_FOUND' ? 'Try again' : 'Retry'}
          </button>
        </div>
      )}

      {staleNotice && checkState === 'ok' && <div className="stale-ribbon">Served from an offline copy — may be outdated.</div>}

      <div ref={cabinsRef}>
        {checkState === 'ok' && (
          <div className="cabins-wrap">
            <div className="pills-label" aria-live="polite">
              Cabins available on <strong>SQ {gateValue}</strong> · {dateISO ? prettyDate(dateISO) : ''}
              {cabinOptions.length > 1 ? ' — pick all that apply' : ''}
            </div>
            <div className="cabin-cards">
              {cabinOptions.map((c, i) => {
                const on = selectedCabins.includes(c.code);
                return (
                  <button
                    type="button"
                    key={c.code}
                    className={`cabin-card card-in${on ? ' on' : ''}${fetching ? ' busy' : ''}`}
                    style={{ animationDelay: `${i * 70}ms` }}
                    onClick={() => props.onToggleCabin(c.code)}
                    disabled={fetching}
                    aria-pressed={on}
                  >
                    <span className="card-code">{c.code}</span>
                    <span className="card-short">{c.short}</span>
                    <span className="card-sub">{on ? '✓ On the sheet' : 'View menu'}</span>
                    <span className="card-tick">{on ? '✓' : ''}</span>
                  </button>
                );
              })}
            </div>
            {selectedCabins.length > 0 && (
              <div className="fetch-wrap">
                <button type="button" className="btn btn-primary btn-lg fetch-btn" disabled={fetching} onClick={props.onFetch}>
                  {fetching ? (
                    <>
                      <span className="ring ring-sm ring-dark" /> Preparing…
                    </>
                  ) : (
                    <>Fetch menu{selectedCabins.length > 1 ? ` · ${selectedCabins.length} cabins` : ''}</>
                  )}
                </button>
                <div className="fetch-note">All selected cabins will be compiled onto one menu sheet.</div>
              </div>
            )}
          </div>
        )}
      </div>

      {pickerOpen && (
        <DatePicker
          minISO={minISO}
          maxISO={maxISO}
          menuWindowEndISO={windowEndISO}
          value={dateISO}
          onPick={(iso) => {
            setPickerOpen(false);
            onPickDate(iso);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
