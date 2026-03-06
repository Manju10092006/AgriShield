from typing import Dict, List, Tuple

import pandas as pd

from ..utils import append_json_record, setup_logging
from .config import (
  DROUGHT_ALERTS_LOG_PATH,
  DROUGHT_THRESHOLD,
  RAINFALL_DATA_PATH,
  RISK_TRIGGER_THRESHOLD,
)
from .payout_engine import record_payout
from .risk_scoring import DistrictRisk, compute_risk_score, normalize_score


logger = setup_logging("agrishield.rainfall")


def load_rainfall_data() -> pd.DataFrame:
  if not RAINFALL_DATA_PATH.exists():
    raise FileNotFoundError(f"Rainfall dataset not found at {RAINFALL_DATA_PATH}")

  df = pd.read_csv(RAINFALL_DATA_PATH)
  expected_cols = {"Year", "State", "District", "Rainfall_mm"}

  if expected_cols.issubset(set(df.columns)):
    df = df.dropna(subset=["Year", "State", "District", "Rainfall_mm"])
    df["Year"] = df["Year"].astype(int)
    df["Rainfall_mm"] = df["Rainfall_mm"].astype(float)
    yearly = (
      df.groupby(["Year", "State", "District"], as_index=False)["Rainfall_mm"]
      .sum()
      .sort_values("Year")
    )
    return yearly

  # Adaptation for your provided state-level daily rainfall CSV:
  # Columns: "id","date","state_code","state_name","actual",...
  required_alt = {"date", "state_name", "actual"}
  if not required_alt.issubset(set(df.columns)):
    raise ValueError(
      "Rainfall dataset schema not recognized. "
      "Expected either (Year,State,District,Rainfall_mm) or (date,state_name,actual)."
    )

  df = df.dropna(subset=["date", "state_name", "actual"])
  df["date"] = pd.to_datetime(df["date"], errors="coerce")
  df = df.dropna(subset=["date"])
  df["Year"] = df["date"].dt.year.astype(int)
  df["State"] = df["state_name"].astype(str)
  # No district column in this dataset; treat State as District for monitoring.
  df["District"] = df["state_name"].astype(str)
  df["Rainfall_mm"] = df["actual"].astype(float)

  yearly = (
    df.groupby(["Year", "State", "District"], as_index=False)["Rainfall_mm"]
    .sum()
    .sort_values("Year")
  )
  return yearly


def compute_district_risks(df: pd.DataFrame) -> List[DistrictRisk]:
  risks: List[DistrictRisk] = []
  grouped = df.sort_values("Year").groupby(["State", "District"])

  raw_scores: List[Tuple[float, DistrictRisk]] = []

  for (state, district), group in grouped:
    group = group.sort_values("Year")
    group["rolling_avg"] = group["Rainfall_mm"].rolling(window=10, min_periods=10).mean()
    group["is_drought"] = (
      group["rolling_avg"].notna()
      & (group["Rainfall_mm"] < DROUGHT_THRESHOLD * group["rolling_avg"])
    )

    for idx, row in group.iterrows():
      if pd.isna(row["rolling_avg"]):
        continue

      past = group[group["Year"] < row["Year"]]
      if past.empty:
        historical_freq = 0.0
      else:
        historical_freq = past["is_drought"].mean() * 100.0

      rainfall_deficit_pct = max(
        0.0, (row["rolling_avg"] - row["Rainfall_mm"]) / row["rolling_avg"] * 100.0
      )
      score = compute_risk_score(rainfall_deficit_pct, historical_freq)
      drought_condition = bool(row["is_drought"])
      dr = DistrictRisk(
        state=str(state),
        district=str(district),
        year=int(row["Year"]),
        current_rainfall_mm=float(row["Rainfall_mm"]),
        rolling_avg_mm=float(row["rolling_avg"]),
        drought_condition=drought_condition,
        rainfall_deficit_pct=float(rainfall_deficit_pct),
        historical_drought_frequency=float(historical_freq),
        risk_score=score,
      )
      raw_scores.append((score, dr))

  if not raw_scores:
    return []

  scores_only = [s for s, _ in raw_scores]
  min_score, max_score = min(scores_only), max(scores_only)

  for score, dr in raw_scores:
    normalized = normalize_score(score, min_score, max_score)
    dr.risk_score = normalized
    risks.append(dr)

  return risks


def evaluate_and_trigger(risks: List[DistrictRisk]) -> Dict[str, List[dict]]:
  drought_records: List[dict] = []
  payout_records: List[dict] = []

  latest_by_district: Dict[Tuple[str, str], DistrictRisk] = {}
  for dr in risks:
    key = (dr.state, dr.district)
    if key not in latest_by_district or dr.year > latest_by_district[key].year:
      latest_by_district[key] = dr

  for dr in latest_by_district.values():
    if not dr.drought_condition:
      continue

    record = {
      "district": dr.district,
      "state": dr.state,
      "risk_score": round(dr.risk_score, 2),
      "rainfall_deficit": f"{round(dr.rainfall_deficit_pct)}%",
      "year": dr.year,
    }

    if dr.risk_score > RISK_TRIGGER_THRESHOLD:
      append_json_record(DROUGHT_ALERTS_LOG_PATH, record)
      farmer_id = f"{dr.state}_{dr.district}_{dr.year}".replace(" ", "_")
      payout = record_payout(farmer_id=farmer_id, district=dr.district)
      payout_records.append(payout)
      drought_records.append(record)

  logger.info(
    "Processed %d districts. Drought alerts: %d, Payouts: %d",
    len(latest_by_district),
    len(drought_records),
    len(payout_records),
  )
  return {"drought_alerts": drought_records, "payouts": payout_records}


def run_monitor() -> Dict[str, List[dict]]:
  df = load_rainfall_data()
  logger.info("Loaded rainfall data with %d records.", len(df))
  risks = compute_district_risks(df)
  logger.info("Computed risk for %d district-year pairs.", len(risks))
  result = evaluate_and_trigger(risks)
  return result


if __name__ == "__main__":
  summary = run_monitor()
  logger.info("Run summary: %s", summary)

