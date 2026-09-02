import { useCallback, useEffect, useRef, useState } from 'react';
import Interlude from './components/Interlude';
import Landing from './views/Landing';
import Search, { type CheckState } from './views/Search';
import Editor from './views/Editor';
import { ApiFailure, fetchCabins, fetchMenu } from './lib/api';
import { normalizeFlight } from './lib/flight';
import { buildDoc } from './lib/normalize';
import { CABIN_ORDER, type CabinCode, type LayoutKind, type MenuDoc, type PaperSize } from './lib/types';

type View = 'landing' | 'search' | 'editor';

interface Prefs {
  layout: LayoutKind;
  size: PaperSize;
  fontScale: number;
}

const PREFS_KEY = 'inkflight.prefs';
const SEARCH_KEY = 'inkflight.search';
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
  const [flightInput, setFlightInput] = useState('');
  const [dateISO, setDateISO] = useState<string | null>(null);
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [availableCabins, setAvailableCabins] = useState<CabinCode[]>([]);
  const [selectedCabins, setSelectedCabins] = useState<CabinCode[]>([]);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [staleNotice, setStaleNotice] = useState(false);

  // ---- editor state ----
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULT_PREFS, ...loadJSON<Partial<Prefs>>(PREFS_KEY) }));
  const [doc, setDoc] = useState<MenuDoc | null>(() => loadJSON<MenuDoc>(DOC_KEY));
  const [resume, setResume] = useState<boolean>(() => loadJSON<MenuDoc>(DOC_KEY) !== null);

  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const menuCacheRef = useRef(new Map<string, unknown>());
  const fetchTokenRef = useRef(0);

  // ---------- history integration (hardware back works, state preserved) ----------
  const navigate = useCallback((v: View, push = true): void => {
    setView(v);
    if (push) window.history.pushState({ view: v }, '');
  }, []);

  useEffect(() => {
    window.history.replaceState({ view: 'landing' }, '');
    const onPop = (e: PopStateEvent): void => {
      const v = (e.state as { view?: View } | null)?.view ?? 'landing';
      setView(v);
      setInterlude(false);
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

  // ---------- cabin existence check (Gate 2) ----------
  const runCheck = useCallback(
    async (flight: string, date: string, token: number): Promise<void> => {
      setCheckState('checking');
      setError(null);
      setStaleNotice(false);
      setAvailableCabins([]);
      setSelectedCabins([]);
      try {
        const { data, stale } = await fetchCabins(flight, date);
        if (token !== fetchTokenRef.current) return;
        const cabins = CABIN_ORDER.filter((c) => data.cabinClasses.includes(c));
        // keep any extra unknown codes rather than dropping them
        const extras = data.cabinClasses.filter((c) => !CABIN_ORDER.includes(c as CabinCode)) as CabinCode[];
        setAvailableCabins([...cabins, ...extras]);
        setCheckState('ok');
        setStaleNotice(stale);
      } catch (err) {
        if (token !== fetchTokenRef.current) return;
        setCheckState('error');
        setError(err instanceof ApiFailure ? { code: err.code, message: err.message } : { code: 'UPSTREAM_HTTP', message: 'Something went wrong. Try again.' });
      }
    },
    []
  );

  const pickDate = useCallback(
    (iso: string): void => {
      setDateISO(iso);
      const gate = normalizeFlight(flightInput);
      if (!gate.ok) return;
      const token = ++fetchTokenRef.current;
      void runCheck(gate.value, iso, token);
    },
    [flightInput, runCheck]
  );

  const retryCheck = useCallback((): void => {
    if (!dateISO) return;
    const gate = normalizeFlight(flightInput);
    if (!gate.ok) return;
    const token = ++fetchTokenRef.current;
    void runCheck(gate.value, dateISO, token);
  }, [dateISO, flightInput, runCheck]);

  const checkTimerRef = useRef<number | undefined>(undefined);

  const onFlightInput = useCallback(
    (v: string): void => {
      setFlightInput(v);
      // changing the flight invalidates any previous check
      setCheckState('idle');
      setError(null);
      setAvailableCabins([]);
      setSelectedCabins([]);
      setStaleNotice(false);
      // if a date is already chosen, re-verify automatically — debounced,
      // never per keystroke (polite-client rule)
      window.clearTimeout(checkTimerRef.current);
      const gate = normalizeFlight(v);
      if (gate.ok && dateISO) {
        const date = dateISO;
        checkTimerRef.current = window.setTimeout(() => {
          const token = ++fetchTokenRef.current;
          void runCheck(gate.value, date, token);
        }, 650);
      }
    },
    [dateISO, runCheck]
  );

  const toggleCabin = useCallback((c: CabinCode): void => {
    setSelectedCabins((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : CABIN_ORDER.filter((x) => prev.includes(x) || x === c)));
  }, []);

  // ---------- fetch menus (Gate 3) + interlude ----------
  const startFetch = useCallback(async (): Promise<void> => {
    const gate = normalizeFlight(flightInput);
    if (!gate.ok || !dateISO || selectedCabins.length === 0) return;
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
      const anyStale = fulfilled.some((s) => s.value.stale);
      if (anyStale) showToast('Served from an offline copy — may be outdated.');

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
    setView('editor');
    window.history.pushState({ view: 'editor' }, '');
  }, [flightInput, dateISO, selectedCabins, showToast]);

  // ---------- doc editing ----------
  const onDocChange = useCallback((next: MenuDoc): void => {
    setDoc(next);
  }, []);

  const goBackFromEditor = useCallback((): void => {
    // browser-back semantics: returns to search with all inputs intact
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
          availableCabins={availableCabins}
          selectedCabins={selectedCabins}
          onToggleCabin={toggleCabin}
          error={error}
          staleNotice={staleNotice}
          onRetryCheck={retryCheck}
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
