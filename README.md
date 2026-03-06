# AgriShield AI – Crop Disease Detection & Insurance Agent Backend

This project provides a production-grade backend for:

- **Crop disease detection** using TensorFlow and transfer learning (MobileNetV2).
- **FastAPI inference API** for image-based predictions.
- **Autonomous rainfall-driven insurance payout agent** with drought detection and payout simulation.

The structure implemented matches the requested layout:

```text
backend/
  train.py
  predict.py
  app.py
  config.py
  utils.py
  insurance/
    rainfall_monitor.py
    payout_engine.py
    risk_scoring.py
    config.py
models/
  crop_disease_model.h5        # created after training
logs/
  training.log
  accuracy_plot.png
  confusion_matrix.png
  payouts.json
  drought_alerts.json
datasets/
  plantvillage/                # expects class-wise folders
requirements.txt
README.md
```

> Note: your raw PlantVillage images currently live under `archive (3)/PlantVillage`. For training, either **copy/symlink** those class folders into `datasets/plantvillage/` or update `backend/config.py` to point `PLANTVILLAGE_DIR` directly at that path.

## 1. Setup

From the project root:

```bash
python -m venv .venv
.venv\Scripts\activate  # On Windows PowerShell
pip install -r requirements.txt
```

Ensure the dataset directory contains one subfolder per disease class, for example:

```text
datasets/plantvillage/
  Tomato___Late_blight/
  Tomato___Early_blight/
  Potato___Early_blight/
  ...
```

## 2. Training the crop disease model

### Basic training

From the project root:

```bash
python -m backend.train
```

This will:

- Read images from `datasets/plantvillage/` using class-wise subdirectories.
- Train a MobileNetV2-based classifier (default 10 epochs).
- Save the best model to `models/crop_disease_model.h5`.
- Log progress to `logs/training.log`.
- Generate:
  - `logs/accuracy_plot.png`
  - `logs/confusion_matrix.png`

### Custom epochs and forced retraining

```bash
python -m backend.train --epochs 15 --force
```

- `--epochs`: override default number of epochs.
- `--force`: retrain even if `models/crop_disease_model.h5` already exists.

## 3. Running the FastAPI server

Start the API with uvicorn from the project root:

```bash
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

Key endpoints:

- `GET /health` – health check.
- `POST /predict` – image upload endpoint for crop disease detection.
- `POST /admin/run-rainfall-monitor` – run rainfall analysis and trigger payouts.
- `GET /admin/droughts` – list drought alerts.
- `GET /admin/payouts` – list payout records.
- `GET /admin/risk/{district}` – latest drought risk for a specific district.

## 4. Testing the prediction API with curl

Assuming the server is running on `http://localhost:8000`:

```bash
curl -X POST "http://localhost:8000/predict" ^
  -H "accept: application/json" ^
  -H "Content-Type: multipart/form-data" ^
  -F "file=@path\\to\\leaf_image.jpg"
```

Example JSON response:

```json
{
  "predicted_class": "Tomato___Late_blight",
  "confidence": 0.94,
  "top_3_predictions": [
    {"class": "Tomato___Late_blight", "confidence": 0.94},
    {"class": "Tomato___Early_blight", "confidence": 0.03},
    {"class": "Tomato___Leaf_Mold", "confidence": 0.01}
  ]
}
```

## 5. Running the rainfall monitor manually

Rainfall data is read from:

- `daily-rainfall-at-state-level.csv` at the project root (see `backend/insurance/config.py`).

To execute the monitor once:

```bash
python -m backend.insurance.rainfall_monitor
```

This will:

- Load `daily-rainfall-at-state-level.csv`.
- For each district:
  - Compute 10‑year rolling average rainfall.
  - Detect drought conditions where current rainfall \< 40% of the rolling average.
  - Compute risk scores and normalize them to 0–100.
- For districts with `risk_score > 70`:
  - Append a drought alert to `backend/logs/drought_alerts.json`.
  - Simulate payouts and append to `backend/logs/payouts.json`.

You can instead trigger the same monitor through the API:

```bash
curl -X POST "http://localhost:8000/admin/run-rainfall-monitor"
```

## 6. Simulating payouts

Payout simulation happens automatically inside the rainfall monitor whenever the
normalized risk score exceeds the configured threshold (`RISK_TRIGGER_THRESHOLD` in
`backend/insurance/config.py`).

Each payout record is written to `backend/logs/payouts.json` in this shape:

```json
{
  "farmer_id": "State_District_Year",
  "district": "DistrictName",
  "amount": 5000,
  "transaction_id": "uuid-v4",
  "timestamp": "2026-03-03T12:00:00Z"
}
```

To adjust default amounts or thresholds, edit:

- `DROUGHT_THRESHOLD`
- `PAYOUT_AMOUNT`
- `RISK_TRIGGER_THRESHOLD`

in `backend/insurance/config.py`.

## 7. Testing admin endpoints with curl

### List drought alerts

```bash
curl "http://localhost:8000/admin/droughts"
```

### List payouts

```bash
curl "http://localhost:8000/admin/payouts"
```

### Get risk for a specific district

```bash
curl "http://localhost:8000/admin/risk/YourDistrictName"
```

If available, you will receive the latest drought record and full history for that district.

