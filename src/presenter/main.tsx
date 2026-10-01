import { createRoot } from "react-dom/client";
import { useEffect, useState, type FormEvent } from "react";
import { loadSubmissions, resetSubmissions, type SubmissionSnapshot } from "../ai/services/api";
import { money, title } from "../ai/components/ui";
import "../ai/styles.css";
import "../performance/styles.css";
import "./styles.css";

function App() {
  const [key, setKey] = useState(() => sessionStorage.getItem("cardekho-presenter-key") || "");
  const [draft, setDraft] = useState("");
  const [data, setData] = useState<SubmissionSnapshot | null>(null);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    if (!key) return;
    let active = true;
    async function refresh() {
      try {
        const next = await loadSubmissions(key);
        if (active) {
          setData(next);
          setError("");
          setUpdated(new Date().toLocaleTimeString());
        }
      } catch (cause) {
        if (active) {
          setData(null);
          setError(cause instanceof Error ? cause.message : "Could not load live submissions.");
        }
      }
    }
    void refresh();
    const timer = setInterval(refresh, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [key]);
  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    sessionStorage.setItem("cardekho-presenter-key", draft.trim());
    setKey(draft.trim());
    setDraft("");
  }
  function lock() {
    sessionStorage.removeItem("cardekho-presenter-key");
    setKey("");
    setData(null);
    setError("");
    setConfirmReset(false);
  }
  async function resetFeed() {
    if (!key || !confirmReset || resetting) return;
    setResetting(true);
    try {
      setData(await resetSubmissions(key));
      setError("");
      setUpdated(new Date().toLocaleTimeString());
      setConfirmReset(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reset submissions.");
    } finally {
      setResetting(false);
    }
  }
  return <main className="presenter-page">
    <header className="presenter-top"><a href="../performance/">CARDEKHO<span> AI</span></a><span>PRIVATE / PRESENTER VIEW</span></header>
    <section className="presenter-intro"><p className="performance-eyebrow">LIVE AUDIENCE EXPERIMENT</p><h1>THE ROOM.<br/><span>IN REAL TIME.</span></h1><p>Only estimates visitors explicitly share are counted. The dashboard refreshes every three seconds. No names, email addresses or contact details are collected.</p></section>
    {!key && <form className="presenter-unlock" onSubmit={unlock}><label htmlFor="presenter-key">PRESENTER KEY</label><input id="presenter-key" type="password" autoComplete="off" value={draft} onChange={event => setDraft(event.target.value)} required/><button type="submit">OPEN DASHBOARD ↗</button><p>Set the same key as CARDEKHO_PRESENTER_KEY on the Python backend. It stays in this browser tab session.</p></form>}
    {key && <><div className="presenter-status"><span>{error ? "CONNECTION PROBLEM" : "LIVE / REFRESHES EVERY 3 SECONDS"}</span><span>{updated && !error ? `LAST UPDATED ${updated}` : ""}</span><div className="presenter-actions"><button type="button" onClick={() => setConfirmReset(true)} disabled={!data?.total || resetting}>RESET SUBMISSIONS</button><button type="button" onClick={lock}>LOCK DASHBOARD</button></div></div>{confirmReset && <div className="presenter-reset-confirm" role="alertdialog" aria-labelledby="reset-title" aria-describedby="reset-description"><strong id="reset-title">Reset live submissions?</strong><p id="reset-description">This permanently deletes all {data?.total.toLocaleString("en-IN") || 0} shared estimates and starts the dashboard from zero. Model data and predictions are not affected.</p><div><button type="button" onClick={() => setConfirmReset(false)} disabled={resetting}>CANCEL</button><button type="button" className="presenter-reset-danger" onClick={resetFeed} disabled={resetting}>{resetting ? "RESETTING…" : "YES, DELETE SUBMISSIONS"}</button></div></div>}{error && <p role="alert" className="ai-error">{error}</p>}{data && <><section className="presenter-stats"><div><span>SHARED ESTIMATES</span><strong>{data.total.toLocaleString("en-IN")}</strong></div><div><span>AVERAGE ESTIMATE</span><strong>{data.average_price === null ? "—" : money(data.average_price)}</strong></div><div><span>LATEST ENTRIES SHOWN</span><strong>{data.latest.length}</strong></div></section><section className="presenter-feed"><div className="presenter-feed-head"><div><p className="performance-eyebrow">AUDIENCE SUBMISSIONS</p><h2>LATEST VALUATIONS</h2></div><span>NEWEST FIRST / UP TO 100</span></div>{data.latest.length ? <div className="presenter-table-scroll"><table><thead><tr><th>TIME</th><th>VEHICLE</th><th>YEAR</th><th>KM</th><th>MODEL</th><th>ESTIMATE</th></tr></thead><tbody>{data.latest.map((item, index) => <tr key={`${item.created_at}-${index}`}><td>{new Date(item.created_at).toLocaleTimeString()}</td><td>{title(item.vehicle_name)}</td><td>{item.year}</td><td>{Math.round(item.km_driven).toLocaleString("en-IN")}</td><td>{item.model}</td><td>{money(item.predicted_price)}</td></tr>)}</tbody></table></div> : <p className="presenter-empty">No one has shared an estimate yet. Keep this page open while visitors scan your QR code.</p>}</section></>}</>}
    <footer>ACADEMIC PRICE ESTIMATES / NOT VERIFIED TRANSACTION VALUES</footer>
  </main>;
}

createRoot(document.getElementById("presenter-root")!).render(<App />);
