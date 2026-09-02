import { PlaneGlyph } from '../components/Paper';

interface LandingProps {
  onProceed: () => void;
  resume?: { label: string } | null;
  onResume: () => void;
}

export default function Landing({ onProceed, resume, onResume }: LandingProps) {
  return (
    <div className="view landing">
      <div className="landing-frame" />
      <div className="landing-center">
        <PlaneGlyph className="landing-plane" />
        <div className="wordmark">INKFLIGHT</div>
        <div className="landing-tag">Inflight Menu Studio · for Singapore Airlines cabin crew</div>
        <h1 className="landing-headline">
          Ditch the pen,
          <br />
          save the ink.
        </h1>
        <p className="landing-sub">
          Pull the live inflight menu for your flight, tailor it in seconds, and print a beautiful
          galley sheet — no more hand-writing offerings before every sector.
        </p>
        <button type="button" className="btn btn-primary btn-lg landing-cta" onClick={onProceed}>
          Proceed
        </button>
        {resume ? (
          <button type="button" className="landing-resume" onClick={onResume}>
            ↻ Resume last menu — {resume.label}
          </button>
        ) : null}
      </div>
      <footer className="landing-foot">
        <span>Menu content © Singapore Airlines</span>
        <span>Unofficial, non-commercial crew tool — not affiliated with or endorsed by SIA</span>
      </footer>
    </div>
  );
}
