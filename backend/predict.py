from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import tensorflow as tf
from PIL import Image

from .config import IMAGE_SIZE, MODEL_PATH, PLANTVILLAGE_DIR, ensure_directories
from .utils import setup_logging


logger = setup_logging("agrishield.predict")
ensure_directories()

_MODEL: Optional[tf.keras.Model] = None
_CLASS_NAMES: Optional[List[str]] = None


def _load_class_names() -> List[str]:
  """
  Load class names from the dataset directory, following the same
  alphabetical convention used by Keras' DirectoryIterator.
  """
  if not PLANTVILLAGE_DIR.exists():
    raise FileNotFoundError(f"Dataset directory not found: {PLANTVILLAGE_DIR}")

  class_dirs = [p.name for p in PLANTVILLAGE_DIR.iterdir() if p.is_dir()]
  if not class_dirs:
    raise RuntimeError(f"No class directories found under {PLANTVILLAGE_DIR}")
  class_names = sorted(class_dirs)
  logger.info("Loaded %d classes for prediction.", len(class_names))
  return class_names


def _load_model() -> tf.keras.Model:
  if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Trained model not found at {MODEL_PATH}. Train the model first.")
  logger.info("Loading model from %s", MODEL_PATH)
  model = tf.keras.models.load_model(MODEL_PATH)
  return model


def get_model_and_classes() -> tuple[tf.keras.Model, List[str]]:
  global _MODEL, _CLASS_NAMES
  if _MODEL is None:
    _MODEL = _load_model()
  if _CLASS_NAMES is None:
    _CLASS_NAMES = _load_class_names()
  return _MODEL, _CLASS_NAMES


def _preprocess_image(img: Image.Image) -> np.ndarray:
  img = img.convert("RGB")
  img = img.resize(IMAGE_SIZE)
  arr = np.asarray(img).astype("float32") / 255.0
  arr = np.expand_dims(arr, axis=0)
  return arr


def predict_image(image_path: Optional[Path] = None, image_bytes: Optional[bytes] = None) -> Dict[str, Any]:
  """
  Run prediction on a single image provided as a file path or bytes.
  """
  if image_path is None and image_bytes is None:
    raise ValueError("Either image_path or image_bytes must be provided.")

  try:
    if image_bytes is not None:
      img = Image.open(io.BytesIO(image_bytes))
    else:
      if not image_path:
        raise ValueError("image_path is required when image_bytes is not provided.")
      img = Image.open(image_path)
  except Exception as exc:  # noqa: BLE001
    logger.error("Failed to load image: %s", exc)
    raise

  arr = _preprocess_image(img)

  model, class_names = get_model_and_classes()
  preds = model.predict(arr)
  probs = preds[0]

  top_indices = probs.argsort()[-3:][::-1]

  top_3 = [
    {"class": class_names[i], "confidence": float(round(probs[i], 4))}
    for i in top_indices
  ]

  best_idx = int(top_indices[0])
  result: Dict[str, Any] = {
    "predicted_class": class_names[best_idx],
    "confidence": float(round(probs[best_idx], 4)),
    "top_3_predictions": top_3,
  }
  return result


import io  # placed at end to avoid circular import issues in some environments

