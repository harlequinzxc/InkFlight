import { useMemo, useState } from 'react';
import DatePicker from '../components/DatePicker';
import { addDaysISO, normalizeFlight, prettyDate, todayISO } from '../lib/flight';
import { CABIN_LABELS, CABIN_ORDER, type CabinCode } from '../lib/types';

export type CheckState = 'idle' | 'checking' | 'ok' | 'error';

interface SearchProps {
  flightInput: string;
  onFlightInput: (v: string) => void;
  dateISO: string | null;
  onPickDate: (iso: string) => void;
  checkState: CheckState;
  availableCabins: CabinCode[];
  selectedCabins: CabinCode[];
  onToggleCabin: (c: CabinCode) => void;
  error: { code: string; message: string } | null;
  staleNotice: boolean;
  onRetryCheck: () => void;
  onFetch: () => void;
  onBack: () => void;
}

export default function Search(props: SearchProps) {
  const { flightInput, onFlightInput, dateISO, onPickDate, checkState, availableCabins, selectedCabins, error, staleNotice } = props;
  const [pickerOpen, setPickerOpen] = useState(false);

  const minISO = useMemo(() => todayISO(), []);
  const maxISO = useMemo(() => addDaysISO(minISO, 42), [minISO]); // 6 weeks ahead
  const windowEndISO = useMemo(() => addDaysISO(minISO, 8), [minISO]);

  const gate = normalizeFlight(flightInput);
  const showPills = gate.ok;
  const gateValue = gate.ok ? gate.value : '';
  const tomorrow = addDaysISO(minISO, 1);

  const activeDate = dateISO === minISO ? 'Today' : dateISO === tomorrow ? 'Tomorrow' : dateISO ? prettyDate(dateISO) : null;

  return (
    <div className="view search">
      <button type="button" className="backlink" onClick={props.onBack}>
        ‹ Home
      </button>

      <h1 className="search-title">Which flight are we dressing today?</h1>
      <p className="search-sub">Key in your flight number — we’ll pull the live menu from the seat pocket servers.</p>

      <div className="field">
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
          onChange={(e) => onFlightInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && gate.ok && !dateISO) {
              // nudge the user towards the date pills
              document.querySelector<HTMLButtonElement>('.pill.today')?.classList.add('pulse');
              setTimeout(() => document.querySelector<HTMLButtonElement>('.pill.today')?.classList.remove('pulse'), 1200);
            }
          }}
        />
        {flightInput.trim() !== '' && !gate.ok && (
          <div className="field-hint">Key in the digits — e.g. <strong>326</strong> or <strong>SQ326</strong>.</div>
        )}
        {gate.ok && (
          <div className="field-ok">SQ {gate.value}</div>
        )}
      </div>

      {showPills && (
        <div className="pills-wrap">
          <div className="pills-label">Travel date</div>
          <div className="pills">
            <button
              type="button"
              className={`pill today${dateISO === minISO ? ' on' : ''}`}
              onClick={() => onPickDate(minISO)}
            >
              Today
            </button>
            <button
              type="button"
              className={`pill${dateISO === tomorrow ? ' on' : ''}`}
              onClick={() => onPickDate(tomorrow)}
            >
              Tomorrow
            </button>
            <button
              type="button"
              className={`pill pick${dateISO && dateISO !== minISO && dateISO !== tomorrow ? ' on' : ''}`}
              onClick={() => setPickerOpen(true)}
            >
              {activeDate && dateISO && dateISO !== minISO && dateISO !== tomorrow ? activeDate : 'Pick a date…'}
            </button>
          </div>
          <div className="pills-note">
            Menus are published up to 8 days before departure — anything further out will show “no flight found”.
          </div>
        </div>
      )}

      {checkState === 'checking' && (
        <div className="checking" role="status">
          <span className="ring ring-sm" />
          <span>Checking cabins…</span>
        </div>
      )}

      {checkState === 'error' && error && (
        <div className={`error-card${error.code === 'NOT_FOUND' ? '' : ' transient'}`}>
          <div className="error-title">{error.code === 'NOT_FOUND' ? 'No flight found' : 'The seat pocket didn’t answer'}</div>
          <div className="error-msg">
            {error.code === 'NOT_FOUND' ? (
              <>
                <strong>SQ {gateValue}</strong> on{' '}
                <strong>{dateISO ? prettyDate(dateISO) : ''}</strong> isn’t in the menu system.
                Menus appear from today up to 8 days before departure — try a date closer to today.
              </>
            ) : (
              error.message
            )}
          </div>
          <button type="button" className="btn btn-ghost" onClick={props.onRetryCheck}>
            {error.code === 'NOT_FOUND' ? 'Try again' : 'Retry'}
          </button>
        </div>
      )}

      {staleNotice && checkState === 'ok' && (
        <div className="stale-ribbon">Served from an offline copy — may be outdated.</div>
      )}

      {checkState === 'ok' && (
        <div className="cabins-wrap">
          <div className="pills-label">Cabin class{availableCabins.length > 1 ? 'es operating — pick all that apply' : ' operating'}</div>
          <div className="chips">
            {CABIN_ORDER.filter((c) => availableCabins.includes(c)).map((c) => (
              <button
                type="button"
                key={c}
                className={`chip${selectedCabins.includes(c) ? ' on' : ''}`}
                onClick={() => props.onToggleCabin(c)}
                aria-pressed={selectedCabins.includes(c)}
              >
                <span className="chip-code">{c}</span>
                <span className="chip-name">{CABIN_LABELS[c]}</span>
                <span className="chip-tick">{selectedCabins.includes(c) ? '✓' : ''}</span>
              </button>
            ))}
          </div>
          {selectedCabins.length > 0 && (
            <div className="fetch-wrap">
              <button type="button" className="btn btn-primary btn-lg fetch-btn" onClick={props.onFetch}>
                Fetch menu{selectedCabins.length > 1 ? ` · ${selectedCabins.length} cabins` : ''}
              </button>
              <div className="fetch-note">All selected cabins will be compiled onto one menu sheet.</div>
            </div>
          )}
        </div>
      )}

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
