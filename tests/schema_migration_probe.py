"""Subprocess probe for backward-compatible startup schema changes."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# Set these before importing main, whose module initialization opens the DB and
# runs the compatibility migrations against the isolated fixture database.
os.environ.setdefault("SECRET_KEY", "test-only-secret-key-with-more-than-32-characters")
os.environ.setdefault("ENABLE_DEMO_USERS", "0")

from main import SessionLocal, WebSocketTicketModel, engine  # noqa: E402
from sqlalchemy import inspect


columns = {column["name"] for column in inspect(engine).get_columns("websocket_tickets")}
with SessionLocal() as db:
    ticket = db.query(WebSocketTicketModel).filter_by(id=1).one()
    result = {
        "preserved_user": ticket.user_name,
        "preserved_ticket_hash": ticket.ticket_hash == "a" * 64,
        "legacy_ticket_unbound": ticket.session_token_id_hash is None,
        "session_hash_column": "session_token_id_hash" in columns,
    }
    if result != {
        "preserved_user": "legacy-user",
        "preserved_ticket_hash": True,
        "legacy_ticket_unbound": True,
        "session_hash_column": True,
    }:
        raise SystemExit(f"Schema/data preservation invariant failed: {result}")
    print(json.dumps(result, sort_keys=True))
