

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
from datetime import datetime, timedelta, timezone

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


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=50)


class AdminUsernameUpdateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)


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
            headers={"Content-Type": "application/json"},
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
            "SELECT id FROM users WHERE id = %s",
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

    return {
        "message": "TikTok username updated successfully",
        "user": dict(updated_user),
        "performance_available": performance is not None
    }


@app.post("/admin/import-backstage")
async def import_backstage(
    file: UploadFile = File(...),
    admin=Depends(check_admin)
):
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
            detail="Display name must be 1–50 characters"
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
