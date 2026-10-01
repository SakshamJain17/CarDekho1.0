# CarDekho used-car price predictor

## Live classroom submissions on the performance branch

Visitors see a submission notice before selecting **Calculate Value** at
`/performance/`. That action also records their estimate on the presenter
dashboard; there is no second share step. The API recalculates the estimate from saved Python models rather than
trusting a client-supplied price. It stores timestamp, vehicle brand/model/year,
kilometres, selected model and predicted price; it does not request names,
email addresses or contact details. The presenter-only page is `/presenter/`.
It shows the total, average and latest 100 shared estimates, polling every three
seconds. A key is required in the `X-Presenter-Key` header and is held only in
browser session storage. Do not put the key in a QR code or a Vite environment
variable. The QR code should point to `/performance/#predict` (or
`/performance/` if you want visitors to see the video first).

For a local rehearsal, set `CARDEKHO_PRESENTER_KEY` on the Python backend.
Local submissions default to ignored `runtime_data/submissions.sqlite3`.
Production requires a persistent PostgreSQL `DATABASE_URL` (or
`CARDEKHO_DATABASE_URL`); SQLite on a serverless function is not durable.
The Vercel configuration uses a Vite frontend and FastAPI backend as two
services on one domain. Its production build publishes only `/performance/`
and `/presenter/`, redirects `/` to the performance page, and routes `/api/*`
to FastAPI. Set the presenter key as a server-side environment variable; never
put it in a Vite variable or QR code. Connect a Neon Postgres database before
deploying. Protect the presenter key and consider classroom spam/rate limits
before exposing the submission endpoint broadly.

## Performance edition — Lamborghini-inspired alternative

The current homepage (`/`) and editorial AI edition (`/ai/`) are preserved.
The separate **`/performance/`** entry introduces an original graphite/yellow
automotive design, hexagonal controls, an interactive model line-up and an
opt-in, locally hosted Three.js showroom. Its homepage now uses licensed real
driving footage—not the previous AI-generated supercar image. A muted loop,
pause/play control and accessible "Watch the intro" player provide the video
experience. A genuine frame from the footage is the poster and valuation image.
The design reference is
[Lamborghini's official website](https://www.lamborghini.com/en-en).

Run the existing FastAPI backend and Vite frontend as documented below, then
open <http://127.0.0.1:5173/performance/>. All three entries are included in
`npm run build`. The performance edition shares the same verified data,
evaluation charts, input validation and saved Python model API as `/ai/`.
Exploring models in the line-up does not silently change the validation-selected
Gradient Boosting predictor. Decorative architecture bars are labeled as visual
motifs, not data charts. Paint changes in the 3D concept showroom do not change
prices. The 10.3 MB GLB loads only after entering the showroom.

New files live in `performance/`, `src/performance/`, and
`tests/browser/performance.spec.mjs` and `tests/browser/video.spec.mjs`. The
locally hosted intro is `web/media/driving-intro.mp4` (1280x720, 7.38 seconds,
approximately 1.74 MB); the real-frame poster is `driving-intro-poster.jpg`.
Provenance and license are retained in `driving-intro.metadata.json` and
`web/media/ASSET_CREDITS.md`. CSS overrides are loaded only by this separate
entry, so existing pages retain their appearance. The shared showroom's optional
asset-base prop supports the nested route. Its opt-in performance studio adds a
closer camera, graphite finish and darker lighting without changing the original
homepage's default camera, paint or lighting.

Cleanup removes the unreferenced legacy `hero-scrub.tsx` component and unused
GSAP dependency. They are recoverable from Git history. Original CSVs, fitted
models, training scripts and evaluation outputs are retained. The existing
Vercel/Python deployment requirements below also apply to this edition.

The video is muted/inline and loops on the homepage, pauses offscreen and when
the tab is hidden, and never downloads automatically for reduced-motion or
data-saver users. These users can explicitly opt into playback. Video failures
keep the real poster visible and do not disable model predictions. The intro
player uses native controls/fullscreen; Escape closes its accessible dialog.
No fabricated audio, generated imagery or Lamborghini campaign footage is used
in the performance edition. The other two editions' existing imagery is preserved.

To test the built performance edition, start `npm run preview`, then run
`CARDEKHO_TEST_URL=http://127.0.0.1:4173 npm run test:browser -- tests/browser/performance.spec.mjs`.

## CarDekho AI — separate premium alternative

The existing homepage is preserved at `/`. The new React/TypeScript presentation
is at **`/ai/`**. It uses original automotive artwork, a black/off-white/red visual
system, locally hosted open-source fonts, responsive navigation, Recharts,
accessible data tables, and a vehicle configurator backed by **real Python
inference**. It does not import the original site's JavaScript model engine.

### Run the alternative

Use two terminals in the repository directory. No API key is needed.

```bash
# Terminal 1: existing saved sklearn pipelines, loaded once on startup
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

```bash
# Terminal 2: React frontend, with /api proxied to Python
npm ci --ignore-scripts
npm run dev
```

Open <http://127.0.0.1:5173/ai/>. API documentation is at
<http://127.0.0.1:8000/docs>. The dataset narrative and evaluation charts remain
readable without Python; calculating prices requires the backend. Failures are
displayed explicitly, never replaced with mocked predictions.

### Actual data and models

The alternative focuses on `Car details v3.csv`: 8,128 raw records, 13 source
columns including the target, 6,926 cleaned rows and 12 model features. Other
datasets remain independent and available on the original website/Streamlit app.
The actual regressors are **Decision Tree, Random Forest and Gradient Boosting**.
Gradient Boosting remains the validation-selected v3 default even though Random
Forest has the lowest independent test RMSE. There is no Linear Regression
artifact, invented 80/20 split, fabricated train R² or per-vehicle confidence score.

The presentation JSON is generated from source data and genuine saved outputs:

| v3 model | Independent test R² | MAE / INR | RMSE / INR |
|---|---:|---:|---:|
| Decision Tree | 0.9162 | 84,454 | 147,110 |
| Random Forest | 0.9376 | 71,176 | 126,944 |
| Gradient Boosting — validation-selected | 0.8721 | 82,801 | 181,661 |

Source: `outputs/v3/model_metrics.csv`; 1,387 independent test rows per model.

```bash
python scripts/export_ai_data.py
```

After retraining, run `python export_web.py` before that command to refresh
profile definitions. The exporter checks dataset/model provenance and exports
all held-out predictions for the scatter chart. Random Forest importance is
computed from its actual fitted pipeline, aggregating one-hot columns back to
source attributes. API startup checks the CSV hash and the saved sklearn version
(1.6.1); load only trusted repository joblib files.

### Python API and configurator

- `GET /api/health`: loaded model status.
- `GET /api/project`: verified presentation data.
- `POST /api/predict`: 12 flat vehicle features; optional `model` selects one of
  the three exact model names. Returns price in INR, provenance and warnings.
- `POST /api/predict-all-models`: the same 12 features, three genuine estimates.
- `POST /api/sensitivity`: `{vehicle, feature, values, model?}`; feature is `year`
  or `km_driven`, maximum nine finite values within observed data ranges.

Use the configurator's brand-linked model options, enter usage/powertrain/cabin
details and choose Calculate Value. Car age maps to the existing `year` feature
using the current calendar year. Invalid categories, mismatched identities,
extra target fields and impossible numbers return 422. Editing inputs clears
stale estimates. Sensitivity changes one feature while keeping the others fixed;
it is not a causal effect or depreciation forecast. Export downloads the actual
valuation response and all-model comparison as JSON.

### Deploy the performance edition

Import `SakshamJain17/CarDekho1.0` into one Vercel project using its `main`
branch and the repository root. The `services` configuration in `vercel.json`
builds only the performance and presenter pages and runs `backend.app:app`
as FastAPI under `/api/*`; no `VITE_CARDEKHO_API_URL` or cross-origin setting
is needed for this same-domain deployment. Connect Neon Free to the project
and confirm it supplies `DATABASE_URL` to production. Add
`CARDEKHO_PRESENTER_KEY` as a server-side production environment variable.
Only deploy after the build, `/api/health`, one valuation, and the presenter
feed have been checked. Runtime models are historical academic estimators, not
a production marketplace price guarantee.

### Verify

```bash
python -m unittest discover -s tests -p 'test_*.py'
npm test
npm run build
npm run test:browser
```

Browser tests start the local API and frontend and use installed Google Chrome;
override `CARDEKHO_BROWSER_PATH` if Chrome is elsewhere. Evidence screenshots
are generated under ignored `test-results/`. The audit and preservation decisions
are documented in `REPOSITORY_AUDIT.md`; licenses are in
`web/media/ASSET_CREDITS.md` and `web/media/fonts/*-OFL.txt`.

## Existing experiences

For the React-enhanced HTML website and GitHub/Vercel hosting, read `DEPLOYMENT.md`.
`index.html` loads the exported selected models and runs real predictions
directly in the browser. The Python/Streamlit workflow below remains available.

```bash
npm ci --ignore-scripts
npm run dev
```

Open <http://localhost:5173>. The React/TypeScript landing hero uses CSS motion and
Tailwind 4; reusable UI components live in `components/ui/`. For a production
preview, run `npm run build` followed by `npm run preview` (port 4173).
The static site requires no Python prediction
server. After retraining, regenerate the website assets with `python export_web.py`.

Four independent experiments using all four supplied CarDekho CSVs. Each
compares Decision Tree, Random Forest and Gradient Boosting, selects its model
on validation RMSE, evaluates it on independent test groups, and saves all
three trained pipelines. The Streamlit app loads saved results for a fast demo.

## Datasets

| Key | Source file | Scope |
|---|---|---|
| `v3` | `Car details v3.csv` | Detailed car listings, engine/power/mileage |
| `v4` | `car details v4.csv` | Newer listings, location/dimensions/drivetrain |
| `basic` | `CAR DETAILS FROM CAR DEKHO.csv` | Basic car details |
| `small` | `car data.csv` | Cars and motorcycles, present price |

The datasets are kept separate: they have different features and vehicle
populations. Small-dataset prices are assumed to be INR lakhs and converted
to rupees; this assumption is clearly labeled because no data dictionary
was supplied. Other dataset price columns are treated as INR.

## Models

The project trains and evaluates:

1. Decision Tree Regressor
2. Random Forest Regressor
3. Gradient Boosting Regressor

Within each dataset, all models use the same feature set and group-separated
split: approximately 60% training, 20% validation and 20% test. Identical
feature rows stay together, even if listing prices differ. Imputation and
encoding are learned inside each training pipeline. The lowest validation
RMSE selects the winner before any test metrics are calculated. All three
models are finally refitted on the full cleaned dataset for demonstration.

## Setup

Python 3.9 or newer is required.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

## Train and save all models

```bash
python train.py
```

This reproduces 12 experiments and fills `models/` and `outputs/`:

- `models/<dataset>/decision_tree.joblib`, `random_forest.joblib`, `gradient_boosting.joblib`
- `models/<dataset>/best_model.joblib`: validation-selected model
- `outputs/<dataset>/model_metrics.csv`: validation and independent test results
- `outputs/<dataset>/test_predictions.csv`: held-out predictions for all three models
- `outputs/<dataset>/cleaned_data.csv`, `feature_importance.csv`, `metadata.json`
- `outputs/<dataset>/charts/`: comparison, diagnostics and dataset/feature charts
- `outputs/all_model_metrics.csv`, `data_audit.csv`, `PROJECT_REPORT.md`

To refresh just one experiment: `python train.py --dataset v4`.
Run the default all-dataset command to regenerate the aggregate report.
The old `artifacts/` files are prototype results retained for reference; the
finished application uses `models/` and `outputs/` exclusively.

Metadata includes source SHA-256 hashes, library versions, training time,
feature definitions and cleaning counts. Only load joblib files you trust.

## Run the web application

```bash
streamlit run main.py
```

Open <http://localhost:8501>. Switch datasets in the sidebar. The app provides
vehicle-specific inputs, a three-model comparison, data overview, and method
and limitations tabs. Brand and model choices are linked. Inputs outside the
observed numeric range are flagged. No models are retrained on app launch.

The interface references the local PTSD / ByteCoders website's monochrome
palette, oversized typography, glass panels and subtle motion. It includes
a responsive vehicle illustration, grouped vehicle inputs, valuation cards,
and matching dark charts. Styling lives in `assets/style.css`; presentation
components live in `ui.py`. The optional Google-hosted Bricolage font falls
back to Arial if unavailable. Reduced-motion preferences are respected.

## Can the four datasets be integrated?

Yes, with a separate pooled experiment. Normalize price units, manufacturer
and model names, and ownership categories. Use common features (vehicle
identity, year, kilometres, fuel, seller, transmission and ownership), or
explicitly handle missing specifications. Identify motorcycles before
building a car-only model, or preserve a vehicle-type feature in a mixed
vehicle model. Remove cross-source duplicates and keep repeated vehicles
in one evaluation split. Dataset labels alone should not substitute for
vehicle information at prediction time.

The existing four experiments are separate benchmarks, not a technical
requirement. A pooled model may gain coverage but could lose detail or learn
source-specific patterns; its performance must be measured, not assumed.
The styling update does not merge the datasets or alter trained models.

## Run tests

```bash
python -m unittest discover -s tests -v
```

## Project structure

```text
CarDekho/
├── data/                   # Four original CSVs
├── ai/index.html           # Alternative HTML entry, /ai/
├── src/ai/                 # React presentation, charts, configurator, API client
├── backend/                # FastAPI; cached real Python pipelines
├── scripts/export_ai_data.py # Genuine presentation-data export
├── web/data/ai-project.json # Source provenance, metrics, held-out points
├── web/media/              # Original artwork, licensed 3D asset, local fonts
├── main.py                 # Streamlit interface
├── model_pipeline.py       # Schema adapters, grouped splits, model evaluation
├── train.py                # All experiments, export, charts and report
├── models/                 # Four bundles per dataset (16 total)
├── outputs/                # Metrics, data audit, charts and generated report
├── PRESENTATION_GUIDE.md   # Talking points, demo flow and viva questions
├── tests/test_model_pipeline.py
├── requirements.txt
└── README.md
```

## Presenting the project

Use `outputs/PROJECT_REPORT.md` for exact results and methodology, and
`PRESENTATION_GUIDE.md` for a 7–10 minute talk and live-demo steps. These
are historical listing-price models, not verified current-market valuations.
Scores across different datasets are not directly comparable. No tuning or
cross-validation results are claimed. Earlier prototype scores are obsolete.
