

import os
import json
import logging

logger = logging.getLogger(__name__)
import re
import io
import psycopg
from psycopg.rows import dict_row
import hashlib
import secrets
import uuid
import urllib.parse
import urllib.request
from urllib.error import HTTPError, URLError
from pathlib import Path
from datetime import date, datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from openpyxl import load_workbook
from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File, BackgroundTasks, Request
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pwdlib import PasswordHash
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey


load_dotenv(Path(__file__).with_name(".env"))

SECRET_KEY = os.getenv("SECRET_KEY")
ADMIN_KEY = os.getenv("ADMIN_KEY")
DISCORD_BOT_TOKEN = os.getenv("DISCORD_BOT_TOKEN")
DISCORD_PUBLIC_KEY = os.getenv("DISCORD_PUBLIC_KEY")

if not SECRET_KEY or not ADMIN_KEY:
    raise RuntimeError("SECRET_KEY and ADMIN_KEY must be set in backend/.env")


app = FastAPI(
    title="VEYRA Creator Network API",
    description="VEYRA creator accounts, profiles, invitations and performance data",
    version="1.5.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

password_hash = PasswordHash.recommended()

MANAGEMENT_FOUNDER_EMAIL = os.getenv(
    "MANAGEMENT_FOUNDER_EMAIL", ""
).strip().lower()

MANAGEMENT_FOUNDER_PASSWORD = os.getenv(
    "MANAGEMENT_FOUNDER_PASSWORD", ""
)

MANAGEMENT_FOUNDER_PASSWORD_HASH = (
    password_hash.hash(MANAGEMENT_FOUNDER_PASSWORD)
    if MANAGEMENT_FOUNDER_PASSWORD
    else None
)
security = HTTPBearer()

DATABASE_URL = os.getenv("DATABASE_URL")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_STORAGE_BUCKET = os.getenv(
    "SUPABASE_STORAGE_BUCKET",
    "profile-pictures"
)

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    )

MAX_UPLOAD_SIZE = 5 * 1024 * 1024

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

PERFORMANCE_COLUMNS = {
    "creator_username": "Creator's username",
    "followers": "Followers",
    "videos": "Videos",
    "likes": "Likes",
    "diamonds_l30d": "Diamonds in L30D",
    "valid_live_days_l30d": "Valid go LIVE days in L30D",
    "live_duration_l30d": "LIVE duration in L30D",
    "diamonds_from_fan_club_l30d": "Diamonds from Fan Club in L30D",
    "active_fan_club_members_l30d": "Active fans from Fan Club in L30D",
    "last_live": "Last LIVE",
    "tier_status": "Tier status",
    "tier_last_month": "Tier last month",
    "achieved_star_creator": "Achieved Star Creator",
    "star_creator_days_this_month": "Star Creator days this month",
}

EXCEL_HEADING_ALIASES = {
    "creator_username": [
        "Creator's username",
        "Creator username",
        "Username",
    ],
    "followers": ["Followers"],
    "videos": ["Videos", "Video posts"],
    "likes": ["Likes"],
    "diamonds_l30d": [
        "Diamonds in L30D",
        "Diamonds",
    ],
    "valid_live_days_l30d": [
        "Valid go LIVE days in L30D",
        "Valid LIVE days in L30D",
        "Valid live days in L30D",
    ],
    "live_duration_l30d": [
        "LIVE duration in L30D",
        "Live duration in L30D",
    ],
    "diamonds_from_fan_club_l30d": [
        "Diamonds from Fan Club in L30D",
        "Fan Club Diamonds in L30D",
        "Fan Club diamonds",
        "Diamonds from Fan Club",
        "Fanclub Diamonds",
        "Diamonds earned from Fan Club",
    ],
    "active_fan_club_members_l30d": [
        "Active fans from Fan Club in L30D",
        "Active Fan Club Fans in L30D",
        "Active fans in Fan Club",
        "Fan Club Fans",
        "Active Fan Club Members",
        "Active fans from Fan Club",
        "Fan Club Members",
    ],
    "last_live": ["Last LIVE", "Last Live"],
    "tier_status": ["Tier status", "Tier Status"],
    "tier_last_month": ["Tier last month", "Tier Last Month"],
    "achieved_star_creator": [
        "Achieved Star Creator",
        "Star Creator achieved",
    ],
    "star_creator_days_this_month": [
        "Star Creator days this month",
        "Star Creator Days This Month",
    ],
}

NUMERIC_COLUMNS = {
    "followers",
    "videos",
    "likes",
    "diamonds_l30d",
    "valid_live_days_l30d",
    "live_duration_l30d",
    "diamonds_from_fan_club_l30d",
    "active_fan_club_members_l30d",
    "tier_last_month",
    "star_creator_days_this_month",
}

TEXT_COLUMNS = {
    "last_live",
    "tier_status",
    "achieved_star_creator",
}



def connect_db():
    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
        prepare_threshold=None
    )


class RegisterRequest(BaseModel):
    invitation_code: str = Field(min_length=1, max_length=100)
    username: str = Field(min_length=1, max_length=50)

class LoginRequest(BaseModel):
    email: str
    password: str


class ManagementLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=1024)


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=50)


class AdminUsernameUpdateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)



class ManagementCampaignRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=10000)
    objective: str = Field(default="", max_length=5000)
    notes: str = Field(default="", max_length=10000)
    start_date: date | None = None
    end_date: date | None = None
    status: str = Field(default="draft", max_length=20)
    creator_ids: list[int] = Field(default_factory=list)


class ManagementAnnouncementRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    message: str = Field(min_length=1, max_length=5000)
    status: str = Field(default="draft", max_length=20)


class ManagementLiveChallengeRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=5000)
    instructions: str = Field(min_length=1, max_length=10000)
    reward: str | None = Field(default=None, max_length=500)
    start_date: date | None = None
    end_date: date | None = None
    status: str = Field(default="draft", max_length=20)

def hash_invitation(code: str) -> str:
    return hashlib.sha256(code.strip().encode()).hexdigest()


def normalise_username(username: str) -> str:
    return str(username).strip().lstrip("@").lower()


def valid_username(username: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9._]{1,50}", username))


def normalise_heading(value):
    return re.sub(
        r"[^a-z0-9]+",
        " ",
        str(value or "").lower()
    ).strip()


def find_excel_columns(headers):
    normalised_headers = {
        normalise_heading(header): index
        for index, header in enumerate(headers)
        if header
    }

    positions = {}

    for field, aliases in EXCEL_HEADING_ALIASES.items():
        for alias in aliases:
            key = normalise_heading(alias)

            if key in normalised_headers:
                positions[field] = normalised_headers[key]
                break

    return positions


def get_excel_value(row, positions, field):
    position = positions.get(field)

    if position is None or position >= len(row):
        return None

    return row[position]


def create_token(user_id: int):
    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(days=30),
    }

    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=["HS256"]
        )

        user_id = int(payload["sub"])

    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired login"
        )

    with connect_db() as db:
        user = db.execute(
            """
            SELECT id, email, username, display_name, profile_picture
            FROM users WHERE id = %s
            """,
            (user_id,)
        ).fetchone()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Account not found"
        )

    return dict(user)


def get_management_founder(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=["HS256"]
        )

        if payload.get("typ") != "management":
            raise HTTPException(
                status_code=401,
                detail="Invalid management login"
            )

        email = str(payload["sub"]).strip().lower()

    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired management login"
        )

    if (
        not MANAGEMENT_FOUNDER_EMAIL
        or not secrets.compare_digest(
            email, MANAGEMENT_FOUNDER_EMAIL
        )
    ):
        raise HTTPException(
            status_code=403,
            detail="Founder access denied"
        )

    return {"email": email}


@app.post("/management/auth/login")
def management_login(data: ManagementLoginRequest):
    if (
        not MANAGEMENT_FOUNDER_EMAIL
        or not MANAGEMENT_FOUNDER_PASSWORD_HASH
    ):
        raise HTTPException(
            status_code=503,
            detail="Founder login is not configured"
        )

    submitted_email = data.email.strip().lower()

    email_matches = secrets.compare_digest(
        submitted_email,
        MANAGEMENT_FOUNDER_EMAIL
    )

    password_matches = password_hash.verify(
        data.password,
        MANAGEMENT_FOUNDER_PASSWORD_HASH
    )

    if not email_matches or not password_matches:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password"
        )

    now = datetime.now(timezone.utc)

    token = jwt.encode(
        {
            "sub": MANAGEMENT_FOUNDER_EMAIL,
            "typ": "management",
            "iat": now,
            "exp": now + timedelta(hours=12),
        },
        SECRET_KEY,
        algorithm="HS256"
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "founder": {
            "email": MANAGEMENT_FOUNDER_EMAIL
        }
    }


@app.get("/management/auth/me")
def management_me(
    founder=Depends(get_management_founder)
):
    return {
        "authenticated": True,
        "founder": founder
    }


def check_admin(x_admin_key: str = Header(...)):
    if not secrets.compare_digest(x_admin_key, ADMIN_KEY):
        raise HTTPException(
            status_code=403,
            detail="Administrator access denied"
        )


def read_number(value, column_name):
    if value is None or isinstance(value, bool) or value == "":
        raise ValueError(
            f"Missing or invalid value in {column_name}"
        )

    if isinstance(value, str):
        value = value.replace(",", "").strip()

    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(
            f"Invalid number in {column_name}"
        )

    if not number >= 0 or number == float("inf"):
        raise ValueError(
            f"Invalid number in {column_name}"
        )

    if number.is_integer():
        return int(number)

    return number


def optional_number(value, column_name):
    if value is None or value == "":
        return None

    return read_number(value, column_name)


def optional_text(value):
    if value is None:
        return None

    text_value = str(value).strip()

    return text_value if text_value else None


@app.get("/")
def home():
    return {
        "message": "VEYRA backend is running",
        "status": "online"
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/admin/invitations")
def create_invitation(admin=Depends(check_admin)):
    code = secrets.token_urlsafe(12)

    with connect_db() as db:
        db.execute(
            """
            INSERT INTO invitations (code_hash, created_at)
            VALUES (%s, %s)
            """,
            (
                hash_invitation(code),
                datetime.now(timezone.utc).isoformat()
            )
        )

    return {
        "message": "Invitation created",
        "invitation_code": code
    }


def send_discord_invitation(application_id: str, interaction_token: str, discord_user_id: str):
    def update_interaction(message: str):
        url = (
            f"https://discord.com/api/v10/webhooks/"
            f"{application_id}/{interaction_token}/messages/@original"
        )
        body = json.dumps({"content": message}).encode()

        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "User-Agent": "DiscordBot (https://veyra-api-r8eq.onrender.com, 1.0)"},
            method="PATCH"
        )
        urllib.request.urlopen(req, timeout=10)

    try:
        if not DISCORD_BOT_TOKEN:
            raise RuntimeError("Discord bot token is not configured")

        code = secrets.token_urlsafe(12)

        with connect_db() as db:
            db.execute(
                """
                INSERT INTO invitations (code_hash, created_at)
                VALUES (%s, %s)
                """,
                (
                    hash_invitation(code),
                    datetime.now(timezone.utc).isoformat()
                )
            )

        dm_req = urllib.request.Request(
            "https://discord.com/api/v10/users/@me/channels",
            data=json.dumps({"recipient_id": discord_user_id}).encode(),
            headers={
                "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
                "User-Agent": "DiscordBot (https://veyra-api-r8eq.onrender.com, 1.0)",
                "Content-Type": "application/json"
            },
            method="POST"
        )

        with urllib.request.urlopen(dm_req, timeout=10) as response:
            dm_channel = json.loads(response.read().decode())

        message = {
            "embeds": [{
                "title": "VEYRA | Your Creator Invitation",
                "description": (
                    "Your VEYRA Creator Network invitation is ready.\n\n"
                    f"**Your invitation code:**\n```{code}```\n\n"
                    "Enter this code on the VEYRA registration screen "
                    "to activate your creator account."
                ),
                "color": 5793266,
                "footer": {"text": "VEYRA Creator Network"}
            }]
        }

        dm_req = urllib.request.Request(
            f"https://discord.com/api/v10/channels/{dm_channel['id']}/messages",
            data=json.dumps(message).encode(),
            headers={
                "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
                "User-Agent": "DiscordBot (https://veyra-api-r8eq.onrender.com, 1.0)",
                "Content-Type": "application/json"
            },
            method="POST"
        )

        urllib.request.urlopen(dm_req, timeout=10)

        update_interaction(
            "Success! Your VEYRA invitation code has been sent to your private messages."
        )

    except Exception:
        logger.exception('Discord invitation delivery failed')
        try:
            update_interaction(
                "I couldn't deliver your invitation. Please check that your "
                "server allows direct messages from members, then try again."
            )
        except Exception:
            pass


@app.post("/discord/interactions")
async def discord_interactions(
    request: Request,
    background_tasks: BackgroundTasks
):
    if not DISCORD_PUBLIC_KEY:
        return JSONResponse(
            status_code=500,
            content={"error": "Discord public key is not configured"}
        )

    signature = request.headers.get("x-signature-ed25519")
    timestamp = request.headers.get("x-signature-timestamp")

    if not signature or not timestamp:
        return JSONResponse(status_code=401, content={"error": "Invalid signature"})

    body = await request.body()

    try:
        verify_key = VerifyKey(bytes.fromhex(DISCORD_PUBLIC_KEY))
        verify_key.verify(
            timestamp.encode() + body,
            bytes.fromhex(signature)
        )
    except (BadSignatureError, ValueError):
        return JSONResponse(status_code=401, content={"error": "Invalid signature"})

    interaction = json.loads(body)

    if interaction.get("type") == 1:
        return JSONResponse(content={"type": 1})

    if interaction.get("type") != 3:
        return JSONResponse(status_code=400, content={"error": "Unsupported interaction"})

    if interaction.get("data", {}).get("custom_id") != "veyra_get_invite":
        return JSONResponse(status_code=400, content={"error": "Unknown button"})

    user = (
        interaction.get("member", {}).get("user")
        or interaction.get("user")
    )

    if not user or not user.get("id"):
        return JSONResponse(status_code=400, content={"error": "User not found"})

    background_tasks.add_task(
        send_discord_invitation,
        interaction["application_id"],
        interaction["token"],
        user["id"]
    )

    return JSONResponse(
        content={
            "type": 5,
            "data": {"flags": 64}
        }
    )





MANAGEMENT_CAMPAIGN_STATUSES = {
    "draft",
    "scheduled",
    "active",
    "completed",
    "cancelled",
}


def _validate_management_campaign(data):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Campaign name is required")

    if data.status not in MANAGEMENT_CAMPAIGN_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid campaign status")

    if data.start_date and data.end_date and data.end_date < data.start_date:
        raise HTTPException(
            status_code=422,
            detail="Campaign end date cannot be before its start date"
        )

    creator_ids = list(dict.fromkeys(data.creator_ids))
    if any(user_id <= 0 for user_id in creator_ids):
        raise HTTPException(status_code=422, detail="Invalid creator ID")

    return name, creator_ids


def _replace_management_campaign_creators(db, campaign_id, creator_ids):
    if not creator_ids:
        db.execute(
            "DELETE FROM management_campaign_creators WHERE campaign_id = %s",
            (campaign_id,)
        )
        return

    found = db.execute(
        "SELECT id FROM users WHERE id = ANY(%s)",
        (creator_ids,)
    ).fetchall()

    found_ids = {row["id"] for row in found}
    missing_ids = [user_id for user_id in creator_ids if user_id not in found_ids]

    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail={"message": "One or more creators were not found", "creator_ids": missing_ids}
        )

    db.execute(
        "DELETE FROM management_campaign_creators WHERE campaign_id = %s",
        (campaign_id,)
    )

    db.executemany(
        """
        INSERT INTO management_campaign_creators (campaign_id, user_id)
        VALUES (%s, %s)
        """,
        [(campaign_id, user_id) for user_id in creator_ids]
    )


@app.get("/management/campaigns")
def management_list_campaigns(
    founder=Depends(get_management_founder)
):
    with connect_db() as db:
        campaigns = db.execute(
            """
            SELECT
                c.id,
                c.name,
                c.description,
                c.objective,
                c.notes,
                c.start_date,
                c.end_date,
                c.status,
                c.campaign_type,
                c.backstage_status,
                c.created_by,
                c.created_at,
                c.updated_at,
                COUNT(cc.user_id)::INTEGER AS creator_count,
                COALESCE(
                    array_agg(cc.user_id) FILTER (WHERE cc.user_id IS NOT NULL),
                    ARRAY[]::BIGINT[]
                ) AS creator_ids
            FROM management_campaigns c
            LEFT JOIN management_campaign_creators cc
                ON cc.campaign_id = c.id
            GROUP BY c.id
            ORDER BY c.updated_at DESC, c.id DESC
            """
        ).fetchall()

    return {
        "total": len(campaigns),
        "campaigns": [dict(campaign) for campaign in campaigns]
    }


@app.post("/management/campaigns", status_code=201)
def management_create_campaign(
    data: ManagementCampaignRequest,
    founder=Depends(get_management_founder)
):
    name, creator_ids = _validate_management_campaign(data)

    with connect_db() as db:
        row = db.execute(
            """
            INSERT INTO management_campaigns (
                name, description, objective, notes,
                start_date, end_date, status, created_by
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                name,
                data.description,
                data.objective,
                data.notes,
                data.start_date,
                data.end_date,
                data.status,
                founder["email"]
            )
        ).fetchone()

        campaign_id = row["id"]
        _replace_management_campaign_creators(db, campaign_id, creator_ids)

    if data.status == "active" and creator_ids:
        send_creator_push_notifications(
            creator_ids,
            "campaigns",
            f"campaign-published-{campaign_id}",
            "New campaign available",
            f"You have been assigned to {name}.",
            "/"
        )

    return {
        "message": "Campaign created successfully",
        "campaign_id": campaign_id
    }


@app.get("/management/campaigns/{campaign_id}")
def management_get_campaign(
    campaign_id: int,
    founder=Depends(get_management_founder)
):
    with connect_db() as db:
        campaign = db.execute(
            """
            SELECT
                id, name, description, objective, notes,
                start_date, end_date, status,
                campaign_type, backstage_status, created_by,
                created_at, updated_at
            FROM management_campaigns
            WHERE id = %s
            """,
            (campaign_id,)
        ).fetchone()

        if not campaign:
            raise HTTPException(status_code=404, detail="Campaign not found")

        creators = db.execute(
            """
            SELECT u.id, u.username, u.display_name, u.email, u.profile_picture
            FROM management_campaign_creators cc
            JOIN users u ON u.id = cc.user_id
            WHERE cc.campaign_id = %s
            ORDER BY u.username
            """,
            (campaign_id,)
        ).fetchall()

    return {
        "campaign": dict(campaign),
        "creators": [dict(creator) for creator in creators]
    }


@app.put("/management/campaigns/{campaign_id}")
def management_update_campaign(
    campaign_id: int,
    data: ManagementCampaignRequest,
    founder=Depends(get_management_founder)
):
    name, creator_ids = _validate_management_campaign(data)

    with connect_db() as db:
        existing = db.execute(
            "SELECT id, status FROM management_campaigns WHERE id = %s FOR UPDATE",
            (campaign_id,)
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="Campaign not found")

        old_creator_rows = db.execute(
            """
            SELECT user_id
            FROM management_campaign_creators
            WHERE campaign_id = %s
            """,
            (campaign_id,)
        ).fetchall()
        old_creator_ids = {row["user_id"] for row in old_creator_rows}

        db.execute(
            """
            UPDATE management_campaigns
            SET
                name = %s,
                description = %s,
                objective = %s,
                notes = %s,
                start_date = %s,
                end_date = %s,
                status = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (
                name,
                data.description,
                data.objective,
                data.notes,
                data.start_date,
                data.end_date,
                data.status,
                campaign_id
            )
        )

        _replace_management_campaign_creators(db, campaign_id, creator_ids)

    if data.status == "active":
        if existing["status"] != "active":
            send_creator_push_notifications(
                creator_ids,
                "campaigns",
                f"campaign-activated-{campaign_id}",
                "New campaign available",
                f"{name} is now active and available to you.",
                "/"
            )
        else:
            newly_assigned = set(creator_ids) - old_creator_ids
            for creator_id in newly_assigned:
                send_creator_push_notifications(
                    [creator_id],
                    "campaigns",
                    f"campaign-assigned-{campaign_id}-{creator_id}",
                    "New campaign assignment",
                    f"You have been assigned to {name}.",
                    "/"
                )

    return {
        "message": "Campaign updated successfully",
        "campaign_id": campaign_id
    }


@app.put("/management/campaigns/{campaign_id}/creators")
def management_replace_campaign_creators(
    campaign_id: int,
    creator_ids: list[int],
    founder=Depends(get_management_founder)
):
    creator_ids = list(dict.fromkeys(creator_ids))

    if any(user_id <= 0 for user_id in creator_ids):
        raise HTTPException(status_code=422, detail="Invalid creator ID")

    with connect_db() as db:
        existing = db.execute(
            "SELECT id, status FROM management_campaigns WHERE id = %s FOR UPDATE",
            (campaign_id,)
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="Campaign not found")

        old_creator_rows = db.execute(
            """
            SELECT user_id
            FROM management_campaign_creators
            WHERE campaign_id = %s
            """,
            (campaign_id,)
        ).fetchall()
        old_creator_ids = {row["user_id"] for row in old_creator_rows}

        _replace_management_campaign_creators(db, campaign_id, creator_ids)

    if existing["status"] == "active":
        newly_assigned = set(creator_ids) - old_creator_ids
        for creator_id in newly_assigned:
            send_creator_push_notifications(
                [creator_id],
                "campaigns",
                f"campaign-assigned-{campaign_id}-{creator_id}",
                "New campaign assignment",
                "You have been assigned to a new campaign.",
                "/"
            )

    return {
        "message": "Campaign creator assignments updated",
        "campaign_id": campaign_id,
        "assigned_creators": len(creator_ids)
    }


@app.delete("/management/campaigns/{campaign_id}")
def management_delete_campaign(
    campaign_id: int,
    founder=Depends(get_management_founder)
):
    with connect_db() as db:
        existing = db.execute(
            "SELECT id FROM management_campaigns WHERE id = %s FOR UPDATE",
            (campaign_id,)
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="Campaign not found")

        db.execute(
            "DELETE FROM management_campaign_creators WHERE campaign_id = %s",
            (campaign_id,)
        )

        db.execute(
            "DELETE FROM management_campaigns WHERE id = %s",
            (campaign_id,)
        )

    return {
        "message": "Campaign permanently deleted",
        "campaign_id": campaign_id
    }



def ensure_management_announcements_table(db):
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS management_announcements (
            id BIGSERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published')),
            created_by TEXT,
            published_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    db.execute(
        """
        CREATE INDEX IF NOT EXISTS
            management_announcements_status_published_idx
        ON management_announcements (status, published_at DESC)
        """
    )


def validate_management_announcement(data):
    title = data.title.strip()
    message = data.message.strip()
    status = data.status.strip().lower()

    if not title:
        raise HTTPException(status_code=422, detail="Announcement title is required")
    if not message:
        raise HTTPException(status_code=422, detail="Announcement message is required")
    if status not in ("draft", "published"):
        raise HTTPException(
            status_code=422,
            detail="Announcement status must be draft or published"
        )

    return title, message, status



# ============================================================
def ensure_management_live_challenges_table(db):
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS management_live_challenges (
            id BIGSERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            instructions TEXT NOT NULL,
            reward TEXT,
            start_date DATE,
            end_date DATE,
            status TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published')),
            created_by TEXT,
            published_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (
                start_date IS NULL
                OR end_date IS NULL
                OR end_date >= start_date
            )
        )
        """
    )
    db.execute(
        """
        CREATE INDEX IF NOT EXISTS
            management_live_challenges_status_idx
        ON management_live_challenges (status, end_date)
        """
    )


def validate_management_live_challenge(data):
    title = data.title.strip()
    description = data.description.strip()
    instructions = data.instructions.strip()
    reward = (data.reward or "").strip() or None
    status = data.status.strip().lower()

    if not title:
        raise HTTPException(status_code=422, detail="Challenge title is required")
    if not description:
        raise HTTPException(status_code=422, detail="Challenge description is required")
    if not instructions:
        raise HTTPException(status_code=422, detail="Challenge instructions are required")
    if status not in ("draft", "published"):
        raise HTTPException(
            status_code=422,
            detail="Challenge status must be draft or published"
        )
    if data.start_date and data.end_date and data.end_date < data.start_date:
        raise HTTPException(
            status_code=422,
            detail="Challenge end date cannot be before its start date"
        )

    return (
        title,
        description,
        instructions,
        reward,
        data.start_date,
        data.end_date,
        status,
    )

# VEYRA WEB PUSH NOTIFICATIONS
# ============================================================

NOTIFICATION_CATEGORIES = (
    "campaigns",
    "announcements",
    "reminders",
    "account",
)


class NotificationPreferencesRequest(BaseModel):
    campaigns: bool = True
    announcements: bool = True
    reminders: bool = True
    account: bool = True


class NotificationSubscriptionRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=3000)
    keys: dict = Field()


class NotificationUnsubscribeRequest(BaseModel):
    endpoint: str = Field(min_length=1, max_length=3000)


def ensure_notifications_tables(db):
    db.execute("""
        CREATE TABLE IF NOT EXISTS notification_preferences (
            user_id BIGINT PRIMARY KEY,
            campaigns BOOLEAN NOT NULL DEFAULT TRUE,
            announcements BOOLEAN NOT NULL DEFAULT TRUE,
            reminders BOOLEAN NOT NULL DEFAULT TRUE,
            account BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS push_subscriptions (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            endpoint TEXT NOT NULL UNIQUE,
            key_p256dh TEXT NOT NULL,
            key_auth TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    db.execute("""
        CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
        ON push_subscriptions(user_id)
    """)

    db.execute("""
        CREATE TABLE IF NOT EXISTS notification_deliveries (
            id BIGSERIAL PRIMARY KEY,
            event_key TEXT NOT NULL,
            subscription_id BIGINT NOT NULL
                REFERENCES push_subscriptions(id) ON DELETE CASCADE,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(event_key, subscription_id)
        )
    """)


def send_creator_push_notifications(
    user_ids,
    category,
    event_key,
    title,
    message,
    target_url="/"
):
    if category not in NOTIFICATION_CATEGORIES:
        logger.error("Rejected invalid notification category")
        return

    private_key = os.getenv("VAPID_PRIVATE_KEY")
    subject = os.getenv("VAPID_SUBJECT", "mailto:support@veyra.app")

    if not private_key:
        logger.warning("Push delivery skipped: VAPID_PRIVATE_KEY is not configured")
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.exception("Push delivery skipped: pywebpush is unavailable")
        return

    for user_id in set(user_ids):
        with connect_db() as db:
            ensure_notifications_tables(db)

            preference = db.execute(
                f"SELECT {category} FROM notification_preferences WHERE user_id = %s",
                (user_id,)
            ).fetchone()

            if preference and not preference[category]:
                continue

            subscriptions = db.execute(
                """
                SELECT id, endpoint, key_p256dh, key_auth
                FROM push_subscriptions
                WHERE user_id = %s
                """,
                (user_id,)
            ).fetchall()

            for subscription in subscriptions:
                reservation = db.execute(
                    """
                    INSERT INTO notification_deliveries (
                        event_key, subscription_id, status
                    )
                    VALUES (%s, %s, 'pending')
                    ON CONFLICT (event_key, subscription_id)
                    DO UPDATE SET
                        status = 'pending',
                        updated_at = NOW()
                    WHERE notification_deliveries.status = 'failed'
                    RETURNING id
                    """,
                    (event_key, subscription["id"])
                ).fetchone()

                if not reservation:
                    continue

                try:
                    webpush(
                        subscription_info={
                            "endpoint": subscription["endpoint"],
                            "keys": {
                                "p256dh": subscription["key_p256dh"],
                                "auth": subscription["key_auth"],
                            },
                        },
                        data=json.dumps({
                            "title": title,
                            "body": message,
                            "category": category,
                            "url": (
                                target_url
                                if target_url and target_url != "/"
                                else "/?veyra_tab=Events"
                                if category in ("campaigns", "announcements")
                                else "/?veyra_tab=Profile"
                            ),
                            "tag": event_key,
                        }),
                        vapid_private_key=private_key,
                        vapid_claims={"sub": subject},
                    )

                    db.execute(
                        """
                        UPDATE notification_deliveries
                        SET status = 'sent', updated_at = NOW()
                        WHERE id = %s
                        """,
                        (reservation["id"],)
                    )

                except WebPushException as exc:
                    status_code = getattr(
                        getattr(exc, "response", None),
                        "status_code",
                        None
                    )

                    if status_code in (404, 410):
                        db.execute(
                            "DELETE FROM push_subscriptions WHERE id = %s",
                            (subscription["id"],)
                        )
                    else:
                        logger.warning(
                            "Push delivery failed for subscription %s",
                            subscription["id"]
                        )
                        db.execute(
                            """
                            UPDATE notification_deliveries
                            SET status = 'failed', updated_at = NOW()
                            WHERE id = %s
                            """,
                            (reservation["id"],)
                        )

                except Exception:
                    logger.exception(
                        "Unexpected push delivery failure for subscription %s",
                        subscription["id"]
                    )
                    db.execute(
                        """
                        UPDATE notification_deliveries
                        SET status = 'failed', updated_at = NOW()
                        WHERE id = %s
                        """,
                        (reservation["id"],)
                    )


@app.get("/notifications/public-key")
def notification_public_key(user=Depends(get_current_user)):
    public_key = os.getenv("VAPID_PUBLIC_KEY")

    if not public_key:
        raise HTTPException(
            status_code=503,
            detail="Notifications are not configured yet"
        )

    return {"public_key": public_key}


@app.get("/notifications/preferences")
def get_notification_preferences(user=Depends(get_current_user)):
    with connect_db() as db:
        ensure_notifications_tables(db)

        db.execute(
            """
            INSERT INTO notification_preferences (user_id)
            VALUES (%s)
            ON CONFLICT (user_id) DO NOTHING
            """,
            (user["id"],)
        )

        preferences = db.execute(
            """
            SELECT campaigns, announcements, reminders, account
            FROM notification_preferences
            WHERE user_id = %s
            """,
            (user["id"],)
        ).fetchone()

        subscription = db.execute(
            """
            SELECT COUNT(*) AS total
            FROM push_subscriptions
            WHERE user_id = %s
            """,
            (user["id"],)
        ).fetchone()

    return {
        "preferences": dict(preferences),
        "subscribed": subscription["total"] > 0,
        "subscription_count": subscription["total"],
    }


@app.put("/notifications/preferences")
def update_notification_preferences(
    data: NotificationPreferencesRequest,
    user=Depends(get_current_user)
):
    with connect_db() as db:
        ensure_notifications_tables(db)

        db.execute(
            """
            INSERT INTO notification_preferences (
                user_id, campaigns, announcements, reminders, account
            )
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE SET
                campaigns = EXCLUDED.campaigns,
                announcements = EXCLUDED.announcements,
                reminders = EXCLUDED.reminders,
                account = EXCLUDED.account,
                updated_at = NOW()
            """,
            (
                user["id"],
                data.campaigns,
                data.announcements,
                data.reminders,
                data.account,
            )
        )

    return {
        "message": "Notification preferences saved",
        "preferences": data.model_dump(),
    }


@app.post("/notifications/subscribe")
def subscribe_to_notifications(
    data: NotificationSubscriptionRequest,
    user=Depends(get_current_user)
):
    endpoint = data.endpoint.strip()
    keys = data.keys

    if not endpoint.startswith("https://"):
        raise HTTPException(status_code=422, detail="Invalid push endpoint")

    p256dh = keys.get("p256dh")
    auth = keys.get("auth")

    if not isinstance(p256dh, str) or not isinstance(auth, str):
        raise HTTPException(status_code=422, detail="Invalid subscription keys")

    if not p256dh or not auth or len(p256dh) > 500 or len(auth) > 500:
        raise HTTPException(status_code=422, detail="Invalid subscription keys")

    with connect_db() as db:
        ensure_notifications_tables(db)

        db.execute(
            """
            INSERT INTO push_subscriptions (
                user_id, endpoint, key_p256dh, key_auth
            )
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (endpoint) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                key_p256dh = EXCLUDED.key_p256dh,
                key_auth = EXCLUDED.key_auth,
                updated_at = NOW()
            """,
            (user["id"], endpoint, p256dh, auth)
        )

        db.execute(
            """
            INSERT INTO notification_preferences (user_id)
            VALUES (%s)
            ON CONFLICT (user_id) DO NOTHING
            """,
            (user["id"],)
        )

    return {"message": "Notifications enabled successfully"}


@app.delete("/notifications/subscribe")
def unsubscribe_from_notifications(
    data: NotificationUnsubscribeRequest,
    user=Depends(get_current_user)
):
    with connect_db() as db:
        ensure_notifications_tables(db)

        db.execute(
            """
            DELETE FROM push_subscriptions
            WHERE user_id = %s AND endpoint = %s
            """,
            (user["id"], data.endpoint.strip())
        )

        remaining = db.execute(
            """
            SELECT COUNT(*) AS total
            FROM push_subscriptions
            WHERE user_id = %s
            """,
            (user["id"],)
        ).fetchone()

    return {
        "message": "Device notification subscription removed",
        "remaining_devices": remaining["total"],
    }
@app.get("/management/live-challenges")
def management_list_live_challenges(
    founder=Depends(get_management_founder)
):
    with connect_db() as db:
        ensure_management_live_challenges_table(db)
        challenges = db.execute(
            """
            SELECT
                id, title, description, instructions, reward,
                start_date, end_date, status,
                CASE
                    WHEN status = 'published'
                         AND end_date < CURRENT_DATE THEN 'ended'
                    ELSE status
                END AS display_status,
                created_by, published_at, created_at, updated_at
            FROM management_live_challenges
            ORDER BY updated_at DESC, id DESC
            """
        ).fetchall()

    return {
        "total": len(challenges),
        "challenges": [dict(item) for item in challenges]
    }


@app.post("/management/live-challenges", status_code=201)
def management_create_live_challenge(
    data: ManagementLiveChallengeRequest,
    founder=Depends(get_management_founder)
):
    (
        title, description, instructions, reward,
        start_date, end_date, status
    ) = validate_management_live_challenge(data)

    with connect_db() as db:
        ensure_management_live_challenges_table(db)
        challenge = db.execute(
            """
            INSERT INTO management_live_challenges (
                title, description, instructions, reward,
                start_date, end_date, status, created_by, published_at
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s,
                CASE WHEN %s = 'published' THEN NOW() ELSE NULL END
            )
            RETURNING
                id, title, description, instructions, reward,
                start_date, end_date, status, created_by,
                published_at, created_at, updated_at
            """,
            (
                title, description, instructions, reward,
                start_date, end_date, status, founder["email"], status
            )
        ).fetchone()

    return {
        "message": "Live challenge created successfully",
        "challenge": dict(challenge)
    }


@app.put("/management/live-challenges/{challenge_id}")
def management_update_live_challenge(
    challenge_id: int,
    data: ManagementLiveChallengeRequest,
    founder=Depends(get_management_founder)
):
    (
        title, description, instructions, reward,
        start_date, end_date, status
    ) = validate_management_live_challenge(data)

    with connect_db() as db:
        ensure_management_live_challenges_table(db)
        existing = db.execute(
            """
            SELECT id
            FROM management_live_challenges
            WHERE id = %s
            FOR UPDATE
            """,
            (challenge_id,)
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="Live challenge not found")

        challenge = db.execute(
            """
            UPDATE management_live_challenges
            SET
                title = %s,
                description = %s,
                instructions = %s,
                reward = %s,
                start_date = %s,
                end_date = %s,
                status = %s,
                published_at = CASE
                    WHEN %s = 'draft' THEN NULL
                    WHEN published_at IS NULL THEN NOW()
                    ELSE published_at
                END,
                updated_at = NOW()
            WHERE id = %s
            RETURNING
                id, title, description, instructions, reward,
                start_date, end_date, status, created_by,
                published_at, created_at, updated_at
            """,
            (
                title, description, instructions, reward,
                start_date, end_date, status, status, challenge_id
            )
        ).fetchone()

    return {
        "message": "Live challenge updated successfully",
        "challenge": dict(challenge)
    }


@app.delete("/management/live-challenges/{challenge_id}")
def management_delete_live_challenge(
    challenge_id: int,
    founder=Depends(get_management_founder)
):
    with connect_db() as db:
        ensure_management_live_challenges_table(db)
        deleted = db.execute(
            """
            DELETE FROM management_live_challenges
            WHERE id = %s
            RETURNING id
            """,
            (challenge_id,)
        ).fetchone()

        if not deleted:
            raise HTTPException(status_code=404, detail="Live challenge not found")

    return {
        "message": "Live challenge permanently deleted",
        "challenge_id": challenge_id
    }

@app.get("/management/announcements")
def management_list_announcements(
    founder=Depends(get_management_founder)
):
    with connect_db() as db:
        ensure_management_announcements_table(db)
        announcements = db.execute(
            """
            SELECT id, title, message, status, created_by,
                   published_at, created_at, updated_at
            FROM management_announcements
            ORDER BY updated_at DESC, id DESC
            """
        ).fetchall()

    return {
        "total": len(announcements),
        "announcements": [dict(item) for item in announcements]
    }


@app.post("/management/announcements", status_code=201)
def management_create_announcement(
    data: ManagementAnnouncementRequest,
    founder=Depends(get_management_founder)
):
    title, message, status = validate_management_announcement(data)

    with connect_db() as db:
        ensure_management_announcements_table(db)
        announcement = db.execute(
            """
            INSERT INTO management_announcements (
                title, message, status, created_by, published_at
            )
            VALUES (
                %s, %s, %s, %s,
                CASE WHEN %s = 'published' THEN NOW() ELSE NULL END
            )
            RETURNING id, title, message, status, created_by,
                      published_at, created_at, updated_at
            """,
            (title, message, status, founder["email"], status)
        ).fetchone()

        subscribed_user_rows = []
        if status == "published":
            subscribed_user_rows = db.execute(
                """
                SELECT DISTINCT user_id
                FROM push_subscriptions
                """
            ).fetchall()

        subscribed_user_ids = [
            row["user_id"] for row in subscribed_user_rows
        ]

    if status == "published":
        send_creator_push_notifications(
            subscribed_user_ids,
            "announcements",
            f"announcement-published-{announcement['id']}",
            announcement["title"],
            announcement["message"][:250],
            "/"
        )

    return {
        "message": "Announcement created successfully",
        "announcement": dict(announcement)
    }


@app.put("/management/announcements/{announcement_id}")
def management_update_announcement(
    announcement_id: int,
    data: ManagementAnnouncementRequest,
    founder=Depends(get_management_founder)
):
    title, message, status = validate_management_announcement(data)

    with connect_db() as db:
        ensure_management_announcements_table(db)
        existing = db.execute(
            """
            SELECT id, published_at
            FROM management_announcements
            WHERE id = %s
            FOR UPDATE
            """,
            (announcement_id,)
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="Announcement not found")

        newly_published = (
            existing["published_at"] is None and status == "published"
        )

        announcement = db.execute(
            """
            UPDATE management_announcements
            SET
                title = %s,
                message = %s,
                status = %s,
                published_at = CASE
                    WHEN %s = 'draft' THEN NULL
                    WHEN published_at IS NULL THEN NOW()
                    ELSE published_at
                END,
                updated_at = NOW()
            WHERE id = %s
            RETURNING id, title, message, status, created_by,
                      published_at, created_at, updated_at
            """,
            (title, message, status, status, announcement_id)
        ).fetchone()

        subscribed_user_ids = []
        if newly_published:
            subscribed_user_rows = db.execute(
                """
                SELECT DISTINCT user_id
                FROM push_subscriptions
                """
            ).fetchall()

            subscribed_user_ids = [
                row["user_id"] for row in subscribed_user_rows
            ]

    if newly_published:
        send_creator_push_notifications(
            subscribed_user_ids,
            "announcements",
            f"announcement-published-{announcement['id']}",
            announcement["title"],
            announcement["message"][:250],
            "/"
        )

    return {
        "message": "Announcement updated successfully",
        "announcement": dict(announcement)
    }


@app.delete("/management/announcements/{announcement_id}")
def management_delete_announcement(
    announcement_id: int,
    founder=Depends(get_management_founder)
):
    with connect_db() as db:
        ensure_management_announcements_table(db)
        deleted = db.execute(
            """
            DELETE FROM management_announcements
            WHERE id = %s
            RETURNING id
            """,
            (announcement_id,)
        ).fetchone()

        if not deleted:
            raise HTTPException(status_code=404, detail="Announcement not found")

    return {
        "message": "Announcement permanently deleted",
        "announcement_id": announcement_id
    }

@app.get("/management/creators")
def management_list_creators(
    founder=Depends(get_management_founder)
):
    with connect_db() as db:
        creators = db.execute(
            """
            SELECT
                u.id,
                u.email,
                u.username,
                u.display_name,
                u.profile_picture,
                p.followers,
                p.videos,
                p.likes,
                p.diamonds_l30d,
                p.valid_live_days_l30d,
                p.live_duration_l30d,
                p.imported_at
            FROM users u
            LEFT JOIN backstage_performance p
                ON p.normalised_username = lower(ltrim(u.username, '@'))
            ORDER BY u.id DESC
            """
        ).fetchall()

    return {
        "total": len(creators),
        "creators": [dict(creator) for creator in creators]
    }

@app.get("/management/performance")
def management_performance(
    founder=Depends(get_management_founder)
):
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT
                u.id,
                u.email,
                u.username,
                u.display_name,
                p.followers,
                p.videos,
                p.likes,
                p.diamonds_l30d,
                p.valid_live_days_l30d,
                p.live_duration_l30d,
                p.diamonds_from_fan_club_l30d,
                p.active_fan_club_members_l30d,
                p.last_live,
                p.tier_status,
                p.tier_last_month,
                p.achieved_star_creator,
                p.star_creator_days_this_month,
                p.imported_at
            FROM users u
            LEFT JOIN backstage_performance p
                ON p.normalised_username = lower(ltrim(u.username, '@'))
            ORDER BY u.id DESC
            """
        ).fetchall()

    creators = [dict(row) for row in rows]

    metric_fields = (
        "followers",
        "videos",
        "likes",
        "diamonds_l30d",
        "valid_live_days_l30d",
        "live_duration_l30d",
        "diamonds_from_fan_club_l30d",
        "active_fan_club_members_l30d",
    )

    totals = {
        field: sum(
            (creator.get(field) or 0) for creator in creators
        )
        for field in metric_fields
    }

    with_performance = sum(
        1 for creator in creators
        if creator.get("imported_at") is not None
    )

    return {
        "total_creators": len(creators),
        "creators_with_performance": with_performance,
        "creators_without_performance": len(creators) - with_performance,
        "totals": totals,
        "creators": creators,
    }

@app.get("/admin/users")
def admin_list_users(admin=Depends(check_admin)):
    with connect_db() as db:
        users = db.execute(
            """
            SELECT id, email, username, display_name
            FROM users
            ORDER BY id
            """
        ).fetchall()

    return {
        "users": [dict(user) for user in users]
    }


@app.patch("/admin/users/{user_id}/username")
def admin_update_username(
    user_id: int,
    data: AdminUsernameUpdateRequest,
    admin=Depends(check_admin)
):
    username = data.username.strip().lstrip("@")

    if not valid_username(username):
        raise HTTPException(
            status_code=400,
            detail="Invalid TikTok username"
        )

    normalised = normalise_username(username)

    with connect_db() as db:
        existing_user = db.execute(
            "SELECT id, username FROM users WHERE id = %s",
            (user_id,)
        ).fetchone()

        if not existing_user:
            raise HTTPException(
                status_code=404,
                detail="Creator account not found"
            )

        duplicate = db.execute(
            """
            SELECT id FROM users
            WHERE lower(username) = %s AND id != %s
            """,
            (normalised, user_id)
        ).fetchone()

        if duplicate:
            raise HTTPException(
                status_code=409,
                detail="That TikTok username is already assigned to another account"
            )

        db.execute(
            "UPDATE users SET username = %s WHERE id = %s",
            (username, user_id)
        )

        performance = db.execute(
            """
            SELECT creator_username
            FROM backstage_performance
            WHERE normalised_username = %s
            """,
            (normalised,)
        ).fetchone()

        updated_user = db.execute(
            """
            SELECT id, email, username, display_name, profile_picture
            FROM users WHERE id = %s
            """,
            (user_id,)
        ).fetchone()

    if existing_user["username"] != username:
        try:
            import uuid
            send_creator_push_notifications(
                [user_id],
                "account",
                f"account-username-updated-{user_id}-{uuid.uuid4().hex}",
                "Account details updated",
                f"Your TikTok username has been updated to @{username}.",
                target_url="/?veyra_tab=Profile",
            )
        except Exception as exc:
            print(f"VEYRA account notification failed: {exc}")

    return {
        "message": "TikTok username updated successfully",
        "user": dict(updated_user),
        "performance_available": performance is not None
    }


async def _process_backstage_import(file: UploadFile):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=400,
            detail="Please upload an Excel .xlsx file"
        )

    contents = await file.read()

    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail="File is too large. Maximum size is 10 MB"
        )

    try:
        workbook = load_workbook(
            io.BytesIO(contents),
            data_only=True
        )
        sheet = workbook.active

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file could not be read"
        )

    # Find the heading row.
    header_row = 2

    def read_headers(row_number):
        return [
            str(cell).strip() if cell is not None else ""
            for cell in next(
                sheet.iter_rows(
                    min_row=row_number,
                    max_row=row_number,
                    values_only=True
                ),
                ()
            )
        ]

    headers = read_headers(header_row)
    column_positions = find_excel_columns(headers)

    # Try row 1 if the headings are not on row 2.
    if "creator_username" not in column_positions:
        alternative_headers = read_headers(1)
        alternative_positions = find_excel_columns(
            alternative_headers
        )

        if "creator_username" in alternative_positions:
            header_row = 1
            headers = alternative_headers
            column_positions = alternative_positions

    required_fields = [
        "creator_username",
        "followers",
        "likes",
        "diamonds_l30d",
        "valid_live_days_l30d",
        "live_duration_l30d",
    ]

    missing = [
        field for field in required_fields
        if field not in column_positions
    ]

    if missing:
        workbook.close()

        raise HTTPException(
            status_code=400,
            detail={
                "message": "Required Excel columns could not be identified",
                "missing_fields": missing,
                "available_headings": headers,
            }
        )

    # The first data row is immediately after the heading row.
    data_start_row = header_row + 1

    fan_club_columns_found = {
        "diamonds_from_fan_club_l30d":
            "diamonds_from_fan_club_l30d" in column_positions,
        "active_fan_club_members_l30d":
            "active_fan_club_members_l30d" in column_positions,
    }

    with connect_db() as db:
        registered_users = db.execute(
            "SELECT id, username FROM users"
        ).fetchall()

        user_lookup = {
            normalise_username(row["username"]): row["id"]
            for row in registered_users
        }

        imported = 0
        matched = 0
        unmatched = []
        invalid_rows = []

        import_time = datetime.now(timezone.utc).isoformat()

        for row_number, row in enumerate(
            sheet.iter_rows(
                min_row=data_start_row + 1,
                values_only=True
            ),
            start=data_start_row + 1
        ):
            if not row or all(value is None for value in row):
                continue

            try:
                raw_username = get_excel_value(
                    row,
                    column_positions,
                    "creator_username"
                )

                if raw_username is None:
                    raise ValueError("Missing creator username")

                username = str(raw_username).strip().lstrip("@")

                if not username:
                    raise ValueError("Missing creator username")

                normalised = normalise_username(username)

                values = {}

                for field in (
                    "followers",
                    "likes",
                    "diamonds_l30d",
                    "valid_live_days_l30d",
                    "live_duration_l30d",
                ):
                    raw_value = get_excel_value(
                        row,
                        column_positions,
                        field
                    )

                    values[field] = read_number(
                        raw_value,
                        PERFORMANCE_COLUMNS[field]
                    )

                # Import additional numeric metrics.
                for field in (
                    "videos",
                    "diamonds_from_fan_club_l30d",
                    "active_fan_club_members_l30d",
                    "tier_last_month",
                    "star_creator_days_this_month",
                ):
                    raw_value = get_excel_value(
                        row,
                        column_positions,
                        field
                    )

                    values[field] = optional_number(
                        raw_value,
                        field
                    )

                # Import additional text metrics.
                for field in TEXT_COLUMNS:
                    raw_value = get_excel_value(
                        row,
                        column_positions,
                        field
                    )

                    values[field] = optional_text(raw_value)

                # Save or update the creator's latest Backstage data.
                db.execute(
                    """
                    INSERT INTO backstage_performance (
                        creator_username,
                        normalised_username,
                        followers,
                        likes,
                        diamonds_l30d,
                        valid_live_days_l30d,
                        live_duration_l30d,
                        videos,
                        diamonds_from_fan_club_l30d,
                        active_fan_club_members_l30d,
                        last_live,
                        tier_status,
                        tier_last_month,
                        achieved_star_creator,
                        star_creator_days_this_month,
                        imported_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)

                    ON CONFLICT(normalised_username) DO UPDATE SET
                        creator_username = excluded.creator_username,
                        followers = excluded.followers,
                        likes = excluded.likes,
                        diamonds_l30d = excluded.diamonds_l30d,
                        valid_live_days_l30d = excluded.valid_live_days_l30d,
                        live_duration_l30d = excluded.live_duration_l30d,
                        videos = excluded.videos,
                        diamonds_from_fan_club_l30d =
                            excluded.diamonds_from_fan_club_l30d,
                        active_fan_club_members_l30d =
                            excluded.active_fan_club_members_l30d,
                        last_live = excluded.last_live,
                        tier_status = excluded.tier_status,
                        tier_last_month = excluded.tier_last_month,
                        achieved_star_creator = excluded.achieved_star_creator,
                        star_creator_days_this_month =
                            excluded.star_creator_days_this_month,
                        imported_at = excluded.imported_at
                    """,
                    (
                        username,
                        normalised,
                        values["followers"],
                        values["likes"],
                        values["diamonds_l30d"],
                        values["valid_live_days_l30d"],
                        values["live_duration_l30d"],
                        values["videos"],
                        values["diamonds_from_fan_club_l30d"],
                        values["active_fan_club_members_l30d"],
                        values["last_live"],
                        values["tier_status"],
                        values["tier_last_month"],
                        values["achieved_star_creator"],
                        values["star_creator_days_this_month"],
                        import_time,
                    )
                )

                imported += 1

                user_id = user_lookup.get(normalised)

                if user_id is None:
                    unmatched.append(username)
                    continue

                # Preserve existing performance history.
                db.execute(
                    """
                    INSERT INTO creator_performance (
                        user_id,
                        creator_username,
                        followers,
                        likes,
                        diamonds_l30d,
                        valid_live_days_l30d,
                        live_duration_l30d,
                        imported_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        user_id,
                        username,
                        values["followers"],
                        values["likes"],
                        values["diamonds_l30d"],
                        values["valid_live_days_l30d"],
                        values["live_duration_l30d"],
                        import_time,
                    )
                )

                matched += 1

            except ValueError as error:
                invalid_rows.append({
                    "row": row_number,
                    "reason": str(error)
                })

    workbook.close()

    return {
        "message": "Backstage import completed",
        "imported": imported,
        "imported_creators": imported,
        "matched_creators": matched,
        "unmatched": len(unmatched),
        "unmatched_usernames": unmatched,
        "invalid_rows": invalid_rows,
        "fan_club_columns_found": fan_club_columns_found,
        "imported_at": import_time
    }


@app.post("/admin/import-backstage")
async def import_backstage(
    file: UploadFile = File(...),
    admin=Depends(check_admin)
):
    return await _process_backstage_import(file)




def _backstage_campaign_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if value is None:
        return None

    match = re.match(r"^\s*(\d{4}-\d{1,2}-\d{1,2})", str(value))
    if not match:
        return None

    try:
        return date.fromisoformat(match.group(1))
    except ValueError:
        return None


async def _process_backstage_campaign_import(file: UploadFile):
    filename = (file.filename or "").lower()
    if not filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Please upload an .xlsx Excel file.")

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="The uploaded Excel file is empty.")
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="The Excel file must be 10 MB or smaller.")

    try:
        workbook = load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Unable to read this Excel workbook.")

    required = [
        "name",
        "campaign type",
        "start time",
        "end time",
        "status",
        "created by",
    ]

    selected = None
    best_rank = (-1, -1)

    try:
        for worksheet in workbook.worksheets:
            sheet_rows = list(worksheet.iter_rows(values_only=True))

            for header_index, candidate in enumerate(sheet_rows[:20]):
                candidate_headers = list(candidate)
                candidate_positions = {
                    normalise_heading(value): index
                    for index, value in enumerate(candidate_headers)
                    if value is not None and str(value).strip()
                }

                score = sum(1 for heading in required if heading in candidate_positions)
                candidate_data = sheet_rows[header_index + 1:]
                data_count = sum(
                    1 for row in candidate_data
                    if any(value is not None and str(value).strip() for value in row)
                )
                rank = (score, data_count)

                if rank > best_rank:
                    best_rank = rank
                    selected = (
                        worksheet.title,
                        candidate_headers,
                        candidate_positions,
                        candidate_data,
                    )
    finally:
        workbook.close()

    if selected is None or best_rank[0] < 1:
        raise HTTPException(
            status_code=400,
            detail="No campaign header row could be found in the workbook."
        )

    sheet_name, headers, positions, rows = selected

    if not rows:
        raise HTTPException(status_code=400, detail="IMPORT DIAGNOSTIC - sheet=" + repr(sheet_name) + "; headers=" + repr(headers) + "; rows=" + str(len(rows)) + "; sample=" + repr(rows[:5]) + "")

    missing = [heading for heading in required if heading not in positions]
    if missing:
        raise HTTPException(
            status_code=400,
            detail="Missing required Excel columns: " + ", ".join(missing) + ". Headers detected: " + repr(list(positions.keys())) + ". First five rows: " + repr(rows[:5]),
        )

    def cell(row, heading):
        index = positions[heading]
        return row[index] if index < len(row) else None

    def display_value(value):
        if value is None:
            return ""
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        return str(value).strip()

    prepared = []
    for row_number, row in enumerate(rows, start=2):
        if not any(value is not None and str(value).strip() for value in row):
            continue

        name = display_value(cell(row, "name"))
        if not name:
            continue

        raw_data = {}
        for index, heading in enumerate(headers):
            if heading is None or not str(heading).strip():
                continue
            value = row[index] if index < len(row) else None
            raw_data[str(heading).strip()] = (
                value.isoformat() if isinstance(value, (datetime, date))
                else value
            )

        source_status = display_value(cell(row, "status"))
        status_key = source_status.casefold()
        internal_status = {
            "declined": "cancelled",
            "ended": "completed",
            "active": "active",
            "scheduled": "scheduled",
            "upcoming": "scheduled",
        }.get(status_key, "draft")

        start_date = _backstage_campaign_date(cell(row, "start time"))
        end_date = _backstage_campaign_date(cell(row, "end time"))

        if start_date and end_date and end_date < start_date:
            raise HTTPException(
                status_code=400,
                detail=f"Row {row_number}: the end date is before the start date.",
            )

        prepared.append({
            "name": name,
            "campaign_type": display_value(cell(row, "campaign type")),
            "start_date": start_date,
            "end_date": end_date,
            "status": internal_status,
            "backstage_status": source_status,
            "created_by": display_value(cell(row, "created by")) or None,
            "backstage_data": json.dumps(raw_data, ensure_ascii=False, default=str),
        })

    if not prepared:
        raise HTTPException(status_code=400, detail="No campaign rows were found in the workbook.")

    imported = 0
    skipped_duplicates = 0
    campaign_ids = []

    with connect_db() as db:
        db.execute(
            """
            ALTER TABLE management_campaigns
                ADD COLUMN IF NOT EXISTS campaign_type TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS backstage_status TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS backstage_data JSONB NOT NULL DEFAULT '{}'::jsonb
            """
        )

        for campaign in prepared:
            existing = db.execute(
                """
                SELECT id
                FROM management_campaigns
                WHERE name = %s
                  AND backstage_data = %s::jsonb
                LIMIT 1
                """,
                (campaign["name"], campaign["backstage_data"]),
            ).fetchone()

            if existing:
                skipped_duplicates += 1
                continue

            inserted = db.execute(
                """
                INSERT INTO management_campaigns (
                    name, description, objective, notes,
                    start_date, end_date, status, created_by,
                    campaign_type, backstage_status, backstage_data
                )
                VALUES (%s, '', '', '', %s, %s, %s, %s, %s, %s, %s::jsonb)
                RETURNING id
                """,
                (
                    campaign["name"],
                    campaign["start_date"],
                    campaign["end_date"],
                    campaign["status"],
                    campaign["created_by"],
                    campaign["campaign_type"],
                    campaign["backstage_status"],
                    campaign["backstage_data"],
                ),
            ).fetchone()

            imported += 1
            campaign_ids.append(inserted["id"])

    return {
        "imported": imported,
        "skipped_duplicates": skipped_duplicates,
        "campaign_ids": campaign_ids,
    }


@app.post("/management/import-campaigns")
async def management_import_campaigns(
    file: UploadFile = File(...),
    founder=Depends(get_management_founder)
):
    return await _process_backstage_campaign_import(file)


@app.post("/management/import-backstage")
async def management_import_backstage(
    file: UploadFile = File(...),
    founder=Depends(get_management_founder)
):
    return await _process_backstage_import(file)


@app.post("/auth/register")
def register(data: RegisterRequest):
    username = data.username.strip().lstrip("@")
    normalised = normalise_username(username)

    if not valid_username(username):
        raise HTTPException(
            status_code=400,
            detail="Invalid TikTok username"
        )

    with connect_db() as db:
        # Lock and validate the invitation.
        invitation = db.execute(
            """
            SELECT id, used
            FROM invitations
            WHERE code_hash = %s
            FOR UPDATE
            """,
            (hash_invitation(data.invitation_code),)
        ).fetchone()

        if not invitation or invitation["used"]:
            raise HTTPException(
                status_code=400,
                detail="Invalid or already used invitation code"
            )

        # Only imported creators are eligible.
        performance = db.execute(
            """
            SELECT creator_username
            FROM backstage_performance
            WHERE normalised_username = %s
            LIMIT 1
            """,
            (normalised,)
        ).fetchone()

        if not performance:
            raise HTTPException(
                status_code=403,
                detail="This TikTok username is not in the imported creator performance data"
            )

        # Reuse an existing account rather than creating a duplicate.
        existing_user = db.execute(
            """
            SELECT id
            FROM users
            WHERE lower(username) = %s
            FOR UPDATE
            """,
            (normalised,)
        ).fetchone()

        if existing_user:
            user_id = existing_user["id"]
        else:
            internal_email = f"{normalised}@creators.veyra.invalid"
            internal_password = secrets.token_urlsafe(48)

            try:
                cursor = db.execute(
                    """
                    INSERT INTO users (
                        email,
                        username,
                        display_name,
                        password_hash,
                        created_at
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        internal_email,
                        username,
                        username,
                        password_hash.hash(internal_password),
                        datetime.now(timezone.utc).isoformat()
                    )
                )
                user_id = cursor.fetchone()["id"]

            except psycopg.IntegrityError:
                raise HTTPException(
                    status_code=409,
                    detail="This creator account could not be created. Please contact the administrator."
                )

        # Redeem the invitation only after successful account validation.
        db.execute(
            "UPDATE invitations SET used = 1 WHERE id = %s",
            (invitation["id"],)
        )

    return {
        "message": "Account activated successfully",
        "access_token": create_token(user_id),
        "token_type": "bearer"
    }





@app.get("/me")
def my_profile(user=Depends(get_current_user)):
    return user


@app.patch("/me")
def update_my_profile(
    data: ProfileUpdateRequest,
    user=Depends(get_current_user)
):
    updates = data.model_dump(exclude_unset=True)

    if not updates:
        raise HTTPException(
            status_code=400,
            detail="No profile changes supplied"
        )

    display_name = (updates.get("display_name") or "").strip()

    if not display_name or len(display_name) > 50:
        raise HTTPException(
            status_code=400,
            detail="Display name must be 1Ã¢â‚¬â€œ50 characters"
        )

    with connect_db() as db:
        db.execute(
            "UPDATE users SET display_name = %s WHERE id = %s",
            (display_name, user["id"])
        )

        updated_user = db.execute(
            """
            SELECT id, email, username, display_name, profile_picture
            FROM users WHERE id = %s
            """,
            (user["id"],)
        ).fetchone()

    return {
        "message": "Profile updated successfully",
        "user": dict(updated_user)
    }


@app.post("/me/profile-picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    content_type = (file.content_type or "").lower()

    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Please upload a JPEG, PNG or WebP image"
        )

    contents = await file.read(MAX_UPLOAD_SIZE + 1)

    if not contents or len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=400,
            detail="Image must be between 1 byte and 5 MB"
        )

    valid_signature = (
        (
            content_type == "image/jpeg"
            and contents.startswith(b"\xff\xd8\xff")
        )
        or (
            content_type == "image/png"
            and contents.startswith(b"\x89PNG\r\n\x1a\n")
        )
        or (
            content_type == "image/webp"
            and contents.startswith(b"RIFF")
            and contents[8:12] == b"WEBP"
        )
    )

    if not valid_signature:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid image"
        )

    extension = ALLOWED_IMAGE_TYPES[content_type]
    filename = f"user_{user['id']}_{uuid.uuid4().hex}{extension}"

    encoded_bucket = urllib.parse.quote(SUPABASE_STORAGE_BUCKET, safe="")
    encoded_filename = urllib.parse.quote(filename, safe="")
    storage_url = (
        f"{SUPABASE_URL}/storage/v1/object/"
        f"{encoded_bucket}/{encoded_filename}"
    )

    request = urllib.request.Request(
        storage_url,
        data=contents,
        method="POST",
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": content_type,
            "Cache-Control": "3600",
            "x-upsert": "true",
        }
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status not in (200, 201):
                raise HTTPException(
                    status_code=502,
                    detail="Profile picture storage failed"
                )
    except (HTTPError, URLError, TimeoutError):
        raise HTTPException(
            status_code=502,
            detail="Could not upload the profile picture to storage"
        )

    with connect_db() as db:
        db.execute(
            "UPDATE users SET profile_picture = %s WHERE id = %s",
            (filename, user["id"])
        )

    return {
        "message": "Profile picture updated successfully",
        "profile_picture": f"/profile-pictures/{filename}"
    }


@app.get("/profile-pictures/{filename}")
def get_profile_picture(filename: str):
    if not re.fullmatch(
        r"user_[0-9]+_[a-f0-9]+\.(jpg|png|webp)",
        filename
    ):
        raise HTTPException(
            status_code=404,
            detail="Image not found"
        )

    encoded_bucket = urllib.parse.quote(SUPABASE_STORAGE_BUCKET, safe="")
    encoded_filename = urllib.parse.quote(filename, safe="")
    public_url = (
        f"{SUPABASE_URL}/storage/v1/object/public/"
        f"{encoded_bucket}/{encoded_filename}"
    )

    return RedirectResponse(
        url=public_url,
        status_code=302
    )


@app.get("/live-challenges")
def creator_list_live_challenges(user=Depends(get_current_user)):
    with connect_db() as db:
        ensure_management_live_challenges_table(db)
        challenges = db.execute(
            """
            SELECT
                id, title, description, instructions, reward,
                start_date, end_date,
                CASE
                    WHEN end_date IS NOT NULL
                         AND end_date < CURRENT_DATE THEN 'ended'
                    ELSE 'published'
                END AS display_status,
                published_at
            FROM management_live_challenges
            WHERE status = 'published'
              AND (end_date IS NULL OR end_date >= CURRENT_DATE)
            ORDER BY start_date ASC NULLS LAST, id DESC
            """
        ).fetchall()

    return {
        "total": len(challenges),
        "challenges": [dict(item) for item in challenges]
    }

@app.get("/announcements")
def creator_list_announcements(user=Depends(get_current_user)):
    with connect_db() as db:
        ensure_management_announcements_table(db)
        announcements = db.execute(
            """
            SELECT id, title, message, published_at
            FROM management_announcements
            WHERE status = 'published'
            ORDER BY published_at DESC NULLS LAST, id DESC
            """
        ).fetchall()

    return {
        "total": len(announcements),
        "announcements": [dict(item) for item in announcements]
    }


@app.get("/campaigns")
def creator_list_campaigns(user=Depends(get_current_user)):
    with connect_db() as db:
        campaigns = db.execute(
            """
            SELECT
                id,
                name,
                campaign_type,
                start_date,
                end_date,
                status,
                backstage_status
            FROM management_campaigns
            WHERE backstage_data <> '{}'::jsonb
            ORDER BY start_date DESC NULLS LAST, id DESC
            """
        ).fetchall()

    results = []
    for campaign in campaigns:
        item = dict(campaign)
        item["display_status"] = (
            item.get("backstage_status") or item.get("status") or "Unknown"
        )
        results.append(item)

    return {
        "total": len(results),
        "campaigns": results
    }


@app.get("/my-performance")
def my_performance(user=Depends(get_current_user)):
    username = normalise_username(user["username"])

    with connect_db() as db:
        performance = db.execute(
            """
            SELECT
                creator_username,
                followers,
                videos,
                likes,
                diamonds_l30d,
                valid_live_days_l30d,
                live_duration_l30d,
                diamonds_from_fan_club_l30d,
                active_fan_club_members_l30d,
                last_live,
                tier_status,
                tier_last_month,
                achieved_star_creator,
                star_creator_days_this_month,
                imported_at
            FROM backstage_performance
            WHERE normalised_username = %s
            LIMIT 1
            """,
            (username,)
        ).fetchone()

        # Fallback for older imports.
        if not performance:
            legacy = db.execute(
                """
                SELECT
                    creator_username,
                    followers,
                    likes,
                    diamonds_l30d,
                    valid_live_days_l30d,
                    live_duration_l30d,
                    imported_at
                FROM creator_performance
                WHERE user_id = %s
                ORDER BY imported_at DESC, id DESC
                """,
                (user["id"],)
            ).fetchall()

            for record in legacy:
                if normalise_username(
                    record["creator_username"]
                ) == username:
                    performance = record
                    break

    if not performance:
        return {
            "message": "No performance data has been imported for this account",
            "performance": None
        }

    result = dict(performance)

    # Original backend field names.
    fan_club_diamonds = result.get(
        "diamonds_from_fan_club_l30d"
    )

    fan_club_fans = result.get(
        "active_fan_club_members_l30d"
    )

    # Frontend-compatible aliases.
    result["fan_club_diamonds_l30d"] = fan_club_diamonds
    result["active_fans_fan_club_l30d"] = fan_club_fans

    return {
        "message": "Performance data retrieved",
        "performance": result
    }


@app.post("/admin/discord/invite-message")
def post_discord_invite_message(
    channel_id: str,
    admin=Depends(check_admin)
):
    if not DISCORD_BOT_TOKEN:
        raise HTTPException(
            status_code=500,
            detail="Discord bot token is not configured"
        )

    if not channel_id.isdigit():
        raise HTTPException(
            status_code=400,
            detail="Invalid Discord channel ID"
        )

    payload = {
        "embeds": [{
            "title": "VEYRA Creator Network",
            "description": (
                "Welcome to VEYRA!\n\n"
                "Ready to join the Creator Network? "
                "Click the button below to receive your personal "
                "invitation code privately through Discord DM.\n\n"
                "Enter that code on the VEYRA registration screen "
                "to activate your account."
            ),
            "color": 5793266,
            "footer": {
                "text": "VEYRA Creator Network"
            }
        }],
        "components": [{
            "type": 1,
            "components": [{
                "type": 2,
                "style": 1,
                "label": "Get VEYRA Invitation",
                "custom_id": "veyra_get_invite"
            }]
        }]
    }

    req = urllib.request.Request(
        f"https://discord.com/api/v10/channels/{channel_id}/messages",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bot {DISCORD_BOT_TOKEN}",
                "User-Agent": "DiscordBot (https://veyra-api-r8eq.onrender.com, 1.0)",
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            result = json.loads(response.read().decode())

        return {
            "message": "VEYRA invitation button posted successfully",
            "discord_message_id": result.get("id")
        }

    except HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Discord rejected the message: {exc.read().decode()}"
        )
    except URLError:
        raise HTTPException(
            status_code=502,
            detail="Could not connect to Discord"
        )





@app.post("/internal/notifications/run-reminders")
def trigger_campaign_reminders(authorization: str = Header(default="")):
    expected_secret = os.getenv("VEYRA_REMINDER_TRIGGER_SECRET", "")
    supplied_secret = authorization.removeprefix("Bearer ").strip()

    if not expected_secret:
        raise HTTPException(
            status_code=503,
            detail="Reminder trigger is not configured"
        )

    if not secrets.compare_digest(supplied_secret, expected_secret):
        raise HTTPException(
            status_code=401,
            detail="Unauthorised reminder trigger"
        )

    try:
        from send_campaign_reminders import run_campaign_reminders
        run_campaign_reminders()
    except Exception:
        logger.exception("Scheduled VEYRA campaign reminders failed")
        raise HTTPException(
            status_code=500,
            detail="Campaign reminders could not be completed"
        )

    return {"message": "Campaign reminders completed successfully"}

