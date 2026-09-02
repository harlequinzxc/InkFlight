import { useEffect, useMemo, useRef, useState } from 'react';
import DatePicker from '../components/DatePicker';
import { addDaysISO, normalizeFlight, prettyDate, todayISO } from '../lib/flight';
import type { CabinCode, CabinOption, SectorOption } from '../lib/types';

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
  availableSectors: SectorOption[] | null;
  selectedSectors: number[];
  onToggleSector: (seq: number) => void;
  error: { code: string; message: string } | null;
  staleNotice: boolean;
  onSubmitCheck: () => void;
  apiMode: 'mock' | 'live' | null;
  fetching: boolean;
  onFetch: () => void;
  onBack: () => void;
}

const ERROR_TITLES: Record<string, string> = {
  NOT_FOUND: 'No flight found',
  BAD_DATE: 'That date is out of the booking window',
  NO_CABINS: 'No cabins open yet',
  UPSTREAM_TIMEOUT: 'The seat pocket didn’t answer',
  UPSTREAM_NETWORK: 'The seat pocket didn’t answer',
  UPSTREAM_HTTP: 'The seat pocket didn’t answer',
  RATE_LIMITED: 'Easy, tiger'
};

export default function Search(props: SearchProps) {
  const {
    flightInput, onFlightInput, dateISO, onPickDate, checkState,
    cabinOptions, selectedCabins, availableSectors, selectedSectors,
    error, staleNotice, apiMode, fetching
  } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const cabinsRef = useRef<HTMLDivElement>(null);

  const minISO = useMemo(() => todayISO(), []);
  const maxISO = useMemo(() => addDaysISO(minISO, 42), [minISO]); // booking horizon: today → +6 weeks

  const gate = normalizeFlight(flightInput);
  const gateValue = gate.ok ? gate.value : '';
  const showPills = gate.ok;
  const tomorrow = addDaysISO(minISO, 1);

  const sectorMode = checkState === 'ok' && availableSectors !== null && availableSectors.length > 1;
  const showSectors = sectorMode && selectedCabins.length > 0; // sector step comes AFTER cabin selection
  const readyToFetch = selectedCabins.length > 0 && (!sectorMode || selectedSectors.length > 0);

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
    if (checkState === 'error' || checkState === 'idle') props.onSubmitCheck();
  };

  const errorTitle = error ? ERROR_TITLES[error.code] ?? 'Something went wrong' : '';

  return (
    <div className="view search">
      <button type="button" className="backlink" onClick={props.onBack}>
        ‹ Home
      </button>

      {apiMode === 'mock' && <div className="demo-ribbon">Preview mode — demo menus. Deployments pull live SQ data.</div>}

      <h1 className="search-title">Where are we flying today?</h1>

      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          if (checkState === 'error' || checkState === 'idle') props.onSubmitCheck();
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

        {showPills && (
          <div className="pills-wrap">
            <div className="pills-label">Departure date</div>
            <div className="pills">
              <button type="button" className={`pill today${dateISO === minISO ? ' on' : ''}`} onClick={() => onPickDate(minISO)}>
                Today
              </button>
              <button type="button" className={`pill${dateISO === tomorrow ? ' on' : ''}`} onClick={() => onPickDate(tomorrow)}>
                Tomorrow
              </button>
              <button
                type="button"
                className={`pill pick${dateISO && dateISO !== minISO && dateISO !== tomorrow ? ' on' : ''}`}
                onClick={() => setPickerOpen(true)}
              >
                {dateISO && dateISO !== minISO && dateISO !== tomorrow ? prettyDate(dateISO) : 'Pick a date…'}
              </button>
            </div>
          </div>
        )}

        {checkState === 'checking' && (
          <div className="checking" role="status" aria-live="polite">
            <span className="ring ring-sm" /> <span>Checking cabins…</span>
          </div>
        )}
      </form>

      {checkState === 'error' && error && (
        <div className={`error-card${error.code === 'NOT_FOUND' || error.code === 'NO_CABINS' || error.code === 'BAD_DATE' ? '' : ' transient'}`} role="alert" id="flight-err">
          <div className="error-title">{errorTitle}</div>
          <div className="error-msg">
            {error.code === 'NOT_FOUND' ? (
              <>
                <strong>SQ {gateValue}</strong> on <strong>{dateISO ? prettyDate(dateISO) : ''}</strong> isn’t in the menu system yet. Check the flight
                operates that day, or try again closer to departure.
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
            {/* STEP: sectors — only for multi-sector flights, only after a cabin is picked */}
            {showSectors && availableSectors && (
              <div className="sectors-wrap card-in">
                <div className="pills-label">Sectors available</div>
                <div className="cabin-cards">
                  {availableSectors.map((s, i) => {
                    const on = selectedSectors.includes(s.seq);
                    return (
                      <button
                        type="button"
                        key={s.seq}
                        className={`cabin-card card-in${on ? ' on' : ''}${fetching ? ' busy' : ''}`}
                        style={{ animationDelay: `${i * 70}ms` }}
                        onClick={() => props.onToggleSector(s.seq)}
                        disabled={fetching}
                        aria-pressed={on}
                      >
                        <span className="card-code">Sector {s.seq}</span>
                        <span className="card-short">{s.label}</span>
                        <span className="card-tick">{on ? '✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={showSectors ? 'cabins-after-sectors' : ''}>
              <div className="pills-label" aria-live="polite">
                Cabins available
              </div>
              <div className="cabin-cards">
                {cabinOptions.map((c, i) => {
                  const on = selectedCabins.includes(c.code);
                  return (
                    <button
                      type="button"
                      key={c.code}
                      className={`cabin-card card-in${on ? ' on' : ''}${fetching ? ' busy' : ''}`}
                      style={{ animationDelay: `${i * 70 + (showSectors ? 120 : 0)}ms` }}
                      onClick={() => props.onToggleCabin(c.code)}
                      disabled={fetching}
                      aria-pressed={on}
                    >
                      <span className="card-code">{c.code}</span>
                      <span className="card-short">{c.short}</span>
                      <span className="card-tick">{on ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {readyToFetch && (
              <div className="fetch-wrap">
                <button type="button" className="btn btn-primary btn-lg fetch-btn" disabled={fetching} onClick={props.onFetch}>
                  {fetching ? (
                    <>
                      <span className="ring ring-sm ring-dark" /> Preparing…
                    </>
                  ) : (
                    <>
                      Fetch menu
                      {showSectors && selectedSectors.length > 0 ? ` · ${selectedSectors.length} sector${selectedSectors.length > 1 ? 's' : ''}` : ''}
                      {selectedCabins.length > 1 ? ` · ${selectedCabins.length} cabins` : ''}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {pickerOpen && (
        <DatePicker
          minISO={minISO}
          maxISO={maxISO}
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
