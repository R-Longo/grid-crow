import { FEEDBACK_URL } from "../config/links";

export function Footer() {
  return (
    <footer className="footer" data-testid="footer">
      <span>Your pictures and projects stay on your device.</span>
      {FEEDBACK_URL && (
        <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" data-testid="feedback-link">
          Share feedback
        </a>
      )}
    </footer>
  );
}
