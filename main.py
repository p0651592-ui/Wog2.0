import hashlib
import hmac
import json
import os
import random
import requests
from typing import Optional
from urllib.parse import parse_qsl

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


def env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def env_str(name: str, default: str = "") -> str:
    value = os.getenv(name, default)
    return value.strip() if isinstance(value, str) else default


APP_TITLE = env_str("APP_TITLE", "WOG Casino Core Engine")
OWNER_ID = env_int("OWNER_ID", 6682822292)
TELEGRAM_BOT_TOKEN = env_str("TELEGRAM_BOT_TOKEN", os.getenv("BOT_TOKEN", ""))
TELEGRAM_CHAT_ID = env_str("TELEGRAM_CHAT_ID", "-1004438070296")
PUBLIC_API_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

app = FastAPI(title=APP_TITLE)

app.add_middleware(
    CORSMiddleware,
    allow_origins=PUBLIC_API_ORIGINS if PUBLIC_API_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (temporary MVP state)
db = {
    "users": {},
    "promos": {},
}


class GitHubAuthor(BaseModel):
    name: str


class GitHubCommit(BaseModel):
    id: str
    message: str
    author: GitHubAuthor


class GitHubRepository(BaseModel):
    full_name: str


class GitHubPusher(BaseModel):
    name: str


class GitHubPushPayload(BaseModel):
    ref: str
    pusher: GitHubPusher
    repository: GitHubRepository
    commits: list[GitHubCommit] = Field(default_factory=list)


class ProfileRequest(BaseModel):
    id: Optional[int] = None
    first_name: Optional[str] = "Игрок"
    username: Optional[str] = ""
    photo_url: Optional[str] = ""
    init_data: Optional[str] = ""
    auth_data: Optional[str] = ""


class BalanceUpdate(BaseModel):
    id: int
    amount: int


class DiceBet(BaseModel):
    id: int
    bet: int
    target: str  # under, seven, over, even, odd, c1-c6, sum2-sum12, p1-p6, anypair


class PromoCreate(BaseModel):
    admin_id: int
    code: str
    reward: int
    uses: int


class PromoActivate(BaseModel):
    id: int
    code: str


MULTIPLIERS = {
    "under": 2.4,
    "seven": 5.9,
    "over": 2.4,
    "even": 2.0,
    "odd": 2.0,
    "c1": 3.2,
    "c2": 3.2,
    "c3": 3.2,
    "c4": 3.2,
    "c5": 3.2,
    "c6": 3.2,
    "sum2": 35.3,
    "sum3": 17.6,
    "sum4": 11.8,
    "sum5": 8.8,
    "sum6": 7.1,
    "sum7": 5.9,
    "sum8": 7.1,
    "sum9": 8.8,
    "sum10": 11.8,
    "sum11": 17.6,
    "sum12": 35.3,
    "p1": 35.3,
    "p2": 35.3,
    "p3": 35.3,
    "p4": 35.3,
    "p5": 35.3,
    "p6": 35.3,
    "anypair": 5.9,
}


def _normalize_code(value: str) -> str:
    return value.strip().upper()


def _make_default_user(user_id: int, first_name: str, username: str, photo_url: str, role: str) -> dict:
    return {
        "id": user_id,
        "name": first_name or "Игрок",
        "username": username or "",
        "photo_url": photo_url or "",
        "balance": 5000,
        "role": role,
    }


def _ensure_user(user_id: int, first_name: str = "Игрок", username: str = "", photo_url: str = "") -> dict:
    role = "admin" if user_id == OWNER_ID else "user"
    if user_id not in db["users"]:
        db["users"][user_id] = _make_default_user(user_id, first_name, username, photo_url, role)
    else:
        db["users"][user_id]["name"] = first_name or db["users"][user_id]["name"]
        db["users"][user_id]["username"] = username or db["users"][user_id]["username"]
        db["users"][user_id]["photo_url"] = photo_url or db["users"][user_id]["photo_url"]
        db["users"][user_id]["role"] = role
    return db["users"][user_id]


def _validate_telegram_init_data(init_data: str) -> dict:
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Telegram bot token is not configured")

    if not init_data:
        raise HTTPException(status_code=400, detail="init_data is required")

    params = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = params.pop("hash", None)
    if not received_hash:
        raise HTTPException(status_code=400, detail="Telegram init_data hash is missing")

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(params.items()))
    secret_key = hmac.new(
        key=b"WebAppData",
        msg=TELEGRAM_BOT_TOKEN.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    calculated_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise HTTPException(status_code=403, detail="Telegram init_data signature is invalid")

    user_raw = params.get("user")
    if not user_raw:
        raise HTTPException(status_code=400, detail="Telegram user payload is missing")

    try:
        return json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Telegram user payload is invalid") from exc


def _resolve_user_from_request(payload: ProfileRequest) -> tuple[int, str, str, str]:
    init_data = (payload.init_data or payload.auth_data or "").strip()
    if init_data:
        try:
            tg_user = _validate_telegram_init_data(init_data)
            user_id = int(tg_user.get("id"))
            first_name = tg_user.get("first_name") or payload.first_name or "Игрок"
            username = tg_user.get("username") or payload.username or ""
            photo_url = tg_user.get("photo_url") or payload.photo_url or ""
            return user_id, first_name, username, photo_url
        except HTTPException:
            # Fallback to passed fields if initData is unavailable in this environment.
            pass

    if payload.id is not None:
        user_id = int(payload.id)
    else:
        user_id = OWNER_ID

    if not user_id or user_id == OWNER_ID:
        user_id = OWNER_ID
        first_name = "Основатель (WOG)"
        username = "FounderAdmin"
        photo_url = ""
    else:
        first_name = payload.first_name or "Игрок"
        username = payload.username or ""
        photo_url = payload.photo_url or ""

    return user_id, first_name, username, photo_url


def _get_or_create_user_from_profile(payload: ProfileRequest) -> dict:
    user_id, first_name, username, photo_url = _resolve_user_from_request(payload)
    if user_id == OWNER_ID:
        first_name = "Основатель (WOG)"
        username = "FounderAdmin"
    return _ensure_user(user_id, first_name, username, photo_url)


@app.get("/")
async def root():
    return {"status": "ok", "service": "WOG Casino Core Engine", "users_count": len(db["users"])}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.post("/api/profile/me")
async def profile_me(payload: ProfileRequest):
    user = _get_or_create_user_from_profile(payload)
    return user


@app.post("/api/user")
async def login_user(payload: ProfileRequest):
    user = _get_or_create_user_from_profile(payload)
    return user


@app.post("/api/balance")
async def update_balance(data: BalanceUpdate):
    user_id = int(data.id) if data.id else OWNER_ID
    user = _ensure_user(
        user_id,
        "Основатель (WOG)" if user_id == OWNER_ID else "Игрок казино",
        "",
        "",
    )

    user["balance"] += int(data.amount)
    if user["balance"] < 0:
        user["balance"] = 0

    return {"success": True, "balance": user["balance"]}


@app.post("/api/game/dice")
async def play_dice(bet_data: DiceBet):
    user_id = int(bet_data.id)
    bet = int(bet_data.bet)
    target = str(bet_data.target)

    if user_id not in db["users"]:
        raise HTTPException(status_code=404, detail="User not found")

    player = db["users"][user_id]

    if bet <= 0:
        raise HTTPException(status_code=400, detail="Bet must be greater than zero")

    if player["balance"] < bet:
        raise HTTPException(status_code=400, detail="Недостаточно монет для ставки!")

    if target not in MULTIPLIERS:
        raise HTTPException(status_code=400, detail="Неверный тип ставки")

    val1 = random.randint(1, 6)
    val2 = random.randint(1, 6)
    dice_sum = val1 + val2
    is_pair = val1 == val2

    is_win = False
    if target == "under" and dice_sum < 7:
        is_win = True
    elif target == "seven" and dice_sum == 7:
        is_win = True
    elif target == "over" and dice_sum > 7:
        is_win = True
    elif target == "even" and dice_sum % 2 == 0:
        is_win = True
    elif target == "odd" and dice_sum % 2 != 0:
        is_win = True
    elif target == "c1" and (val1 == 1 or val2 == 1):
        is_win = True
    elif target == "c2" and (val1 == 2 or val2 == 2):
        is_win = True
    elif target == "c3" and (val1 == 3 or val2 == 3):
        is_win = True
    elif target == "c4" and (val1 == 4 or val2 == 4):
        is_win = True
    elif target == "c5" and (val1 == 5 or val2 == 5):
        is_win = True
    elif target == "c6" and (val1 == 6 or val2 == 6):
        is_win = True
    elif target == f"sum{dice_sum}":
        is_win = True
    elif target == "anypair" and is_pair:
        is_win = True
    elif target == "p1" and is_pair and val1 == 1:
        is_win = True
    elif target == "p2" and is_pair and val1 == 2:
        is_win = True
    elif target == "p3" and is_pair and val1 == 3:
        is_win = True
    elif target == "p4" and is_pair and val1 == 4:
        is_win = True
    elif target == "p5" and is_pair and val1 == 5:
        is_win = True
    elif target == "p6" and is_pair and val1 == 6:
        is_win = True

    if is_win:
        win_amount = int(bet * MULTIPLIERS[target])
        player["balance"] += (win_amount - bet)
    else:
        win_amount = 0
        player["balance"] -= bet

    return {
        "success": True,
        "val1": val1,
        "val2": val2,
        "diceSum": dice_sum,
        "win": is_win,
        "winAmount": win_amount,
        "balance": player["balance"],
    }


@app.post("/api/promo/create")
async def create_promo(data: PromoCreate):
    if data.admin_id != OWNER_ID:
        raise HTTPException(status_code=403, detail="Access denied")

    reward = int(data.reward)
    uses = int(data.uses)
    if reward <= 0:
        raise HTTPException(status_code=400, detail="Reward must be greater than zero")
    if uses <= 0:
        raise HTTPException(status_code=400, detail="Uses must be greater than zero")

    clean_code = _normalize_code(data.code)
    db["promos"][clean_code] = {
        "reward": reward,
        "uses": uses,
        "claimed_by": [],
    }
    return {"success": True}


@app.post("/api/promo/activate")
async def activate_promo(data: PromoActivate):
    user_id = int(data.id)
    clean_code = _normalize_code(data.code)

    if user_id not in db["users"]:
        raise HTTPException(status_code=404, detail="User not found")
    if clean_code not in db["promos"]:
        raise HTTPException(status_code=404, detail="Promo not found")

    promo = db["promos"][clean_code]
    if promo["uses"] <= 0:
        raise HTTPException(status_code=400, detail="Promo expired")
    if user_id in promo["claimed_by"]:
        raise HTTPException(status_code=400, detail="Already claimed")

    db["users"][user_id]["balance"] += promo["reward"]
    promo["uses"] -= 1
    promo["claimed_by"].append(user_id)

    return {
        "success": True,
        "balance": db["users"][user_id]["balance"],
        "message": f"Активирован код на +{promo['reward']} W!",
    }


@app.post("/api/promo/list")
async def list_promos(data: dict):
    if data.get("admin_id") != OWNER_ID:
        raise HTTPException(status_code=403, detail="Access denied")
    return db["promos"]


@app.post("/github-webhook")
async def handle_github_webhook(payload: GitHubPushPayload):
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Telegram bot token is not configured")

    try:
        branch = payload.ref.split("/")[-1]
        repo_name = payload.repository.full_name
        pusher_name = payload.pusher.name

        commit_text = ""
        for commit in payload.commits:
            short_sha = commit.id[:7]
            clean_message = commit.message.replace("<", "&lt;").replace(">", "&gt;")
            commit_text += f"\n• [<code>{short_sha}</code>] {clean_message} — <i>{commit.author.name}</i>"

        message = (
            f"🚀 <b>Новый пуш в репозиторий!</b>\n\n"
            f"📦 <b>Репозиторий:</b> <code>{repo_name}</code>\n"
            f"🌿 <b>Ветка:</b> <code>{branch}</code>\n"
            f"👤 <b>Автор:</b> {pusher_name}\n"
            f"💬 <b>Коммиты:</b>{commit_text}"
        )

        tg_url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        tg_payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        response = requests.post(tg_url, json=tg_payload, timeout=10)

        if response.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to send message to Telegram")

        return {"status": "success"}

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=10000, reload=False)
