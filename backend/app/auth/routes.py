"""
Auth routes — Webull connection status and account discovery.

Webull OpenAPI uses app_key + app_secret (not user OAuth).
Auth here means: can we connect to Webull with the configured keys?
"""

from fastapi import APIRouter
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/status")
async def auth_status():
    """Check if Webull API credentials are configured and working."""
    try:
        from app.webull_client import get_webull

        wb = get_webull()
        result = wb.test_connection()

        if result.get("connected"):
            return {
                "authenticated": True,
                "account_id": result.get("account_id"),
                "account_type": "paper",  # Default to paper
                "accounts": result.get("accounts", 0),
                "message": "Connected to Webull API",
            }
        else:
            return {
                "authenticated": False,
                "account_type": None,
                "message": result.get("message", "Could not connect to Webull"),
            }
    except RuntimeError as e:
        # API keys not configured
        return {
            "authenticated": False,
            "account_type": None,
            "message": str(e),
        }
    except Exception as e:
        logger.error(f"Auth status check failed: {e}")
        return {
            "authenticated": False,
            "account_type": None,
            "message": f"Connection error: {str(e)}",
        }


@router.get("/accounts")
async def list_accounts():
    """List all Webull accounts linked to this app.

    Filters out entries with no account_id (Webull occasionally returns
    placeholder/orphaned subscriptions). For each remaining account we
    attempt a balance fetch to confirm it's actually live; accounts that
    error are still returned but flagged with `live: false` so the UI
    can show a stale-account warning instead of letting the user click
    a dead account.
    """
    try:
        from app.webull_client import get_webull

        wb = get_webull()
        raw = wb.get_account_list()

        cleaned = []
        for acc in raw:
            acct_id = acc.get("account_id")
            if not acct_id:
                # No id at all — Webull placeholder. Skip silently.
                continue
            entry = {
                "account_id": acct_id,
                "account_type": acc.get("account_type", "paper"),
                "live": True,
            }
            # Cheap liveness probe — balance call. If it errors out, mark stale.
            try:
                balance = wb.get_balance(account_id=acct_id)
                if isinstance(balance, dict) and balance.get("error"):
                    entry["live"] = False
                    entry["status_message"] = str(balance.get("error"))
            except Exception as probe_err:
                entry["live"] = False
                entry["status_message"] = str(probe_err)
            cleaned.append(entry)

        return {"accounts": cleaned, "count": len(cleaned)}
    except Exception as e:
        logger.error(f"Failed to list accounts: {e}")
        return {"accounts": [], "count": 0, "error": str(e)}


@router.post("/reconnect")
async def reconnect():
    """Reset and re-initialize the Webull client."""
    try:
        from app.webull_client import reset_client, get_webull

        reset_client()
        wb = get_webull()
        result = wb.test_connection()
        return {
            "reconnected": result.get("connected", False),
            "message": "Reconnected" if result.get("connected") else result.get("message"),
        }
    except Exception as e:
        logger.error(f"Reconnect failed: {e}")
        return {"reconnected": False, "message": str(e)}
