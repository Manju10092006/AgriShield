from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import predict
from .insurance import config as insurance_config
from .insurance import rainfall_monitor
from .utils import setup_logging


logger = setup_logging("agrishield.api")

app = FastAPI(title="AgriShield AI - Crop Disease API")

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.get("/health")
async def health() -> Dict[str, Any]:
  model_loaded = False
  try:
    from . import predict as pred_module
    model_loaded = pred_module._MODEL is not None
  except Exception:
    pass
  return {
    "status": "healthy",
    "model_loaded": model_loaded,
    "supported_crops": ["Tomato", "Potato", "Pepper"],
    "version": "2.0.0"
  }


@app.post("/predict/enhanced")
async def predict_enhanced(file: UploadFile = File(...)) -> JSONResponse:
  """Enhanced prediction endpoint with confidence threshold metadata."""
  if not file.content_type or not file.content_type.startswith("image/"):
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Uploaded file must be an image.",
    )

  try:
    contents = await file.read()
    result = predict.predict_image(image_bytes=contents)
    confidence = result.get("confidence", 0)
    result["confidence_percent"] = round(confidence * 100, 1)
    result["use_ml"] = confidence >= 0.40
    result["requires_vision_fallback"] = confidence < 0.40
    return JSONResponse(content=result)
  except FileNotFoundError as exc:
    logger.error("Model or dataset not found: %s", exc)
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail=str(exc),
    ) from exc
  except Exception as exc:
    logger.exception("Enhanced prediction failed: %s", exc)
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Prediction failed.",
    ) from exc


@app.post("/predict")
async def predict_endpoint(file: UploadFile = File(...)) -> JSONResponse:
  if not file.content_type or not file.content_type.startswith("image/"):
    raise HTTPException(
      status_code=status.HTTP_400_BAD_REQUEST,
      detail="Uploaded file must be an image.",
    )

  try:
    contents = await file.read()
    result = predict.predict_image(image_bytes=contents)
    return JSONResponse(content=result)
  except FileNotFoundError as exc:
    logger.error("Model or dataset not found: %s", exc)
    raise HTTPException(
      status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
      detail=str(exc),
    ) from exc
  except Exception as exc:  # noqa: BLE001
    logger.exception("Prediction failed: %s", exc)
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Prediction failed.",
    ) from exc


def _read_json_log(path: Path) -> List[Dict[str, Any]]:
  if not path.exists():
    return []
  import json

  try:
    with path.open("r", encoding="utf-8") as f:
      data = json.load(f)
      if isinstance(data, list):
        return data
      return []
  except json.JSONDecodeError:
    return []


@app.get("/admin/droughts")
async def get_droughts() -> Dict[str, Any]:
  data = _read_json_log(insurance_config.DROUGHT_ALERTS_LOG_PATH)
  return {"count": len(data), "items": data}


@app.get("/admin/payouts")
async def get_payouts() -> Dict[str, Any]:
  data = _read_json_log(insurance_config.PAYOUTS_LOG_PATH)
  return {"count": len(data), "items": data}


@app.get("/admin/risk/{district}")
async def get_risk_for_district(district: str) -> Dict[str, Any]:
  droughts = _read_json_log(insurance_config.DROUGHT_ALERTS_LOG_PATH)
  filtered = [
    d for d in droughts if d.get("district", "").lower() == district.lower()
  ]
  if not filtered:
    raise HTTPException(
      status_code=status.HTTP_404_NOT_FOUND,
      detail=f"No drought records found for district '{district}'.",
    )
  latest = max(filtered, key=lambda d: d.get("year", 0))
  return {"latest": latest, "history": filtered}


@app.post("/admin/run-rainfall-monitor")
async def run_rainfall_monitor() -> Dict[str, Any]:
  try:
    result = rainfall_monitor.run_monitor()
    return result
  except Exception as exc:  # noqa: BLE001
    logger.exception("Rainfall monitor failed: %s", exc)
    raise HTTPException(
      status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
      detail="Rainfall monitor execution failed.",
    ) from exc


