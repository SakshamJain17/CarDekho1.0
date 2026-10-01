"""Real Python inference for /ai/; saved preprocessing and estimators load once."""
import hashlib
import json
import math
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal, Optional

import joblib
import pandas as pd
import sklearn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, field_validator

from model_pipeline import ROOT, features_for
from backend.submissions import add_submission, clear_submissions, initialize, snapshot

MODEL_FILES = {"Decision Tree": "decision_tree", "Random Forest": "random_forest", "Gradient Boosting": "gradient_boosting"}
ModelName = Literal["Decision Tree", "Random Forest", "Gradient Boosting"]


class VehicleInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    year: int = Field(ge=1886, le=datetime.now().year)
    km_driven: float = Field(ge=0, le=5_000_000)
    mileage: float = Field(gt=0, le=200)
    engine: float = Field(gt=0, le=30_000)
    max_power: float = Field(gt=0, le=5_000)
    seats: int = Field(ge=1, le=50)
    brand: str = Field(min_length=1, max_length=120)
    vehicle_name: str = Field(min_length=1, max_length=240)
    fuel: str = Field(min_length=1, max_length=120)
    seller_type: str = Field(min_length=1, max_length=120)
    transmission: str = Field(min_length=1, max_length=120)
    owner: str = Field(min_length=1, max_length=120)

    @field_validator("brand", "vehicle_name", "fuel", "seller_type", "transmission", "owner")
    @classmethod
    def normalize(cls, value):
        value = value.strip().lower()
        if not value:
            raise ValueError("Category cannot be blank.")
        return value


class PredictionInput(VehicleInput):
    model: Optional[ModelName] = None


class SensitivityInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    vehicle: VehicleInput
    feature: Literal["year", "km_driven"]
    values: list[float] = Field(min_length=1, max_length=9)
    model: Optional[ModelName] = None


@asynccontextmanager
async def lifespan(app):
    project_path = ROOT / "web/data/ai-project.json"
    if not project_path.exists():
        raise RuntimeError("Missing presentation data. Run python scripts/export_ai_data.py.")
    project = json.loads(project_path.read_text())
    digest = hashlib.sha256((ROOT / "data/Car details v3.csv").read_bytes()).hexdigest()
    if digest != project["source_sha256"]:
        raise RuntimeError("Presentation data is stale. Re-export after training.")
    expected_version = project["metadata"]["packages"]["scikit-learn"]
    if sklearn.__version__ != expected_version:
        raise RuntimeError(f"Saved models require scikit-learn {expected_version}; install backend/requirements.txt.")
    registry = {}
    for name, slug in MODEL_FILES.items():
        bundle = joblib.load(ROOT / "models/v3" / f"{slug}.joblib")
        if bundle["source_sha256"] != digest or bundle["features"] != features_for("v3") or bundle["model_name"] != name:
            raise RuntimeError(f"Saved model metadata mismatch: {name}.")
        # Limit parallelism per API request without changing learned parameters.
        regressor = bundle["model"].named_steps["regressor"]
        if hasattr(regressor, "n_jobs"):
            regressor.n_jobs = 1
        registry[name] = bundle["model"]
    app.state.models = registry
    app.state.project = project
    app.state.started_at = datetime.now(timezone.utc).isoformat()
    initialize()
    yield
    app.state.models.clear()


app = FastAPI(title="CarDekho AI — Python Prediction API", version="1.0.0", lifespan=lifespan)
origins = [value.strip() for value in os.getenv("CARDEKHO_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173").split(",") if value.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type", "X-Presenter-Key"], allow_credentials=False)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    # Non-standard JSON NaN/Infinity must still return a useful 422, not fail
    # serialization of Pydantic's rejected input values into a 500 response.
    def safe(value):
        if isinstance(value, float) and not math.isfinite(value):
            return str(value)
        if isinstance(value, dict):
            return {key: safe(item) for key, item in value.items()}
        if isinstance(value, list):
            return [safe(item) for item in value]
        return value
    return JSONResponse(status_code=422, content={"detail": safe(jsonable_encoder(error.errors()))})


def validate_vehicle(vehicle, project):
    values = vehicle.model_dump()
    for field in project["fields"]:
        if field["type"] == "select" and values[field["name"]] not in field["options"]:
            raise HTTPException(422, f"Unsupported {field['name']}; choose an allowed training-data category.")
    identities = {(row.get("brand"), row["vehicle_name"]) for row in project["profiles"]}
    if (values["brand"], values["vehicle_name"]) not in identities:
        raise HTTPException(422, "The chosen vehicle model does not match the chosen brand.")
    return values


def predict_values(request, values, name):
    model = request.app.state.models[name]
    frame = pd.DataFrame([values], columns=features_for("v3"))
    price = float(model.predict(frame)[0])
    if not math.isfinite(price):
        raise HTTPException(500, "The model returned a non-finite price.")
    return max(0.0, price)


@app.get("/api/health")
def health(request: Request):
    return {"status": "ready", "dataset": "v3", "models": list(request.app.state.models), "selected_model": request.app.state.project["selected_model"], "started_at": request.app.state.started_at}


@app.get("/api/project")
def project(request: Request):
    return request.app.state.project


@app.post("/api/predict")
def predict(payload: PredictionInput, request: Request):
    info = request.app.state.project
    vehicle = VehicleInput.model_validate(payload.model_dump(exclude={"model"}))
    values = validate_vehicle(vehicle, info)
    name = payload.model or info["selected_model"]
    warnings = [f"{field['label']} is outside the observed dataset range." for field in info["fields"] if field["type"] == "number" and not field["min"] <= values[field["name"]] <= field["max"]]
    return {"predicted_price": predict_values(request, values, name), "model": name, "dataset": "v3", "source_sha256": info["source_sha256"], "inputs": values, "warnings": warnings, "estimate_only": True}


@app.post("/api/predict-all-models")
def predict_all(payload: VehicleInput, request: Request):
    info = request.app.state.project
    values = validate_vehicle(payload, info)
    return {"selected_model": info["selected_model"], "predictions": [{"model": name, "predicted_price": predict_values(request, values, name)} for name in MODEL_FILES]}


@app.post("/api/sensitivity")
def sensitivity(payload: SensitivityInput, request: Request):
    info = request.app.state.project
    values = validate_vehicle(payload.vehicle, info)
    name = payload.model or info["selected_model"]
    field = next(field for field in info["fields"] if field["name"] == payload.feature)
    candidates = []
    for value in payload.values:
        if not math.isfinite(value) or not field["min"] <= value <= field["max"]:
            raise HTTPException(422, "Sensitivity values must stay inside the observed dataset range.")
        if payload.feature == "year" and not value.is_integer():
            raise HTTPException(422, "Year sensitivity values must be whole years.")
        changed = {**values, payload.feature: int(value) if payload.feature == "year" else value}
        VehicleInput.model_validate(changed)
        candidates.append(changed)
    frame = pd.DataFrame(candidates, columns=features_for("v3"))
    prices = request.app.state.models[name].predict(frame)
    if not all(math.isfinite(float(price)) for price in prices):
        raise HTTPException(500, "The model returned a non-finite sensitivity estimate.")
    return {"model": name, "feature": payload.feature, "points": [{"value": value, "predicted_price": max(0.0, float(price))} for value, price in zip(payload.values, prices)], "interpretation": "Model sensitivity, not a forecast or a causal effect."}


@app.post("/api/submit-valuation", status_code=201)
def submit_valuation(payload: VehicleInput, request: Request):
    """Share a fresh server-calculated estimate after the visitor explicitly opts in."""
    values = validate_vehicle(payload, request.app.state.project)
    name = request.app.state.project["selected_model"]
    price = predict_values(request, values, name)
    created_at = datetime.now(timezone.utc).isoformat()
    add_submission(created_at, values, price, name)
    return {"status": "shared", "created_at": created_at, "predicted_price": price, "model": name}


@app.get("/api/submissions")
def submissions(request: Request):
    require_presenter_key(request)
    response = JSONResponse(snapshot())
    response.headers["Cache-Control"] = "no-store"
    return response


@app.delete("/api/submissions")
def reset_submissions(request: Request):
    require_presenter_key(request)
    clear_submissions()
    response = JSONResponse(snapshot())
    response.headers["Cache-Control"] = "no-store"
    return response


def require_presenter_key(request: Request):
    expected = os.getenv("CARDEKHO_PRESENTER_KEY", "")
    supplied = request.headers.get("X-Presenter-Key", "")
    if not expected:
        raise HTTPException(503, "Presenter dashboard is not configured.")
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(401, "Presenter key is required.")
