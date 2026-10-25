"""Safely provision the first organization in a completely empty database.

This command is intentionally separate from the web service. It fails closed if
any database table contains a row, and enables registration only in this short-
lived process while reusing the application's validated registration flow.
"""
from __future__ import annotations

import argparse
import getpass
import os
import re
import sys
from pathlib import Path
from typing import NoReturn

from sqlalchemy import MetaData, Table, create_engine, inspect, select
from sqlalchemy.engine import make_url


class ProvisioningError(Exception):
    """A safe-to-display provisioning failure."""


def normalized_database_url(value: str) -> str:
    if value.startswith("postgres://"):
        return value.replace("postgres://", "postgresql+psycopg://", 1)
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    return value


def assert_database_has_no_rows(database_url: str) -> None:
    """Reject existing data without exposing row contents or connection details."""
    engine = create_engine(normalized_database_url(database_url), pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            inspector = inspect(connection)
            system_schemas = {"information_schema", "pg_catalog"}
            for schema in inspector.get_schema_names():
                if schema in system_schemas or schema.startswith("pg_toast"):
                    continue
                for name in inspector.get_table_names(schema=schema):
                    table = Table(name, MetaData(), schema=schema, autoload_with=connection)
                    if connection.execute(select(1).select_from(table).limit(1)).first() is not None:
                        raise ProvisioningError(
                            f"Banco não vazio: a tabela '{schema}.{name}' já contém dados. Nenhuma organização foi criada."
                        )
    finally:
        engine.dispose()


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Cria a primeira organização apenas em um banco sem registros."
    )
    parser.add_argument("--tenant-id", required=True, help="Identificador da organização (2–80 letras, números, _ ou -).")
    parser.add_argument("--username", required=True, help="Usuário CEO inicial (3–120 letras, números, ., _ ou -).")
    return parser.parse_args(argv)


def abort(message: str) -> NoReturn:
    print(f"Erro: {message}", file=sys.stderr)
    raise SystemExit(2)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    tenant_id = args.tenant_id.strip().upper()
    username = args.username.strip()
    if not re.fullmatch(r"[A-Z0-9_-]{2,80}", tenant_id):
        abort("Identificador da organização inválido: use 2 a 80 letras, números, _ ou -.")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,120}", username):
        abort("Usuário inválido: use 3 a 120 letras, números, ponto, hífen ou sublinhado.")

    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        abort("Defina DATABASE_URL explicitamente. O comando não usa banco local implícito.")
    try:
        database_url = normalized_database_url(database_url)
        parsed_url = make_url(database_url)
    except Exception:
        abort("DATABASE_URL não é válida.")
    if parsed_url.get_backend_name() not in {"postgresql", "sqlite"}:
        abort("Somente PostgreSQL ou SQLite são aceitos.")
    if parsed_url.get_backend_name() == "sqlite" and os.environ.get("RENDER"):
        abort("SQLite não pode ser usado no Render.")

    secret_key = os.environ.get("SECRET_KEY", "")
    if len(secret_key) < 32:
        abort("Defina uma SECRET_KEY estável com pelo menos 32 caracteres.")

    try:
        assert_database_has_no_rows(database_url)
    except ProvisioningError as exc:
        abort(str(exc))
    except Exception:
        abort("Não foi possível confirmar que o banco está vazio. Nenhuma organização foi criada.")

    confirmation = f"CREATE FIRST TENANT {tenant_id}"
    print("Este comando cria uma conta CEO e dados demonstrativos neste banco vazio.")
    print("O cadastro público do serviço não será habilitado.")
    if input(f"Para continuar, digite exatamente: {confirmation}\n> ").strip() != confirmation:
        abort("Confirmação não corresponde. Nenhuma organização foi criada.")
    if not sys.stdin.isatty() or not sys.stdout.isatty():
        abort("Execute em um terminal interativo para informar a senha com segurança.")

    password = getpass.getpass("Senha inicial (mínimo 12 caracteres): ")
    password_confirmation = getpass.getpass("Repita a senha inicial: ")
    if password != password_confirmation:
        abort("As senhas não correspondem. Nenhuma organização foi criada.")
    if len(password) < 12 or len(password) > 256 or not password.strip():
        abort("A senha deve ter entre 12 e 256 caracteres e não pode ser vazia.")

    # The flag exists only in this one-off process; it is never written to the
    # service environment or configuration. The web service must be stopped.
    os.environ["DATABASE_URL"] = normalized_database_url(database_url)
    os.environ["ALLOW_SELF_SERVICE_REGISTRATION"] = "1"
    project_root = str(Path(__file__).resolve().parents[1])
    if project_root not in sys.path:
        sys.path.insert(0, project_root)

    try:
        from main import SessionLocal, engine, register_tenant

        # Recheck after the app's normal schema initialization, which runs on
        # import, so any data that appeared after the first check causes refusal.
        assert_database_has_no_rows(database_url)
        provision = getattr(register_tenant, "__wrapped__", None)
        if provision is None:
            abort("O fluxo de cadastro não está disponível nesta versão.")
        db = SessionLocal()
        try:
            # Skip only the HTTP rate-limit wrapper. All input validation and
            # persistence remain the exact same function as public signup.
            result = provision(None, {
                "tenant_id": tenant_id,
                "username": username,
                "password": password,
            }, db)
        finally:
            db.close()
            engine.dispose()
    except ProvisioningError as exc:
        abort(str(exc))
    except Exception as exc:
        detail = f" ({exc.name})" if isinstance(exc, ModuleNotFoundError) else ""
        abort(
            f"Provisionamento falhou ({type(exc).__name__}{detail}). Verifique a conexão e os logs locais; nenhum segredo foi impresso."
        )
    print(result.get("message", "Organização criada."))
    print(f"Conta inicial: {username}. Entre no serviço com essa conta e ative MFA imediatamente.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
