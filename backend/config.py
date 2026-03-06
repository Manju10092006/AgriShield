import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]

# Directories
DATASETS_DIR = BASE_DIR / "datasets"
# PlantVillage dataset root (class-wise subfolders)
PLANTVILLAGE_DIR = DATASETS_DIR / "plantvillage"
MODELS_DIR = BASE_DIR / "models"
LOGS_DIR = BASE_DIR / "logs"

# Model paths
MODEL_PATH = MODELS_DIR / "crop_disease_model.h5"
TRAINING_LOG_PATH = LOGS_DIR / "training.log"
ACCURACY_PLOT_PATH = LOGS_DIR / "accuracy_plot.png"
CONFUSION_MATRIX_PATH = LOGS_DIR / "confusion_matrix.png"

# Training configuration
IMAGE_SIZE = (224, 224)
BATCH_SIZE = 32
EPOCHS = int(os.environ.get("AGRISHIELD_EPOCHS", "10"))
VALIDATION_SPLIT = 0.2


def ensure_directories() -> None:
  """
  Ensure that required directories exist.
  """
  for path in (DATASETS_DIR, PLANTVILLAGE_DIR, MODELS_DIR, LOGS_DIR):
    path.mkdir(parents=True, exist_ok=True)


