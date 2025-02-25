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

      <div>
        To enable the Z-Wave JS Playground, click here.
        <br />
        <span style={{ fontWeight: "normal", fontSize: "85%" }}>
          Note that this will download about 30 megabytes of data.
        </span>
      </div>
    </button>
  );
};
