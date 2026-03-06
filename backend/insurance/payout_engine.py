import datetime as dt
import uuid
from typing import Dict

from ..utils import append_json_record, setup_logging
from .config import PAYOUTS_LOG_PATH, PAYOUT_AMOUNT


logger = setup_logging("agrishield.payouts")


def simulate_payment_api_call(farmer_id: str, district: str, amount: float) -> str:
  """
  Simulate a POST to an external payment API and return a transaction ID.
  """
  transaction_id = str(uuid.uuid4())
  logger.info(
    "Simulated payout: farmer_id=%s district=%s amount=%.2f transaction_id=%s",
    farmer_id,
    district,
    amount,
    transaction_id,
  )
  return transaction_id


def record_payout(farmer_id: str, district: str, amount: float | None = None) -> Dict:
  """
  Record a payout event to payouts.json.
  """
  actual_amount = float(amount if amount is not None else PAYOUT_AMOUNT)
  transaction_id = simulate_payment_api_call(farmer_id, district, actual_amount)
  record = {
    "farmer_id": farmer_id,
    "district": district,
    "amount": actual_amount,
    "transaction_id": transaction_id,
    "timestamp": dt.datetime.utcnow().isoformat() + "Z",
  }
  append_json_record(PAYOUTS_LOG_PATH, record)
  return record


