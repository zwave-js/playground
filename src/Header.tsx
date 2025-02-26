import "./Header.css";
import Logo from "./assets/logo.svg?react";
import GithubLogo from "./assets/github.svg?react";

export const Header = () => {
  return (
    <header>
      <h1>
        <Logo height={72} width={undefined} /> <span>Playground</span>
      </h1>
      <a
        href="https://github.com/zwave-js/playground"
        target="_blank"
        title="View on GitHub"
        className="github-link"
      >
        <GithubLogo height={24} width={undefined} />
      </a>
    </header>
  );
};
