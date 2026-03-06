from dataclasses import dataclass


@dataclass
class DistrictRisk:
  state: str
  district: str
  year: int
  current_rainfall_mm: float
  rolling_avg_mm: float
  drought_condition: bool
  rainfall_deficit_pct: float
  historical_drought_frequency: float
  risk_score: float


def compute_risk_score(
  rainfall_deficit_pct: float,
  historical_drought_frequency: float,
) -> float:
  score = rainfall_deficit_pct * 0.6 + historical_drought_frequency * 0.4
  return float(score)


def normalize_score(score: float, min_val: float, max_val: float) -> float:
  if max_val <= min_val:
    return 0.0
  normalized = (score - min_val) / (max_val - min_val)
  return float(max(0.0, min(1.0, normalized)) * 100.0)


