import logoSrc from "../assets/gridcrow-logo.png";
import { HowTo } from "./HowTo";

// Small four-point sparkle used in the divider row beside the How-To button.
function Sparkle() {
  return (
    <svg className="header__sparkle" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 0c.9 6.800 5.200 11.100 12 12-6.800.9-11.100 5.200-12 12-.9-6.800-5.200-11.100-12-12C6.800 11.100 11.100 6.800 12 0Z" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="header">
      <h1 className="brand">
        <img
          className="brand__logo"
          src={logoSrc}
          alt="GridCrow — Turn pictures into tapestry crochet grids"
          width="1600"
          height="581"
        />
      </h1>
      <div className="header__bar">
        <span className="header__rule header__rule--left" aria-hidden="true">
          <Sparkle />
        </span>
        <HowTo />
        <span className="header__rule header__rule--right" aria-hidden="true">
          <Sparkle />
        </span>
      </div>
    </header>
  );
}
