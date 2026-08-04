from __future__ import annotations

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException

from app.db.session import get_db
from app.server import app, _ensure_user, _require_admin
from app.services.stats_service import StatsService
from app.services.wallet_service import WalletService
from app.wheel_plus_live import admin_force_settle, get_room_snapshot, place_bet, reveal_round


class WheelPlusRoomPayload(BaseModel):
    init_data: str = Field(default="")


class WheelPlusBetPayload(BaseModel):
    init_data: str = Field(default="")
    cell_key: str = Field(default="")
    amount: int = Field(default=0, gt=0)


class WheelPlusFairRevealPayload(BaseModel):
    init_data: str = Field(default="")
    round_id: int = Field(default=0, gt=0)


@app.post("/api/wheel-plus/room")
def wheel_plus_room(payload: WheelPlusRoomPayload, db: Session = Depends(get_db)) -> dict:
    user, _ = _ensure_user(db, payload.init_data)
    snapshot = get_room_snapshot(db)
    profile = StatsService.build_profile_payload(db, user)
    profile["text"] = StatsService.format_profile_text(profile)
    snapshot["viewer_balance"] = WalletService.get_snapshot(db, user.id).balance
    snapshot["profile"] = profile
    return snapshot


@app.post("/api/wheel-plus/bet")
def wheel_plus_bet(payload: WheelPlusBetPayload, db: Session = Depends(get_db)) -> dict:
    user, _ = _ensure_user(db, payload.init_data)
    result = place_bet(db, user, payload.cell_key.strip(), payload.amount)
    db.commit()
    snapshot = get_room_snapshot(db)
    profile = StatsService.build_profile_payload(db, user)
    profile["text"] = StatsService.format_profile_text(profile)
    return {
        "status": "success",
        "balance": result["balance"],
        "round": result["round"],
        "room": snapshot["room"],
        "current_round": snapshot["current_round"],
        "recent_rounds": snapshot["recent_rounds"],
        "players": snapshot["players"],
        "profile": profile,
    }


@app.post("/api/wheel-plus/reveal")
def wheel_plus_reveal(payload: WheelPlusFairRevealPayload, db: Session = Depends(get_db)) -> dict:
    _ensure_user(db, payload.init_data)
    result = reveal_round(db, payload.round_id)
    db.commit()
    return result


@app.post("/api/wheel-plus/admin/force-settle")
def wheel_plus_admin_force_settle(payload: WheelPlusRoomPayload, db: Session = Depends(get_db)) -> dict:
    _require_admin(db, payload.init_data)
    result = admin_force_settle(db)
    db.commit()
    return result
