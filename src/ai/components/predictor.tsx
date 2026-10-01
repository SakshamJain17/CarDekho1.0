import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Download, LoaderCircle } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  heroImage,
  predictAll,
  predictPrice,
  predictSensitivity,
  shareValuation,
} from "../services/api";
import type {
  ModelPrediction,
  Prediction,
  Project,
  SensitivityPoint,
  Vehicle,
} from "../types";
import { Reveal, SectionHeader, money, title } from "./ui";

function defaults(project: Project, profile: Vehicle): Vehicle {
  return Object.fromEntries(
    project.fields.map((field) => [
      field.name,
      profile[field.name] ?? field.default ?? field.options?.[0],
    ]),
  );
}
function ModelSensitivity({
  project,
  result,
}: {
  project: Project;
  result: Prediction;
}) {
  const [feature, setFeature] = useState<"year" | "km_driven">("km_driven");
  const field = project.fields.find((item) => item.name === feature)!;
  const original = Number(result.inputs[feature]);
  const [value, setValue] = useState(
    Math.min(field.max, Math.max(field.min, original)),
  );
  const [points, setPoints] = useState<SensitivityPoint[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const year = new Date().getFullYear();
  useEffect(() => {
    setValue(
      Math.min(field.max, Math.max(field.min, Number(result.inputs[feature]))),
    );
  }, [feature, field.min, field.max, result]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPoints([]);
    const timer = setTimeout(() => {
      const radius = feature === "year" ? 3 : 25000;
      const lower = Math.max(field.min, value - radius),
        upper = Math.min(field.max, value + radius);
      const samples = [
        ...new Set([
          ...Array.from({ length: 7 }, (_, index) =>
            Math.round(lower + ((upper - lower) * index) / 6),
          ),
          value,
        ]),
      ]
        .filter((candidate) => candidate >= field.min && candidate <= field.max)
        .sort((a, b) => a - b);
      predictSensitivity(result.inputs, feature, samples, controller.signal)
        .then((response) => {
          if (!controller.signal.aborted) setPoints(response.points);
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setError(
              cause instanceof Error
                ? cause.message
                : "Sensitivity request failed.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [feature, value, field.min, field.max, result]);
  const current = points.find((point) => point.value === value);
  return (
    <section className="ai-sensitivity" aria-labelledby="ai-sensitivity-title">
      <div className="ai-sensitivity-heading">
        <span className="ai-eyebrow">
          10 / MODEL SENSITIVITY / REAL PYTHON CALLS
        </span>
        <h3 id="ai-sensitivity-title">
          CHANGE THE INPUT.
          <br />
          <span>WATCH THE VALUE MOVE.</span>
        </h3>
      </div>
      <div className="ai-sensitivity-controls">
        <label htmlFor="ai-sensitivity-feature">
          SPECIFICATION
          <select
            id="ai-sensitivity-feature"
            value={feature}
            onChange={(event) =>
              setFeature(event.target.value as typeof feature)
            }
          >
            <option value="km_driven">Kilometres driven</option>
            <option value="year">Car age (mapped to year)</option>
          </select>
        </label>
        <label htmlFor="ai-sensitivity-range">
          {feature === "year"
            ? `${year - value} YEARS / ${value} MODEL YEAR`
            : `${value.toLocaleString("en-IN")} KM`}
          <input
            id="ai-sensitivity-range"
            type="range"
            min={feature === "year" ? year - field.max : field.min}
            max={feature === "year" ? year - field.min : field.max}
            step={feature === "year" ? 1 : 1000}
            value={feature === "year" ? year - value : value}
            onChange={(event) =>
              setValue(
                feature === "year"
                  ? year - Number(event.target.value)
                  : Number(event.target.value),
              )
            }
          />
        </label>
      </div>
      <div className="ai-sensitivity-values">
        <div>
          <span>YOUR ORIGINAL ESTIMATE</span>
          <strong>{money(result.predicted_price)}</strong>
        </div>
        <div>
          <span>CHANGED INPUT / SAME MODEL</span>
          <strong aria-live="polite">
            {loading
              ? "Calculating…"
              : current
                ? money(current.predicted_price)
                : "—"}
          </strong>
        </div>
      </div>
      {error && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}
      <div className="ai-sensitivity-chart" aria-busy={loading}>
        {points.length > 0 && (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={points}
              margin={{ left: 5, right: 20, top: 20, bottom: 10 }}
              accessibilityLayer
            >
              <CartesianGrid stroke="#ffffff10" />
              <XAxis
                dataKey="value"
                tickFormatter={(tick: number) =>
                  feature === "year"
                    ? `${year - tick}yr`
                    : `${(tick / 1000).toFixed(0)}k`
                }
                tick={{ fill: "#aaa", fontSize: 10 }}
              />
              <YAxis
                tickFormatter={(tick: number) =>
                  `₹${(tick / 100000).toFixed(1)}L`
                }
                tick={{ fill: "#aaa", fontSize: 10 }}
                width={60}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  background: "#171717",
                  border: "1px solid #444",
                  color: "white",
                }}
                formatter={(price) => money(Number(price))}
                labelFormatter={(label) =>
                  feature === "year"
                    ? `${year - Number(label)} years / ${label} year`
                    : `${Number(label).toLocaleString("en-IN")} km`
                }
              />
              <ReferenceLine
                y={result.predicted_price}
                stroke="#888"
                strokeDasharray="4 5"
              />
              <Line
                type="linear"
                dataKey="predicted_price"
                name="Model estimate"
                stroke="#F4B400"
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="ai-note">
        Only {feature === "year" ? "year" : "kilometres"} changes; other inputs
        stay fixed. Values stay within observed source ranges. Lines connect
        sampled predictions, not a continuous formula. This is model
        sensitivity—not depreciation forecasting or causation.
      </p>
      {points.length > 0 && (
        <details className="ai-accordion">
          <summary>SHOW EXACT SENSITIVITY VALUES</summary>
          <div className="ai-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{feature === "year" ? "YEAR / AGE" : "KILOMETRES"}</th>
                  <th>MODEL ESTIMATE</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.value}>
                    <td>
                      {feature === "year"
                        ? `${point.value} / ${year - point.value} years`
                        : point.value.toLocaleString("en-IN")}
                    </td>
                    <td>{money(point.predicted_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

export function PricePredictor({
  project,
  apiReady,
  valuationImage = heroImage,
  valuationImageAlt = "Illustrative red concept car, not the vehicle being configured",
  valuationImageCaption = "ILLUSTRATIVE CONCEPT / NOT YOUR LISTING",
  allowSharing = false,
}: {
  project: Project;
  apiReady: boolean;
  valuationImage?: string;
  valuationImageAlt?: string;
  valuationImageCaption?: string;
  allowSharing?: boolean;
}) {
  const [vehicle, setVehicle] = useState<Vehicle>(() =>
    defaults(project, project.profiles[0]),
  );
  const [result, setResult] = useState<Prediction | null>(null),
    [comparison, setComparison] = useState<ModelPrediction[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [comparisonError, setComparisonError] = useState("");
  const [shareState, setShareState] = useState<"idle" | "sharing" | "shared">("idle");
  const [shareError, setShareError] = useState("");
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0);
  useEffect(() => () => controller.current?.abort(), []);
  const year = new Date().getFullYear();
  const profiles = project.profiles.filter(
    (profile) => profile.brand === vehicle.brand,
  );
  function update(name: string, value: string | number) {
    controller.current?.abort();
    sequence.current++;
    setBusy(false);
    setResult(null);
    setComparison([]);
    setError("");
    setShareState("idle");
    setShareError("");
    if (name === "brand") {
      const profile = project.profiles.find((item) => item.brand === value)!;
      setVehicle(defaults(project, profile));
    } else if (name === "vehicle_name") {
      const profile = profiles.find((item) => item.vehicle_name === value)!;
      setVehicle(defaults(project, profile));
    } else setVehicle((previous) => ({ ...previous, [name]: value }));
  }
  function field(name: string) {
    const definition = project.fields.find((item) => item.name === name)!;
    const id = `ai-input-${name}`;
    const isAge = name === "year";
    const label = isAge ? "Car age / years" : definition.label;
    const value = isAge
      ? vehicle.year === ""
        ? ""
        : year - Number(vehicle.year)
      : vehicle[name];
    return (
      <label htmlFor={id} key={name}>
        {label}
        {definition.type === "select" ? (
          <select
            id={id}
            value={String(value)}
            onChange={(event) => update(name, event.target.value)}
          >
            {(name === "vehicle_name"
              ? profiles.map((item) => String(item.vehicle_name))
              : definition.options
            ).map((option) => (
              <option value={option} key={option}>
                {title(option)}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type="number"
            required
            value={value}
            min={
              isAge ? 0 : name === "km_driven" ? 0 : name === "seats" ? 1 : 0.01
            }
            max={
              isAge
                ? year - 1886
                : name === "km_driven"
                  ? 5000000
                  : name === "mileage"
                    ? 200
                    : name === "engine"
                      ? 30000
                      : name === "max_power"
                        ? 5000
                        : 50
            }
            step={definition.integer ? 1 : "any"}
            onChange={(event) =>
              update(
                name,
                event.target.value === ""
                  ? ""
                  : isAge
                    ? year - Number(event.target.value)
                    : Number(event.target.value),
              )
            }
          />
        )}
        {isAge && (
          <small>
            Maps to training feature year: {vehicle.year}. No age feature is
            invented.
          </small>
        )}
        {name === "mileage" && (
          <small>Source units: km/l or km/kg, depending on fuel.</small>
        )}
      </label>
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const requestId = ++sequence.current;
    setBusy(true);
    setError("");
    setResult(null);
    setComparison([]);
    setComparisonError("");
    setShareState("idle");
    setShareError("");
    try {
      const response = await predictPrice(vehicle, abort.signal);
      if (requestId !== sequence.current) return;
      if (response.source_sha256 !== project.source_sha256)
        throw new Error(
          "API models and presentation data have different provenance. Re-export and restart before demonstrating.",
        );
      setResult(response);
      if (allowSharing) {
        setShareState("sharing");
        try {
          const receipt = await shareValuation(response.inputs, abort.signal);
          if (requestId !== sequence.current) return;
          if (Math.abs(receipt.predicted_price - response.predicted_price) > 0.01)
            throw new Error("The recorded estimate differs from the displayed value.");
          setShareState("shared");
        } catch (cause) {
          if (!abort.signal.aborted && requestId === sequence.current) {
            setShareState("idle");
            setShareError(cause instanceof Error ? cause.message : "Could not record this valuation.");
          }
        }
      }
      try {
        const all = await predictAll(vehicle, abort.signal);
        if (requestId === sequence.current) setComparison(all.predictions);
      } catch (cause) {
        if (!abort.signal.aborted)
          setComparisonError(
            cause instanceof Error ? cause.message : "Comparison unavailable.",
          );
      }
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Prediction failed.");
    } finally {
      if (requestId === sequence.current) setBusy(false);
    }
  }
  function exportRecord() {
    if (!result) return;
    const record = {
      created_at: new Date().toISOString(),
      ...result,
      comparison,
      disclaimer:
        "Historical listing estimate, not a verified transaction value or individual-prediction confidence interval.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(record, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "cardekho-ai-valuation.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section id="predict" className="ai-section ai-predict-section">
      <Reveal>
        <SectionHeader
          number="09"
          label="THE LIVE CONFIGURATOR"
          copy="Configure a real dataset vehicle. Send its exact training features to the saved Python pipeline. Compare all three estimators."
        >
          CONFIGURE.
          <br />
          CALCULATE.
          <br />
          <span>COMPARE.</span>
        </SectionHeader>
        <div className="ai-api-strip">
          <i className={apiReady ? "ready" : ""} />
          <span>
            {apiReady
              ? "PYTHON API CONNECTED / SAVED MODELS LOADED"
              : "PYTHON API NOT VERIFIED / START BACKEND TO PREDICT"}
          </span>
          <span>DEFAULT / {project.selected_model.toUpperCase()}</span>
        </div>
        <div className="ai-configurator">
          <form className="ai-vehicle-form" onSubmit={submit}>
            <fieldset disabled={busy}>
              <legend className="sr-only">Vehicle configuration</legend>
              {[
                {
                  label: "IDENTITY",
                  fields: ["brand", "vehicle_name", "year"],
                },
                {
                  label: "USAGE",
                  fields: ["km_driven", "owner", "seller_type"],
                },
                {
                  label: "POWERTRAIN",
                  fields: ["fuel", "transmission", "engine", "max_power"],
                },
                { label: "EFFICIENCY", fields: ["mileage"] },
                { label: "CABIN", fields: ["seats"] },
              ].map((group, index) => (
                <div className="ai-form-group" key={group.label}>
                  <h3>
                    <span>0{index + 1}</span>
                    {group.label}
                  </h3>
                  <div className="ai-form-fields">
                    {group.fields.map(field)}
                  </div>
                </div>
              ))}
              {allowSharing && <p className="performance-submit-notice">By selecting Calculate Value, your car specifications and estimated price are sent to the presenter’s live dashboard. No name, email address, or contact details are requested.</p>}
              <button
                className="ai-button ai-calculate"
                type="submit"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <LoaderCircle className="ai-spin" size={18} /> ANALYSING
                    VEHICLE DATA
                  </>
                ) : (
                  <>
                    CALCULATE VALUE <ArrowUpRight size={20} />
                  </>
                )}
              </button>
            </fieldset>
            {error && (
              <p className="ai-error" role="alert">
                {error}
              </p>
            )}
            {allowSharing && result && <p className="performance-submit-status" role={shareError ? "alert" : "status"}>{shareError ? `Estimate shown, but not recorded: ${shareError}` : shareState === "shared" ? "ESTIMATE SENT TO THE LIVE DASHBOARD" : "SENDING ESTIMATE TO THE LIVE DASHBOARD…"}</p>}
          </form>
          <div className="ai-valuation-panel">
            <img src={valuationImage} alt={valuationImageAlt} loading="lazy" />
            <span className="ai-concept-label">{valuationImageCaption}</span>
            <div
              className="ai-valuation-content"
              aria-live="polite"
              aria-busy={busy}
            >
              <span className="ai-eyebrow">
                {busy
                  ? "PYTHON INFERENCE IN PROGRESS"
                  : result
                    ? "ESTIMATED RESALE VALUE"
                    : "YOUR VEHICLE. YOUR PERSPECTIVE."}
              </span>
              <div className="ai-price" data-testid="ai-predicted-price">
                {result ? money(result.predicted_price) : "₹ —"}
              </div>
              <div className="ai-valuation-rule" />
              <p className="ai-vehicle-name">
                {title(String(vehicle.vehicle_name))}
              </p>
              <div className="ai-config-summary">
                <span>{vehicle.year} MODEL YEAR</span>
                <span>
                  {Number(vehicle.km_driven).toLocaleString("en-IN")} KM
                </span>
                <span>{String(vehicle.fuel).toUpperCase()}</span>
                <span>{String(vehicle.transmission).toUpperCase()}</span>
                <span>{vehicle.engine} CC</span>
                <span>{vehicle.max_power} BHP</span>
              </div>
              <div className="ai-result-model">
                <span>MODEL</span>
                <strong>{result?.model || project.selected_model}</strong>
              </div>
              {result?.warnings.map((warning) => (
                <p className="ai-warning" key={warning}>
                  {warning}
                </p>
              ))}
              {comparison.length > 0 && (
                <div className="ai-prediction-comparison">
                  <h4>THE SAME VEHICLE / THREE REAL PREDICTIONS</h4>
                  {comparison.map((item) => (
                    <div
                      key={item.model}
                      className={
                        item.model === project.selected_model ? "selected" : ""
                      }
                    >
                      <span>{item.model}</span>
                      <strong>{money(item.predicted_price)}</strong>
                    </div>
                  ))}
                </div>
              )}
              {comparisonError && (
                <p className="ai-warning">
                  Comparison unavailable: {comparisonError}
                </p>
              )}
              <p className="ai-estimate-note">
                <strong>ESTIMATE ONLY</strong>Machine-learning prediction based
                on historical listings. Actual market value varies with
                condition, location, service history, demand and inspection. R²
                is not confidence for this vehicle.
              </p>
              {result && (
                <button className="ai-export" onClick={exportRecord}>
                  <Download size={15} /> EXPORT VALUATION RECORD
                </button>
              )}
            </div>
          </div>
        </div>
        {result && <ModelSensitivity project={project} result={result} />}
      </Reveal>
    </section>
  );
}
