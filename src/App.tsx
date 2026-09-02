import { useCallback, useEffect, useRef, useState } from 'react';
import Interlude from './components/Interlude';
import Landing from './views/Landing';
import Search, { type CheckState } from './views/Search';
import Editor from './views/Editor';
import { ApiFailure, fetchCabins, fetchMenu } from './lib/api';
import { addDaysISO, daysBetweenISO, normalizeFlight, prettyDate, todayISO } from './lib/flight';
import { buildDoc } from './lib/normalize';
import { CABIN_ORDER, type CabinCode, type CabinOption, type LayoutKind, type MenuDoc, type PaperSize } from './lib/types';

type View = 'landing' | 'search' | 'editor';

interface Prefs {
  layout: LayoutKind;
  size: PaperSize;
  fontScale: number;
}

const PREFS_KEY = 'inkflight.prefs';
const DOC_KEY = 'inkflight.doc';

const DEFAULT_PREFS: Prefs = { layout: 'elegant', size: 'A4', fontScale: 1 };

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
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [apiMode, setApiMode] = useState<'mock' | 'live' | null>(null);

  // ---- editor state ----
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...loadJSON<Partial<Prefs>>(PREFS_KEY) }));
  const [doc, setDoc] = useState<MenuDoc | null>(() => loadJSON<MenuDoc>(DOC_KEY));
  const [resume, setResume] = useState<boolean>(() => loadJSON<MenuDoc>(DOC_KEY) !== null);

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
    if (doc) {
      saveJSON(DOC_KEY, doc);
      setResume(true);
    }
  }, [doc]);

  // ---------- toast ----------
  const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok'): void => {
    setToast({ msg, kind });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // ---------- cabin check (Gate 2) — explicit submit only ----------
  const discardCheck = useCallback((): void => {
    checkAbortRef.current?.abort();
    setCheckState('idle');
    setError(null);
    setCabinOptions([]);
    setSelectedCabins([]);
    setStaleNotice(false);
  }, []);

  const runCheck = useCallback(async (flight: string, date: string, token: number, signal: AbortSignal): Promise<void> => {
    setCheckState('checking');
    setError(null);
    setStaleNotice(false);
    setCabinOptions([]);
    setSelectedCabins([]);
    try {
      const { data, stale, mode } = await fetchCabins(flight, date, signal);
      if (token !== fetchTokenRef.current) return;
      setApiMode(mode);
      setCabinOptions(data.cabins);
      setCheckState('ok');
      setStaleNotice(stale);
    } catch (err) {
      if (token !== fetchTokenRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') return; // superseded — ignore stale response
      setCheckState('error');
      setError(err instanceof ApiFailure ? { code: err.code, message: err.message } : { code: 'UPSTREAM_HTTP', message: 'Something went wrong. Try again.' });
    }
  }, []);

  const windowErrorFor = useCallback((date: string): { code: string; message: string } => {
    return {
      code: 'BAD_DATE',
      message: `${prettyDate(date)} is outside the menu window. Menus publish from today up to 8 days before departure — pick a date between ${prettyDate(todayISO())} and ${prettyDate(addDaysISO(todayISO(), 8))}.`
    };
  }, []);

  const outOfWindow = useCallback((date: string): boolean => {
    const shift = daysBetweenISO(todayISO(), date);
    return shift < 0 || shift > 8;
  }, []);

  /** Gate 1 + window offline, then ONE network call. Triggered automatically
   *  as soon as both inputs are valid — no submit button. */
  const triggerCheck = useCallback(
    (flight: string, date: string): void => {
      const gate = normalizeFlight(flight);
      if (!gate.ok || !date || checkState === 'checking' || fetching) return;
      if (outOfWindow(date)) {
        checkAbortRef.current?.abort();
        setCheckState('error');
        setError(windowErrorFor(date));
        return;
      }
      checkAbortRef.current?.abort();
      const ctrl = new AbortController();
      checkAbortRef.current = ctrl;
      const token = ++fetchTokenRef.current;
      void runCheck(gate.value, date, token, ctrl.signal);
    },
    [checkState, fetching, outOfWindow, runCheck, windowErrorFor]
  );

  /** Enter key / Retry — bypasses the debounce. */
  const submitCheck = useCallback((): void => {
    const gate = normalizeFlight(flightInput);
    if (!gate.ok || !dateISO || checkState === 'checking' || fetching) return;
    triggerCheck(gate.value, dateISO);
  }, [flightInput, dateISO, checkState, fetching, triggerCheck]);

  const pickDate = useCallback(
    (iso: string): void => {
      setDateISO(iso);
      // results are per flight+date pair — any change discards them instantly;
      // if the flight is already valid, check the NEW date automatically.
      const gate = normalizeFlight(flightInput);
      setCheckState('idle');
      setError(null);
      setCabinOptions([]);
      setSelectedCabins([]);
      setStaleNotice(false);
      if (!gate.ok) return;
      if (outOfWindow(iso)) {
        checkAbortRef.current?.abort();
        setCheckState('error');
        setError(windowErrorFor(iso));
        return;
      }
      checkAbortRef.current?.abort();
      const ctrl = new AbortController();
      checkAbortRef.current = ctrl;
      const token = ++fetchTokenRef.current;
      void runCheck(gate.value, iso, token, ctrl.signal);
    },
    [flightInput, outOfWindow, runCheck, windowErrorFor]
  );

  const checkTimerRef = useRef<number | undefined>(undefined);

  const onFlightInput = useCallback(
    (v: string): void => {
      setFlightInput(v);
      // results are per flight+date pair — discard instantly on change
      setCheckState('idle');
      setError(null);
      setCabinOptions([]);
      setSelectedCabins([]);
      setStaleNotice(false);
      window.clearTimeout(checkTimerRef.current);
      // if a date is already chosen, re-check automatically — debounced,
      // never per keystroke
      const gate = normalizeFlight(v);
      if (gate.ok && dateISO && !outOfWindow(dateISO)) {
        const date = dateISO;
        checkTimerRef.current = window.setTimeout(() => {
          checkAbortRef.current?.abort();
          const ctrl = new AbortController();
          checkAbortRef.current = ctrl;
          const token = ++fetchTokenRef.current;
          void runCheck(gate.value, date, token, ctrl.signal);
        }, 650);
      }
    },
    [dateISO, outOfWindow, runCheck]
  );

  const toggleCabin = useCallback((c: CabinCode): void => {
    setSelectedCabins((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : CABIN_ORDER.filter((x) => prev.includes(x) || x === c)));
  }, []);

  // ---------- fetch menus (Gate 3) + interlude ----------
  const startFetch = useCallback(async (): Promise<void> => {
    const gate = normalizeFlight(flightInput);
    if (!gate.ok || !dateISO || selectedCabins.length === 0 || fetching) return;
    setFetching(true);
    setInterlude(true);
    setError(null);

    const work = (async (): Promise<MenuDoc> => {
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
      return buildDoc({ flightNumber: gate.value, flightDate: dateISO }, rawByCabin);
    })();

    let built: MenuDoc | null = null;
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

    if (failure !== null || built === null) {
      setCheckState('error');
      setError(
        failure instanceof ApiFailure
          ? { code: failure.code, message: failure.message }
          : { code: 'UPSTREAM_HTTP', message: 'Could not fetch the menu. Try again.' }
      );
      return;
    }
    setDoc(built);
    const params = new URLSearchParams({ flight: gate.value, date: dateISO, cabin: selectedCabins.join(',') });
    navigate('editor', true, `?${params.toString()}`);
  }, [flightInput, dateISO, selectedCabins, fetching, navigate, showToast]);

  // ---------- doc editing ----------
  const onDocChange = useCallback((next: MenuDoc): void => {
    setDoc(next);
  }, []);

  const goBackFromEditor = useCallback((): void => {
    if (window.history.state?.view === 'editor') window.history.back();
    else navigate('search', false);
  }, [navigate]);

  const proceedFromLanding = useCallback((): void => {
    navigate('search');
  }, [navigate]);

  const resumeLast = useCallback((): void => {
    const saved = loadJSON<MenuDoc>(DOC_KEY);
    if (saved) {
      setDoc(saved);
      navigate('editor');
    } else {
      setResume(false);
    }
  }, [navigate]);

  return (
    <div className="app-shell">
      {view === 'landing' && (
        <Landing onProceed={proceedFromLanding} resume={resume && doc ? { label: `${doc.flightLabel} · ${doc.dateLabel}` } : null} onResume={resumeLast} />
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
          error={error}
          staleNotice={staleNotice}
          onSubmitCheck={submitCheck}
          apiMode={apiMode}
          fetching={fetching}
          onFetch={() => void startFetch()}
          onBack={() => (window.history.state?.view === 'search' ? window.history.back() : navigate('landing', false))}
        />
      )}

      {view === 'editor' && doc && (
        <Editor
          doc={doc}
          onDocChange={onDocChange}
          layout={prefs.layout}
          size={prefs.size}
          fontScale={prefs.fontScale}
          onLayout={(l) => setPrefs((p) => ({ ...p, layout: l }))}
          onSize={(s) => setPrefs((p) => ({ ...p, size: s }))}
          onFontScale={(f) => setPrefs((p) => ({ ...p, fontScale: f }))}
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
