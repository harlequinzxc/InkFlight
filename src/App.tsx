import { useCallback, useEffect, useRef, useState } from 'react';
import Interlude from './components/Interlude';
import Landing from './views/Landing';
import Search, { type CheckState } from './views/Search';
import Editor from './views/Editor';
import { ApiFailure, fetchCabins, fetchMenu } from './lib/api';
import { normalizeFlight, prettyDate, todayISO } from './lib/flight';
import { buildDoc, migrateDoc } from './lib/normalize';
import { CABIN_ORDER, type CabinCode, type CabinOption, type LayoutKind, type MenuDoc, type PaperSize, type SectorOption } from './lib/types';

type View = 'landing' | 'search' | 'editor';

interface Prefs {
  layout: LayoutKind;
  size: PaperSize;
  fontScale: number;
  /** thermal-print mode: render the sheet in greyscale (default ON) */
  greyscale: boolean;
}

const PREFS_KEY = 'inkflight.prefs';
const DOC_KEY = 'inkflight.doc';

const DEFAULT_PREFS: Prefs = { layout: 'elegant', size: 'A4', fontScale: 1, greyscale: true };

function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / private mode — non-fatal */
  }
}

/** Stored docs may be a legacy single MenuDoc or a MenuDoc[]. */
function loadDocs(): MenuDoc[] {
  const raw = loadJSON<MenuDoc | MenuDoc[]>(DOC_KEY);
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(migrateDoc);
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const [view, setView] = useState<View>('landing');
  const [interlude, setInterlude] = useState(false);

  // ---- search state (preserved across back-navigation) ----
  const initialQuery = useRef(new URLSearchParams(window.location.search));
  const [flightInput, setFlightInput] = useState(() => initialQuery.current.get('flight') ?? '');
  const [dateISO, setDateISO] = useState<string | null>(() => {
    const d = initialQuery.current.get('date');
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  });
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [cabinOptions, setCabinOptions] = useState<CabinOption[]>([]);
  const [selectedCabins, setSelectedCabins] = useState<CabinCode[]>([]);
  const [availableSectors, setAvailableSectors] = useState<SectorOption[] | null>(null);
  const [selectedSectors, setSelectedSectors] = useState<number[]>([]);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [apiMode, setApiMode] = useState<'mock' | 'live' | null>(null);

  // ---- editor state ----
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...loadJSON<Partial<Prefs>>(PREFS_KEY) }));
  const [docs, setDocs] = useState<MenuDoc[]>(() => loadDocs());
  const [resume, setResume] = useState<boolean>(() => loadDocs().length > 0);

  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const menuCacheRef = useRef(new Map<string, unknown>());
  const fetchTokenRef = useRef(0);
  const checkAbortRef = useRef<AbortController | null>(null);

  // ---------- history integration (hardware back works, state preserved) ----------
  const navigate = useCallback((v: View, push = true, url?: string): void => {
    setView(v);
    if (push) window.history.pushState({ view: v }, '', url);
  }, []);

  useEffect(() => {
    window.history.replaceState({ view: 'landing' }, '');
    const onPop = (e: PopStateEvent): void => {
      const v = (e.state as { view?: View } | null)?.view ?? 'landing';
      setView(v);
      setInterlude(false);
      setFetching(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ---------- persistence ----------
  useEffect(() => saveJSON(PREFS_KEY, prefs), [prefs]);
  useEffect(() => {
    if (docs.length > 0) {
      saveJSON(DOC_KEY, docs);
      setResume(true);
    }
  }, [docs]);

  // ---------- toast ----------
  const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok'): void => {
    setToast({ msg, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3600);
  }, []);

  // ---------- cabin check (Gate 2) — auto after flight + date ----------
  const resetResults = useCallback((): void => {
    setCheckState('idle');
    setError(null);
    setCabinOptions([]);
    setSelectedCabins([]);
    setAvailableSectors(null);
    setSelectedSectors([]);
    setStaleNotice(false);
  }, []);

  const runCheck = useCallback((flight: string, date: string, token: number, signal: AbortSignal): void => {
    setCheckState('checking');
    setError(null);
    setStaleNotice(false);
    setCabinOptions([]);
    setSelectedCabins([]);
    fetchCabins(flight, date, signal)
      .then(({ data, stale, mode }) => {
        if (token !== fetchTokenRef.current) return;
        setApiMode(mode);
        setCabinOptions(data.cabins);
        setCheckState('ok');
        setStaleNotice(stale);
        // Sectors are discovered LIVE from the flight's legs[] (server-side) —
        // any current or future multi-sector service is picked up automatically.
        // Nothing is pre-selected; the picker reveals once a cabin is chosen.
        if (data.sectors && data.sectors.length > 1) {
          setAvailableSectors(data.sectors);
        } else {
          setAvailableSectors(null);
        }
        setSelectedSectors([]);
      })
      .catch((err: unknown) => {
        if (token !== fetchTokenRef.current) return;
        if (err instanceof DOMException && err.name === 'AbortError') return; // superseded
        setCheckState('error');
        setError(
          err instanceof ApiFailure
            ? { code: err.code, message: err.message }
            : { code: 'UPSTREAM_HTTP', message: 'Something went wrong. Try again.' }
        );
      });
  }, []);

  const launchCheck = useCallback(
    (flight: string, date: string): void => {
      checkAbortRef.current?.abort();
      const ctrl = new AbortController();
      checkAbortRef.current = ctrl;
      const token = ++fetchTokenRef.current;
      runCheck(flight, date, token, ctrl.signal);
    },
    [runCheck]
  );

  const triggerCheck = useCallback(
    (flight: string, date: string): void => {
      const gate = normalizeFlight(flight);
      if (!gate.ok || !date || checkState === 'checking' || fetching) return;
      launchCheck(gate.value, date);
    },
    [checkState, fetching, launchCheck]
  );

  const pickDate = useCallback(
    (iso: string): void => {
      setDateISO(iso);
      // results are per flight+date pair — any change discards them instantly;
      // if the flight is already valid, check the NEW date automatically.
      // (Booking-window validation lives server-side: today → +6 weeks.)
      const gate = normalizeFlight(flightInput);
      resetResults();
      if (!gate.ok) return;
      launchCheck(gate.value, iso);
    },
    [flightInput, launchCheck, resetResults]
  );

  const checkTimerRef = useRef<number | undefined>(undefined);

  const onFlightInput = useCallback(
    (v: string): void => {
      setFlightInput(v);
      resetResults();
      window.clearTimeout(checkTimerRef.current);
      // if a date is already chosen, re-check automatically — debounced,
      // never per keystroke
      const gate = normalizeFlight(v);
      if (gate.ok && dateISO) {
        const date = dateISO;
        checkTimerRef.current = window.setTimeout(() => launchCheck(gate.value, date), 650);
      }
    },
    [dateISO, launchCheck, resetResults]
  );

  /** Enter key / Retry — bypasses the debounce. */
  const submitCheck = useCallback((): void => {
    const gate = normalizeFlight(flightInput);
    if (!gate.ok || !dateISO || checkState === 'checking' || fetching) return;
    triggerCheck(gate.value, dateISO);
  }, [flightInput, dateISO, checkState, fetching, triggerCheck]);

  const toggleCabin = useCallback((c: CabinCode): void => {
    setSelectedCabins((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : CABIN_ORDER.filter((x) => prev.includes(x) || x === c)));
  }, []);

  const toggleSector = useCallback((seq: number): void => {
    setSelectedSectors((prev) => (prev.includes(seq) ? prev.filter((x) => x !== seq) : prev.includes(seq) ? prev : [...prev, seq].sort((a, b) => a - b)));
  }, []);

  // ---------- fetch menus (Gate 3) + interlude ----------
  const startFetch = useCallback(async (): Promise<void> => {
    const gate = normalizeFlight(flightInput);
    if (!gate.ok || !dateISO || selectedCabins.length === 0 || fetching) return;
    const plan = availableSectors;
    const sectorMode = plan !== null && plan.length > 1 && selectedSectors.length > 0;
    if (sectorMode && selectedSectors.length === 0) return;
    setFetching(true);
    setInterlude(true);
    setError(null);

    const work = (async (): Promise<MenuDoc[]> => {
      const settled = await Promise.allSettled(
        selectedCabins.map(async (cabin) => {
          const key = `SQ${gate.value}:${dateISO}:${cabin}`;
          const hit = menuCacheRef.current.get(key);
          if (hit) return { cabin, payload: hit, stale: false };
          const { data, stale } = await fetchMenu(gate.value, dateISO, cabin);
          menuCacheRef.current.set(key, data);
          return { cabin, payload: data, stale };
        })
      );

      const fulfilled = settled.filter((s): s is PromiseFulfilledResult<{ cabin: CabinCode; payload: unknown; stale: boolean }> => s.status === 'fulfilled');
      if (fulfilled.length === 0) {
        const first = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
        throw first?.reason instanceof ApiFailure ? first.reason : new ApiFailure({ code: 'UPSTREAM_HTTP', message: 'Could not fetch the menu. Try again.' });
      }
      if (fulfilled.length < settled.length) {
        showToast('Some cabins were unavailable — the others were compiled.');
      }
      if (fulfilled.some((s) => s.value.stale)) {
        showToast('Served from an offline copy — may be outdated.');
      }

      const rawByCabin = fulfilled.map((s) => ({ cabin: s.value.cabin, payload: s.value.payload }));

      if (!sectorMode) return [buildDoc({ flightNumber: gate.value, flightDate: dateISO }, rawByCabin)];

      // one sheet per selected sector — each shows every selected cabin
      const sheets: MenuDoc[] = [];
      const missing: string[] = [];
      for (const seq of selectedSectors) {
        const sheet = buildDoc({ flightNumber: gate.value, flightDate: dateISO }, rawByCabin, seq - 1);
        if (sheet.cabins.length === 0) {
          missing.push(plan![seq - 1]?.label ?? `Sector ${seq}`);
          continue;
        }
        sheets.push(sheet);
      }
      if (missing.length > 0) {
        showToast(`Not in today's menu data: ${missing.join(', ')} — those sectors were skipped.`);
      }
      if (sheets.length === 0) {
        throw new ApiFailure({ code: 'NO_CABINS', message: 'The menu service returned no sectors for that flight and date. Try again closer to departure.' });
      }
      return sheets;
    })();

    let built: MenuDoc[] | null = null;
    let failure: unknown = null;
    try {
      built = await work;
    } catch (err) {
      failure = err;
    }

    // the interlude copy is meant to be readable — hold it ≥3.2 s regardless
    await delay(3200);
    setInterlude(false);
    setFetching(false);

    if (failure !== null || built === null || built.length === 0) {
      setCheckState('error');
      setError(
        failure instanceof ApiFailure
          ? { code: failure.code, message: failure.message }
          : { code: 'UPSTREAM_HTTP', message: 'Could not fetch the menu. Try again.' }
      );
      return;
    }
    setDocs(built);
    const params = new URLSearchParams({
      flight: gate.value,
      date: dateISO,
      cabin: selectedCabins.join(','),
      ...(sectorMode ? { sector: selectedSectors.join(',') } : {})
    });
    navigate('editor', true, `?${params.toString()}`);
  }, [flightInput, dateISO, selectedCabins, selectedSectors, availableSectors, fetching, navigate, showToast]);

  // ---------- doc editing ----------
  const onSheetsChange = useCallback((next: MenuDoc[]): void => {
    setDocs(next);
  }, []);

  const goBackFromEditor = useCallback((): void => {
    if (window.history.state?.view === 'editor') window.history.back();
    else navigate('search', false);
  }, [navigate]);

  const proceedFromLanding = useCallback((): void => {
    navigate('search');
  }, [navigate]);

  const resumeLast = useCallback((): void => {
    const saved = loadDocs();
    if (saved.length > 0) {
      setDocs(saved);
      navigate('editor');
    } else {
      setResume(false);
    }
  }, [navigate]);

  return (
    <div className="app-shell">
      {view === 'landing' && (
        <Landing
          onProceed={proceedFromLanding}
          resume={
            resume && docs.length > 0
              ? { label: `${docs[0].flightLabel} · ${docs[0].dateLabel}${docs.length > 1 ? ` · ${docs.length} sheets` : ''}` }
              : null
          }
          onResume={resumeLast}
        />
      )}

      {view === 'search' && (
        <Search
          flightInput={flightInput}
          onFlightInput={onFlightInput}
          dateISO={dateISO}
          onPickDate={pickDate}
          checkState={checkState}
          cabinOptions={cabinOptions}
          selectedCabins={selectedCabins}
          onToggleCabin={toggleCabin}
          availableSectors={availableSectors}
          selectedSectors={selectedSectors}
          onToggleSector={toggleSector}
          error={error}
          staleNotice={staleNotice}
          onSubmitCheck={submitCheck}
          apiMode={apiMode}
          fetching={fetching}
          onFetch={() => void startFetch()}
          onBack={() => (window.history.state?.view === 'search' ? window.history.back() : navigate('landing', false))}
        />
      )}

      {view === 'editor' && docs.length > 0 && (
        <Editor
          sheets={docs}
          onSheetsChange={onSheetsChange}
          layout={prefs.layout}
          size={prefs.size}
          fontScale={prefs.fontScale}
          greyscale={prefs.greyscale}
          onLayout={(l) => setPrefs((p) => ({ ...p, layout: l }))}
          onSize={(s) => setPrefs((p) => ({ ...p, size: s }))}
          onFontScale={(f) => setPrefs((p) => ({ ...p, fontScale: f }))}
          onGreyscale={(g) => setPrefs((p) => ({ ...p, greyscale: g }))}
          onBack={goBackFromEditor}
          onToast={showToast}
        />
      )}

      <Interlude active={interlude} />

      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          {toast.msg}
        </div>
      )}
    </div>
  );
}
