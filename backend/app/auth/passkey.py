"""
WebAuthn passkey authentication — single-user, device-bound.
Supports fingerprint (Mac), Face ID (iPhone), backup codes.
"""

import hashlib
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Request, Response, HTTPException, Depends, Cookie
from pydantic import BaseModel
from sqlalchemy.orm import Session
import webauthn
from webauthn.helpers import (
    bytes_to_base64url,
    base64url_to_bytes,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
    AuthenticatorAttachment,
)

from app.database import get_db
from app.config import get_settings
from app.models import WebAuthnCredential, BackupCode

logger = logging.getLogger(__name__)
router = APIRouter()

# In-memory challenge store (per-session, short-lived)
_challenges: dict[str, bytes] = {}

# ─── Helpers ───

def _rp_id(request: Request) -> str:
    """Extract relying party ID from request host."""
    host = request.headers.get("host", "localhost")
    # Strip port
    return host.split(":")[0]

def _rp_origin(request: Request) -> str:
    """Build expected origin from request."""
    scheme = request.headers.get("x-forwarded-proto", "https" if get_settings().is_production else "http")
    host = request.headers.get("host", "localhost:8000")
    return f"{scheme}://{host}"

def _hash_code(code: str) -> str:
    """SHA-256 hash a backup code."""
    return hashlib.sha256(code.encode()).hexdigest()

def _generate_backup_codes(count: int = 8) -> list[str]:
    """Generate n random 6-digit backup codes."""
    return [f"{secrets.randbelow(1000000):06d}" for _ in range(count)]

def _create_session_token() -> str:
    """Create a signed session token (simple JWT-like)."""
    import jose.jwt as jwt
    settings = get_settings()
    payload = {
        "sub": "owner",
        "iat": datetime.utcnow().timestamp(),
        "exp": (datetime.utcnow() + timedelta(days=30)).timestamp(),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")

def verify_session(session_token: Optional[str] = Cookie(None, alias="aa_session")) -> bool:
    """Verify the session cookie. Raises 401 if invalid."""
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        import jose.jwt as jwt
        settings = get_settings()
        payload = jwt.decode(session_token, settings.secret_key, algorithms=["HS256"])
        return True
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid session")


# ─── Setup check ───

class SetupStatus(BaseModel):
    is_setup: bool
    has_passkeys: int
    has_backup_codes: int

@router.get("/passkey/setup-status")
async def setup_status(db: Session = Depends(get_db)):
    """Check if the owner has registered any passkeys."""
    cred_count = db.query(WebAuthnCredential).count()
    code_count = db.query(BackupCode).filter(BackupCode.is_used == False).count()
    return SetupStatus(
        is_setup=cred_count > 0,
        has_passkeys=cred_count,
        has_backup_codes=code_count,
    )


# ─── Registration (first-time setup) ───

@router.post("/passkey/register/begin")
async def register_begin(request: Request, db: Session = Depends(get_db)):
    """Start passkey registration. Returns challenge for the browser."""
    rp_id = _rp_id(request)

    # Get existing credential IDs to exclude
    existing = db.query(WebAuthnCredential).all()
    exclude_credentials = [
        {"id": cred.credential_id, "type": "public-key"}
        for cred in existing
    ]

    options = webauthn.generate_registration_options(
        rp_id=rp_id,
        rp_name="AutomateAscension",
        user_id=b"owner",
        user_name="owner",
        user_display_name="Owner",
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        exclude_credentials=exclude_credentials,
    )

    # Store challenge
    challenge_key = secrets.token_hex(16)
    _challenges[challenge_key] = options.challenge

    # Serialize options for the browser
    options_json = webauthn.options_to_json(options)

    return {
        "options": options_json,
        "challenge_key": challenge_key,
    }


class RegisterCompleteRequest(BaseModel):
    challenge_key: str
    credential: str  # JSON string from navigator.credentials.create()
    device_name: str = "Unknown Device"

@router.post("/passkey/register/complete")
async def register_complete(body: RegisterCompleteRequest, request: Request, db: Session = Depends(get_db)):
    """Complete passkey registration. Verifies and stores the credential."""
    challenge = _challenges.pop(body.challenge_key, None)
    if not challenge:
        raise HTTPException(status_code=400, detail="Challenge expired or invalid")

    rp_id = _rp_id(request)
    origin = _rp_origin(request)

    try:
        verification = webauthn.verify_registration_response(
            credential=body.credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
        )
    except Exception as e:
        logger.error(f"Registration verification failed: {e}")
        raise HTTPException(status_code=400, detail=f"Verification failed: {str(e)}")

    # Store credential
    new_cred = WebAuthnCredential(
        credential_id=verification.credential_id,
        public_key=verification.credential_public_key,
        sign_count=verification.sign_count,
        device_name=body.device_name,
    )
    db.add(new_cred)
    db.commit()

    # Generate backup codes on first registration
    code_count = db.query(BackupCode).filter(BackupCode.is_used == False).count()
    backup_codes = []
    if code_count == 0:
        codes = _generate_backup_codes(8)
        for code in codes:
            db.add(BackupCode(code_hash=_hash_code(code)))
        db.commit()
        backup_codes = codes  # Return plain codes ONCE for user to save

    # Create session
    token = _create_session_token()

    response_data = {
        "registered": True,
        "device_name": body.device_name,
        "credential_id": bytes_to_base64url(verification.credential_id),
    }
    if backup_codes:
        response_data["backup_codes"] = backup_codes
        response_data["backup_codes_message"] = "Save these codes — they won't be shown again."

    response = Response(
        content=__import__("json").dumps(response_data),
        media_type="application/json",
    )
    response.set_cookie(
        key="aa_session",
        value=token,
        httponly=True,
        secure=get_settings().is_production,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,  # 30 days
        path="/",
    )
    return response


# ─── Authentication ───

@router.post("/passkey/auth/begin")
async def auth_begin(request: Request, db: Session = Depends(get_db)):
    """Start passkey authentication. Returns challenge."""
    rp_id = _rp_id(request)

    credentials = db.query(WebAuthnCredential).all()
    if not credentials:
        raise HTTPException(status_code=400, detail="No passkeys registered. Set up first.")

    allow_credentials = [
        {"id": cred.credential_id, "type": "public-key"}
        for cred in credentials
    ]

    options = webauthn.generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allow_credentials,
        user_verification=UserVerificationRequirement.PREFERRED,
    )

    challenge_key = secrets.token_hex(16)
    _challenges[challenge_key] = options.challenge

    options_json = webauthn.options_to_json(options)

    return {
        "options": options_json,
        "challenge_key": challenge_key,
    }


class AuthCompleteRequest(BaseModel):
    challenge_key: str
    credential: str  # JSON string from navigator.credentials.get()

@router.post("/passkey/auth/complete")
async def auth_complete(body: AuthCompleteRequest, request: Request, db: Session = Depends(get_db)):
    """Complete passkey authentication."""
    challenge = _challenges.pop(body.challenge_key, None)
    if not challenge:
        raise HTTPException(status_code=400, detail="Challenge expired or invalid")

    rp_id = _rp_id(request)
    origin = _rp_origin(request)

    # Parse the credential to get the ID
    import json
    cred_data = json.loads(body.credential)
    raw_id = base64url_to_bytes(cred_data["rawId"])

    # Look up stored credential
    stored = db.query(WebAuthnCredential).filter(
        WebAuthnCredential.credential_id == raw_id
    ).first()

    if not stored:
        raise HTTPException(status_code=400, detail="Unknown credential")

    try:
        verification = webauthn.verify_authentication_response(
            credential=body.credential,
            expected_challenge=challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=stored.public_key,
            credential_current_sign_count=stored.sign_count,
        )
    except Exception as e:
        logger.error(f"Auth verification failed: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

    # Update sign count
    stored.sign_count = verification.new_sign_count
    db.commit()

    token = _create_session_token()

    response = Response(
        content=__import__("json").dumps({
            "authenticated": True,
            "device": stored.device_name,
        }),
        media_type="application/json",
    )
    response.set_cookie(
        key="aa_session",
        value=token,
        httponly=True,
        secure=get_settings().is_production,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return response


# ─── Backup code auth ───

class BackupCodeRequest(BaseModel):
    code: str

@router.post("/passkey/auth/backup")
async def auth_backup(body: BackupCodeRequest, db: Session = Depends(get_db)):
    """Authenticate with a backup code."""
    code_hash = _hash_code(body.code.strip())

    stored = db.query(BackupCode).filter(
        BackupCode.code_hash == code_hash,
        BackupCode.is_used == False,
    ).first()

    if not stored:
        raise HTTPException(status_code=401, detail="Invalid or already used backup code")

    # Mark as used
    stored.is_used = True
    stored.used_at = datetime.utcnow()
    db.commit()

    remaining = db.query(BackupCode).filter(BackupCode.is_used == False).count()

    token = _create_session_token()

    response = Response(
        content=__import__("json").dumps({
            "authenticated": True,
            "method": "backup_code",
            "remaining_codes": remaining,
        }),
        media_type="application/json",
    )
    response.set_cookie(
        key="aa_session",
        value=token,
        httponly=True,
        secure=get_settings().is_production,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return response


# ─── Session check ───

@router.get("/passkey/session")
async def check_session(session_token: Optional[str] = Cookie(None, alias="aa_session")):
    """Check if the current session is valid."""
    if not session_token:
        return {"authenticated": False}
    try:
        import jose.jwt as jwt
        settings = get_settings()
        payload = jwt.decode(session_token, settings.secret_key, algorithms=["HS256"])
        return {"authenticated": True, "sub": payload.get("sub")}
    except Exception:
        return {"authenticated": False}


# ─── Logout ───

@router.post("/passkey/logout")
async def logout():
    """Clear the session cookie."""
    response = Response(
        content=__import__("json").dumps({"logged_out": True}),
        media_type="application/json",
    )
    response.delete_cookie("aa_session", path="/")
    return response
