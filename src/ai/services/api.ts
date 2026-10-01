import type {
  ModelPrediction,
  Prediction,
  Project,
  SensitivityPoint,
  Vehicle,
} from "../types";
const base = String(import.meta.env.VITE_CARDEKHO_API_URL || "/api").replace(
  /\/$/,
  "",
);
export const projectDataUrl = new URL(
  "../web/data/ai-project.json",
  document.baseURI,
).href;
export const heroImage = new URL(
  "../web/media/grand-tourer-hero.png",
  document.baseURI,
).href;

async function request<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  headers?: Record<string, string>,
  method?: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${base}${path}`, {
      method: method || (body ? "POST" : "GET"),
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(
        "The Python API is unavailable. Start the FastAPI server on port 8000 or configure VITE_CARDEKHO_API_URL.",
      );
    }
    if (!response.ok) {
      const detail = Array.isArray(result.detail)
        ? result.detail
            .map(
              (item: { loc?: string[]; msg: string }) =>
                `${item.loc?.slice(1).join(".")}: ${item.msg}`,
            )
            .join("; ")
        : result.detail;
      throw new Error(detail || `API request failed (${response.status}).`);
    }
    return result as T;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && error.name === "AbortError")
      throw new Error("The Python API timed out. Check the backend and retry.");
    if (error instanceof TypeError)
      throw new Error(
        "Cannot reach the Python API. Start the backend or check your deployment URL.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export async function loadProject(): Promise<Project> {
  const response = await fetch(projectDataUrl);
  if (!response.ok)
    throw new Error(
      "Presentation data is unavailable. Run python scripts/export_ai_data.py, then rebuild.",
    );
  const project = (await response.json()) as Project;
  if (
    !project.metrics?.length ||
    !project.fields?.length ||
    !project.source_sha256
  )
    throw new Error("Presentation data is incomplete.");
  return project;
}
export const checkHealth = () =>
  request<{ status: string; selected_model: string }>("/health");
export const predictPrice = (vehicle: Vehicle, signal?: AbortSignal) =>
  request<Prediction>("/predict", vehicle, signal);
export const predictAll = (vehicle: Vehicle, signal?: AbortSignal) =>
  request<{ predictions: ModelPrediction[] }>(
    "/predict-all-models",
    vehicle,
    signal,
  );
export const predictSensitivity = (
  vehicle: Vehicle,
  feature: "year" | "km_driven",
  values: number[],
  signal?: AbortSignal,
) =>
  request<{ points: SensitivityPoint[] }>(
    "/sensitivity",
    { vehicle, feature, values },
    signal,
  );
export const shareValuation = (vehicle: Vehicle, signal?: AbortSignal) =>
  request<{ status: string; predicted_price: number }>("/submit-valuation", vehicle, signal);
export type SharedSubmission = {
  created_at: string;
  brand: string;
  vehicle_name: string;
  year: number;
  km_driven: number;
  predicted_price: number;
  model: string;
};
export type SubmissionSnapshot = {
  total: number;
  average_price: number | null;
  latest: SharedSubmission[];
};
export const loadSubmissions = (key: string) =>
  request<SubmissionSnapshot>("/submissions", undefined, undefined, {
    "X-Presenter-Key": key,
  });
export const resetSubmissions = (key: string) =>
  request<SubmissionSnapshot>("/submissions", undefined, undefined, {
    "X-Presenter-Key": key,
  }, "DELETE");
