import "./ConfirmLoad.css";
import logoUrl from "./assets/Z-Logo.png";

export const ConfirmLoad = () => {
  const handleClick = () => {
    localStorage.setItem("loadEmbedded", "true");
    window.location.reload();
  };
  return (
    <button id="confirm-load" onClick={handleClick}>
      <img
        src={logoUrl}
        alt="Z-Wave JS Logo"
        width={64}
        style={{ margin: "1.25em 0" }}
      />

      <div className="loader-text">
        <span>To enable the Z-Wave JS Playground, click here</span>
        <span>Note that this will download about 30 megabytes of data.</span>
        <span>Everything will be processed locally in your browser.</span>
      </div>
    </button>
  );
};
