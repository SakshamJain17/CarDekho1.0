"""Anonymous presentation submissions with durable Postgres or local SQLite storage."""

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from model_pipeline import ROOT

SCHEMA = """CREATE TABLE IF NOT EXISTS valuation_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    brand TEXT NOT NULL,
    vehicle_name TEXT NOT NULL,
    model_year INTEGER NOT NULL,
    km_driven REAL NOT NULL,
    predicted_price REAL NOT NULL,
    model_name TEXT NOT NULL
)"""
POSTGRES_SCHEMA = SCHEMA.replace("id INTEGER PRIMARY KEY AUTOINCREMENT", "id BIGSERIAL PRIMARY KEY").replace("km_driven REAL", "km_driven DOUBLE PRECISION").replace("predicted_price REAL", "predicted_price DOUBLE PRECISION")


def database_url():
    return os.getenv("CARDEKHO_DATABASE_URL", f"sqlite:///{ROOT / 'runtime_data/submissions.sqlite3'}")


@contextmanager
def connection():
    url = database_url()
    if url.startswith("sqlite:///"):
        path = Path(url.removeprefix("sqlite:///"))
        path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(path, timeout=10)
        db.execute("PRAGMA busy_timeout=10000")
        try:
            yield db, "?", False
            db.commit()
        finally:
            db.close()
    elif url.startswith(("postgresql://", "postgres://")):
        import psycopg
        with psycopg.connect(url) as db:
            yield db, "%s", True
    else:
        raise RuntimeError("CARDEKHO_DATABASE_URL must be sqlite:/// or postgresql://")


def initialize():
    with connection() as (db, _, postgres):
        db.execute(POSTGRES_SCHEMA if postgres else SCHEMA)


def add_submission(created_at, values, price, model):
    with connection() as (db, marker, _):
        db.execute(
            f"INSERT INTO valuation_submissions (created_at,brand,vehicle_name,model_year,km_driven,predicted_price,model_name) VALUES ({','.join([marker] * 7)})",
            (created_at, values["brand"], values["vehicle_name"], values["year"], values["km_driven"], price, model),
        )


def snapshot():
    with connection() as (db, _, _):
        rows = db.execute("SELECT created_at,brand,vehicle_name,model_year,km_driven,predicted_price,model_name FROM valuation_submissions ORDER BY id DESC LIMIT 100").fetchall()
        total, average = db.execute("SELECT COUNT(*), AVG(predicted_price) FROM valuation_submissions").fetchone()
    return {"total": total, "average_price": average, "latest": [dict(zip(("created_at", "brand", "vehicle_name", "year", "km_driven", "predicted_price", "model"), row)) for row in rows]}


def clear_submissions():
    """Clear only the optional audience-submission feed."""
    with connection() as (db, _, _):
        db.execute("DELETE FROM valuation_submissions")
