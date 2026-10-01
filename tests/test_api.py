"""The API must use saved Python pipelines and reject invalid vehicle inputs."""
import json
import os
import tempfile
import unittest
from unittest.mock import patch

import pandas as pd
from fastapi.testclient import TestClient

from backend.app import app
from backend.submissions import initialize
from model_pipeline import ROOT, features_for


class PredictionAPITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.client.__enter__()
        cls.project = app.state.project
        profile = cls.project["profiles"][0]
        cls.vehicle = {field["name"]: profile.get(field["name"]) if profile.get(field["name"]) is not None else field.get("default", field.get("options", [None])[0]) for field in cls.project["fields"]}

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    def test_health_and_real_project(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["models"]), 3)
        self.assertEqual(self.client.get("/api/project").json()["raw_rows"], 8128)

    def test_each_prediction_equals_saved_python_pipeline(self):
        for name, pipeline in app.state.models.items():
            response = self.client.post("/api/predict", json={**self.vehicle, "model": name})
            self.assertEqual(response.status_code, 200, response.text)
            frame = pd.DataFrame([self.vehicle], columns=features_for("v3"))
            self.assertAlmostEqual(response.json()["predicted_price"], max(0, float(pipeline.predict(frame)[0])), places=7)
            self.assertEqual(response.json()["source_sha256"], self.project["source_sha256"])

    def test_default_and_all_models(self):
        response = self.client.post("/api/predict", json=self.vehicle).json()
        self.assertEqual(response["model"], "Gradient Boosting")
        all_models = self.client.post("/api/predict-all-models", json=self.vehicle)
        self.assertEqual(all_models.status_code, 200)
        self.assertEqual(len(all_models.json()["predictions"]), 3)

    def test_invalid_inputs_do_not_produce_prices(self):
        cases = [{"km_driven": -1}, {"year": 2100}, {"brand": "unknown"}, {"fuel": "unknown"}, {"seats": 2.5}, {"selling_price": 999}, {"vehicle_name": "unknown"}, {"model": "Linear Regression"}, {"engine": 0}]
        for change in cases:
            with self.subTest(change=change):
                self.assertEqual(self.client.post("/api/predict", json={**self.vehicle, **change}).status_code, 422)
        brands = [field for field in self.project["fields"] if field["name"] == "brand"][0]["options"]
        other = next(brand for brand in brands if brand != self.vehicle["brand"])
        self.assertEqual(self.client.post("/api/predict", json={**self.vehicle, "brand": other}).status_code, 422)

    def test_real_sensitivity_and_observed_range_guard(self):
        values = [2010, 2014, 2018]
        response = self.client.post("/api/sensitivity", json={"vehicle": self.vehicle, "feature": "year", "values": values})
        self.assertEqual(response.status_code, 200, response.text)
        for point in response.json()["points"]:
            predicted = self.client.post("/api/predict", json={**self.vehicle, "year": int(point["value"])}).json()["predicted_price"]
            self.assertAlmostEqual(point["predicted_price"], predicted, places=7)
        for invalid in [[3000], [2014.5], [-1]]:
            self.assertEqual(self.client.post("/api/sensitivity", json={"vehicle": self.vehicle, "feature": "year", "values": invalid}).status_code, 422)

    def test_nonfinite_input_returns_422_not_500(self):
        for value in [float("nan"), float("inf"), float("-inf")]:
            response = self.client.post("/api/predict", content=json.dumps({**self.vehicle, "km_driven": value}), headers={"Content-Type": "application/json"})
            self.assertEqual(response.status_code, 422)
            self.assertIn("finite", response.text)

    def test_cors_allows_only_configured_origins(self):
        for origin, allowed in [("http://127.0.0.1:5173", True), ("https://unknown.example", False)]:
            response = self.client.options("/api/predict", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
            self.assertEqual(response.headers.get("access-control-allow-origin") == origin, allowed)

    def test_presentation_metrics_and_points_are_real(self):
        metrics = pd.read_csv(ROOT / "outputs/v3/model_metrics.csv")
        predictions = pd.read_csv(ROOT / "outputs/v3/test_predictions.csv")
        for metric in self.project["metrics"]:
            row = metrics[metrics.model == metric["model"]].iloc[0]
            self.assertAlmostEqual(metric["test_r2"], row.test_r2, places=12)
            points = self.project["test_predictions"][metric["model"]]
            self.assertEqual(len(points), int(row.test_rows))
            self.assertEqual(points[0]["actual_inr"], predictions[predictions.model == metric["model"]].iloc[0].actual_inr)
        self.assertAlmostEqual(sum(item["importance"] for item in self.project["feature_importance"]["items"]), 1, places=10)

    def test_opt_in_submission_and_presenter_only_feed(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"CARDEKHO_DATABASE_URL": f"sqlite:///{directory}/submissions.sqlite3", "CARDEKHO_PRESENTER_KEY": "classroom-secret"}):
                initialize()
                self.assertEqual(self.client.get("/api/submissions").status_code, 401)
                self.assertEqual(self.client.get("/api/submissions", headers={"X-Presenter-Key": "wrong"}).status_code, 401)
                self.assertEqual(self.client.post("/api/submit-valuation", json={**self.vehicle, "selling_price": 99}).status_code, 422)
                headers = {"X-Presenter-Key": "classroom-secret"}
                self.assertEqual(self.client.get("/api/submissions", headers=headers).json()["total"], 0)
                predicted = self.client.post("/api/predict", json=self.vehicle).json()["predicted_price"]
                self.assertEqual(self.client.get("/api/submissions", headers=headers).json()["total"], 0)
                response = self.client.post("/api/submit-valuation", json=self.vehicle)
                self.assertEqual(response.status_code, 201, response.text)
                self.assertAlmostEqual(response.json()["predicted_price"], predicted)
                feed = self.client.get("/api/submissions", headers=headers)
                self.assertEqual(feed.headers["cache-control"], "no-store")
                self.assertEqual(feed.json()["total"], 1)
                self.assertEqual(feed.json()["latest"][0]["vehicle_name"], self.vehicle["vehicle_name"])
                self.assertNotIn("email", feed.text)
                self.assertNotIn("name", feed.json()["latest"][0])
                self.assertEqual(self.client.delete("/api/submissions").status_code, 401)
                self.assertEqual(self.client.delete("/api/submissions", headers={"X-Presenter-Key": "wrong"}).status_code, 401)
                self.assertEqual(self.client.get("/api/submissions", headers=headers).json()["total"], 1)
                reset = self.client.delete("/api/submissions", headers=headers)
                self.assertEqual(reset.status_code, 200)
                self.assertEqual(reset.headers["cache-control"], "no-store")
                self.assertEqual(reset.json(), {"total": 0, "average_price": None, "latest": []})
                self.assertEqual(self.client.get("/api/submissions", headers=headers).json()["total"], 0)


if __name__ == "__main__":
    unittest.main()
