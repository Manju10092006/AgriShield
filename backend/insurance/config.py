from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]

# Rainfall dataset path (points to provided CSV)
RAINFALL_DATA_PATH = BASE_DIR / "daily-rainfall-at-state-level.csv"

LOGS_DIR = BASE_DIR / "backend" / "logs"
PAYOUTS_LOG_PATH = LOGS_DIR / "payouts.json"
DROUGHT_ALERTS_LOG_PATH = LOGS_DIR / "drought_alerts.json"

# Threshold configuration
DROUGHT_THRESHOLD = 0.4  # current rainfall < 40% of 10-year rolling average
PAYOUT_AMOUNT = 5000
RISK_TRIGGER_THRESHOLD = 70.0

