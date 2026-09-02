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
        <h1 className="landing-headline">
          Ditch the pen,
          <br />
          save the ink.
        </h1>
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
        <span>InkFlight is an independent tool — not affiliated with SQ.</span>
      </footer>
    </div>
  );
}
