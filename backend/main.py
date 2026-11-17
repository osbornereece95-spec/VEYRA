
import os
import re
import io
import sqlite3
import hashlib
import secrets
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone

import jwt
from dotenv import load_dotenv
from openpyxl import load_workbook
from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pwdlib import PasswordHash


load_dotenv(Path(__file__).with_name(".env"))

SECRET_KEY = os.getenv("SECRET_KEY")
ADMIN_KEY = os.getenv("ADMIN_KEY")

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

DATA_DIR = Path(
    os.getenv("VEYRA_DATA_DIR", str(Path(__file__).parent))
).expanduser()

DATA_DIR.mkdir(parents=True, exist_ok=True)

DATABASE = DATA_DIR / "veyra.db"
UPLOAD_DIR = DATA_DIR / "profile_pictures"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

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
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def add_missing_columns(db, table_name, definitions):
    existing = {
        row["name"]
        for row in db.execute(
            f"PRAGMA table_info({table_name})"
        ).fetchall()
    }

    for column_name, column_type in definitions.items():
        if column_name not in existing:
            db.execute(
                f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}"
            )


def initialise_database():
    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                username TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS invitations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code_hash TEXT NOT NULL UNIQUE,
                used INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS creator_performance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                creator_username TEXT NOT NULL,
                followers INTEGER NOT NULL,
                likes INTEGER NOT NULL,
                diamonds_l30d INTEGER NOT NULL,
                valid_live_days_l30d INTEGER NOT NULL,
                live_duration_l30d REAL NOT NULL,
                imported_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS backstage_performance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                creator_username TEXT NOT NULL,
                normalised_username TEXT NOT NULL UNIQUE,
                followers INTEGER NOT NULL DEFAULT 0,
                likes INTEGER NOT NULL DEFAULT 0,
                diamonds_l30d INTEGER NOT NULL DEFAULT 0,
                valid_live_days_l30d INTEGER NOT NULL DEFAULT 0,
                live_duration_l30d REAL NOT NULL DEFAULT 0,
                imported_at TEXT NOT NULL
            )
        """)

        user_columns = {
            row["name"]
            for row in db.execute(
                "PRAGMA table_info(users)"
            ).fetchall()
        }

        if "display_name" not in user_columns:
            db.execute(
                "ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''"
            )

        if "profile_picture" not in user_columns:
            db.execute(
                "ALTER TABLE users ADD COLUMN profile_picture TEXT"
            )

        add_missing_columns(db, "backstage_performance", {
            "videos": "INTEGER",
            "diamonds_from_fan_club_l30d": "REAL",
            "active_fan_club_members_l30d": "INTEGER",
            "last_live": "TEXT",
            "tier_status": "TEXT",
            "tier_last_month": "TEXT",
            "achieved_star_creator": "TEXT",
            "star_creator_days_this_month": "INTEGER",
        })

        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_performance_user_imported
            ON creator_performance(user_id, imported_at)
        """)

        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_backstage_username
            ON backstage_performance(normalised_username)
        """)


initialise_database()


class RegisterRequest(BaseModel):
    invitation_code: str = Field(min_length=1, max_length=100)
    username: str = Field(min_length=1, max_length=50)
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=12, max_length=128)


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
        "exp": now + timedelta(hours=12),
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
            FROM users WHERE id = ?
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
            VALUES (?, ?)
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
            "SELECT id FROM users WHERE id = ?",
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
            WHERE lower(username) = ? AND id != ?
            """,
            (normalised, user_id)
        ).fetchone()

        if duplicate:
            raise HTTPException(
                status_code=409,
                detail="That TikTok username is already assigned to another account"
            )

        db.execute(
            "UPDATE users SET username = ? WHERE id = ?",
            (username, user_id)
        )

        performance = db.execute(
            """
            SELECT creator_username
            FROM backstage_performance
            WHERE normalised_username = ?
            """,
            (normalised,)
        ).fetchone()

        updated_user = db.execute(
            """
            SELECT id, email, username, display_name, profile_picture
            FROM users WHERE id = ?
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
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

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
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
    email = data.email.strip().lower()
    username = data.username.strip().lstrip("@")

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise HTTPException(
            status_code=400,
            detail="Enter a valid email address"
        )

    if not valid_username(username):
        raise HTTPException(
            status_code=400,
            detail="Invalid TikTok username"
        )

    with connect_db() as db:
        invitation = db.execute(
            "SELECT id, used FROM invitations WHERE code_hash = ?",
            (hash_invitation(data.invitation_code),)
        ).fetchone()

        if not invitation or invitation["used"]:
            raise HTTPException(
                status_code=400,
                detail="Invalid or already used invitation code"
            )

        duplicate_username = db.execute(
            "SELECT id FROM users WHERE lower(username) = ?",
            (normalise_username(username),)
        ).fetchone()

        if duplicate_username:
            raise HTTPException(
                status_code=409,
                detail="That TikTok username is already registered"
            )

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
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    email,
                    username,
                    username,
                    password_hash.hash(data.password),
                    datetime.now(timezone.utc).isoformat()
                )
            )

        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists"
            )

        db.execute(
            "UPDATE invitations SET used = 1 WHERE id = ?",
            (invitation["id"],)
        )

        user_id = cursor.lastrowid

    return {
        "message": "Account created successfully",
        "access_token": create_token(user_id),
        "token_type": "bearer"
    }


@app.post("/auth/login")
def login(data: LoginRequest):
    email = data.email.strip().lower()

    with connect_db() as db:
        user = db.execute(
            """
            SELECT id, email, username, password_hash
            FROM users WHERE email = ?
            """,
            (email,)
        ).fetchone()

    if not user or not password_hash.verify(
        data.password,
        user["password_hash"]
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password"
        )

    return {
        "message": "Login successful",
        "access_token": create_token(user["id"]),
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
            detail="Display name must be 1â€“50 characters"
        )

    with connect_db() as db:
        db.execute(
            "UPDATE users SET display_name = ? WHERE id = ?",
            (display_name, user["id"])
        )

        updated_user = db.execute(
            """
            SELECT id, email, username, display_name, profile_picture
            FROM users WHERE id = ?
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

    filename = (
        f"user_{user['id']}_{uuid.uuid4().hex}{extension}"
    )

    destination = UPLOAD_DIR / filename

    with connect_db() as db:
        old_picture = db.execute(
            "SELECT profile_picture FROM users WHERE id = ?",
            (user["id"],)
        ).fetchone()

        destination.write_bytes(contents)

        db.execute(
            "UPDATE users SET profile_picture = ? WHERE id = ?",
            (filename, user["id"])
        )

    if old_picture and old_picture["profile_picture"]:
        old_path = UPLOAD_DIR / old_picture["profile_picture"]

        if old_path.parent == UPLOAD_DIR and old_path.exists():
            try:
                old_path.unlink()
            except OSError:
                pass

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

    path = UPLOAD_DIR / filename

    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Image not found"
        )

    from fastapi.responses import FileResponse

    media_type = {
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp"
    }[path.suffix]

    return FileResponse(
        path,
        media_type=media_type
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
            WHERE normalised_username = ?
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
                WHERE user_id = ?
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

