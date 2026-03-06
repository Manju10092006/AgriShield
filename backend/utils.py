import json
import logging
from pathlib import Path
from typing import Any, Dict, List

from .config import LOGS_DIR, TRAINING_LOG_PATH


def setup_logging(name: str = "agrishield") -> logging.Logger:
  """
  Configure and return a named logger.
  """
  LOGS_DIR.mkdir(parents=True, exist_ok=True)

  logger = logging.getLogger(name)
  logger.setLevel(logging.INFO)

  if not logger.handlers:
    formatter = logging.Formatter(
      "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    file_handler = logging.FileHandler(TRAINING_LOG_PATH, encoding="utf-8")
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(formatter)

    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.INFO)
    stream_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)

  return logger


def append_json_record(path: Path, record: Dict[str, Any]) -> None:
  """
  Append a JSON record to a file that stores an array of objects.
  """
  path.parent.mkdir(parents=True, exist_ok=True)
  data: List[Dict[str, Any]] = []
  if path.exists():
    try:
      with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
        if not isinstance(data, list):
          data = []
    except json.JSONDecodeError:
      data = []

  data.append(record)
  with path.open("w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)


