"""Smoke/integration tests for the Render deployment candidate."""
import os
import json
import hashlib
import secrets
import tempfile
import unittest
from pathlib import Path
from datetime import datetime, timedelta
from unittest.mock import patch
import httpx
from starlette.requests import Request
from starlette.websockets import WebSocketDisconnect

_DB_FILE = Path(tempfile.gettempdir()) / f"voltguard-test-{os.getpid()}-{secrets.token_hex(8)}.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_FILE.as_posix()}"
os.environ["SECRET_KEY"] = "test-only-secret-key-with-more-than-32-characters"
os.environ["ENABLE_DEMO_USERS"] = "0"
os.environ["SIMULATE_TELEMETRY"] = "0"
os.environ["ALLOW_SELF_SERVICE_REGISTRATION"] = "1"

from fastapi.testclient import TestClient
from main import (
    app, TenantSubscriptionModel, UserModel, SessionLocal, encrypt_totp_secret,
    hash_recovery_code, pyotp, rate_limit_client_address, get_current_user,
    PanelModel, PanelHistoryModel, AlarmModel, WorkOrderModel,
    WorkOrderChecklistItemModel, WorkOrderChecklistTemplateModel,
    AuditLogModel, InventoryModel, AssetModel, MaintenancePlanModel,
    MaintenanceTaskModel, DeviceCredentialModel, WebSocketTicketModel,
)


class VoltGuardSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # SlowAPI correctly applies IP-based limits in production. Give each
        # test a distinct synthetic client address so one test cannot consume
        # another test's registration/login quota through shared limiter state.
        cls._client_ip_counter = 1

    def setUp(self):
        type(self)._client_ip_counter += 1
        client_ip = f"192.0.2.{type(self)._client_ip_counter}"
        self.client = TestClient(app, client=(client_ip, 12345))

    def tearDown(self):
        self.client.close()

    def create_tenant(self, suffix):
        tenant_id = f"TEST-{suffix}".upper()
        username = f"admin_{suffix}".replace("-", "_")
        response = self.client.post("/api/tenant/register", json={
            "tenant_id": tenant_id,
            "username": username,
            "password": "Senha-forte-de-teste-2026!"
        })
        self.assertEqual(response.status_code, 200, response.text)
        login = self.client.post("/api/token", json={
            "username": username,
            "password": "Senha-forte-de-teste-2026!"
        })
        self.assertEqual(login.status_code, 200, login.text)
        return tenant_id, {"Authorization": f"Bearer {login.json()['access_token']}"}

    def test_subscription_expiry_is_calculated_for_each_insert(self):
        first_created = datetime(2026, 1, 1)
        second_created = datetime(2026, 1, 2)
        expiry_default = TenantSubscriptionModel.__table__.c.expires_at.default
        self.assertTrue(callable(expiry_default.arg))
        with patch("main.utcnow", side_effect=[first_created, second_created]):
            first_expiry = expiry_default.arg(None)
            second_expiry = expiry_default.arg(None)
        self.assertEqual(second_expiry - first_expiry, timedelta(days=1))

    def test_chunked_device_payload_is_limited_without_content_length(self):
        body = iter((b"x" * 16_000, b"x" * 1_000))
        response = self.client.post(
            "/api/device/telemetry",
            headers={"Authorization": "Bearer invalid"},
            content=body,
        )
        self.assertEqual(response.status_code, 413, response.text)
        self.assertEqual(response.headers.get("x-content-type-options"), "nosniff")
        self.assertEqual(response.headers.get("cache-control"), "no-store")

    def test_render_rate_limit_uses_cloudflare_ip_not_forwarded_for(self):
        request = Request({
            "type": "http", "http_version": "1.1", "method": "GET", "scheme": "http",
            "path": "/api/token", "raw_path": b"/api/token", "query_string": b"",
            "headers": [(b"cf-connecting-ip", b"198.51.100.8"),
                        (b"x-forwarded-for", b"203.0.113.99")],
            "client": ("10.0.0.2", 12345), "server": ("testserver", 80),
        })
        with patch.dict(os.environ, {"RENDER": "true"}):
            self.assertEqual(rate_limit_client_address(request), "198.51.100.8")

    def test_local_rate_limit_ignores_forwarded_for(self):
        request = Request({
            "type": "http", "http_version": "1.1", "method": "GET", "scheme": "http",
            "path": "/api/token", "raw_path": b"/api/token", "query_string": b"",
            "headers": [(b"x-forwarded-for", b"203.0.113.99")],
            "client": ("192.0.2.24", 12345), "server": ("testserver", 80),
        })
        with patch.dict(os.environ):
            os.environ.pop("RENDER", None)
            self.assertEqual(rate_limit_client_address(request), "192.0.2.24")

    def test_health_and_headers(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "ok")
        self.assertEqual(response.headers.get("x-content-type-options"), "nosniff")
        with patch.dict(os.environ, {"RENDER": "true"}):
            proxied_https = self.client.get("/health", headers={"X-Forwarded-Proto": "https"})
        self.assertEqual(proxied_https.headers.get("strict-transport-security"), "max-age=31536000; includeSubDomains")

    def test_registration_login_and_tenant_isolation(self):
        tenant_a, headers_a = self.create_tenant("A")
        tenant_b, headers_b = self.create_tenant("B")
        a = self.client.get("/api/panels", headers=headers_a)
        b = self.client.get("/api/panels", headers=headers_b)
        self.assertEqual(a.status_code, 200, a.text)
        self.assertEqual(b.status_code, 200, b.text)
        self.assertEqual(a.json()["tenant_id"], tenant_a)
        self.assertEqual(b.json()["tenant_id"], tenant_b)
        ids_a = {panel["id"] for panel in a.json()["panels"]}
        ids_b = {panel["id"] for panel in b.json()["panels"]}
        self.assertTrue(ids_a)
        self.assertTrue(ids_b)
        self.assertTrue(ids_a.isdisjoint(ids_b))
        foreign_panel = next(iter(ids_b))
        forbidden_access = self.client.get(f"/api/panels/qr/{foreign_panel}", headers=headers_a)
        self.assertEqual(forbidden_access.status_code, 404)

    def test_tenant_isolation_across_operational_reads_and_mutations(self):
        _, headers_a = self.create_tenant("ISOLATIONREADA")
        tenant_b, headers_b = self.create_tenant("ISOLATIONREADB")
        foreign_panel_id = "FOREIGN-ISOLATION-PANEL"

        with SessionLocal() as db:
            panel = PanelModel(
                id=foreign_panel_id, tenant_id=tenant_b, name="Registro confidencial B",
                location="Localização confidencial B", voltage="380 V AC",
                gateway_qr="QR-FOREIGN-ISOLATION",
            )
            db.add(panel)
            db.flush()
            history = PanelHistoryModel(
                panel_id=panel.id, tenant_id=tenant_b, timestamp="2026-10-23T12:00:00Z",
                temperature=88.5, current=42.0,
            )
            alarm = AlarmModel(
                tenant_id=tenant_b, panel_id=panel.id, alarm_type="TEST_ISOLATION",
                severity="CRITICAL", message="Alarme privado da organização B",
            )
            asset = AssetModel(
                tenant_id=tenant_b, asset_tag="ASSET-ISOLATION-B",
                name="Ativo privado B", location="Sala B",
            )
            db.add_all([history, alarm, asset])
            db.flush()
            order = WorkOrderModel(
                tenant_id=tenant_b, alarm_id=alarm.id, panel_id=panel.id,
                title="OS privada B", description="Detalhe operacional privado B",
            )
            db.add(order)
            db.flush()
            checklist_item = WorkOrderChecklistItemModel(
                tenant_id=tenant_b, work_order_id=order.id,
                label="Item privado B",
            )
            template = WorkOrderChecklistTemplateModel(
                tenant_id=tenant_b, name="Modelo privado B", items_json='["Passo privado B"]',
                created_by="admin_ISOLATIONREADB",
            )
            plan = MaintenancePlanModel(
                tenant_id=tenant_b, asset_id=asset.id, title="Plano privado B",
                next_due_at=datetime(2026, 11, 1),
            )
            task = MaintenanceTaskModel(
                tenant_id=tenant_b, asset_id=asset.id, title="Tarefa privada B",
                due_at=datetime(2026, 11, 1), notes="Nota privada B",
            )
            credential = DeviceCredentialModel(
                tenant_id=tenant_b, panel_id=panel.id, name="Gateway privado B",
                token_hash=secrets.token_hex(32),
            )
            audit = AuditLogModel(
                tenant_id=tenant_b, user_name="admin_ISOLATIONREADB", role="CEO",
                action="TESTE_ISOLAMENTO", details="Auditoria privada B",
            )
            inventory = InventoryModel(
                tenant_id=tenant_b, part_name="Peça privada B", quantity_in_stock=7,
            )
            db.add_all([checklist_item, template, plan, task, credential, audit, inventory])
            db.commit()
            alarm_id, order_id = alarm.id, order.id
            checklist_id, template_id = checklist_item.id, template.id
            asset_id, task_id, credential_id = asset.id, task.id, credential.id

        # Each tenant-scoped collection must omit records owned by tenant B.
        dashboard = self.client.get("/api/panels", headers=headers_a)
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        self.assertNotIn(foreign_panel_id, dashboard.text)
        for endpoint, marker in (
            ("/api/alarms", "Alarme privado da organização B"),
            ("/api/assets", "Ativo privado B"),
            ("/api/maintenance/plans", "Plano privado B"),
            ("/api/maintenance/tasks", "Tarefa privada B"),
            ("/api/work-order-checklist-templates", "Modelo privado B"),
            ("/api/devices/credentials", "Gateway privado B"),
            ("/api/audit-logs", "Auditoria privada B"),
        ):
            response = self.client.get(endpoint, headers=headers_a)
            self.assertEqual(response.status_code, 200, f"{endpoint}: {response.text}")
            self.assertNotIn(marker, response.text, endpoint)
        self.assertEqual(
            self.client.get(f"/api/telemetry/history/{foreign_panel_id}", headers=headers_a).status_code,
            404,
        )

        # CEO has the broadest application role; foreign identifiers must still
        # be indistinguishable from missing records and must remain unchanged.
        foreign_mutations = (
            ("post", f"/api/alarms/{alarm_id}/acknowledge", None),
            ("post", f"/api/alarms/{alarm_id}/work-order", None),
            ("post", f"/api/alarms/{alarm_id}/clear", None),
            ("get", f"/api/panels/{foreign_panel_id}/alarm-rules", None),
            ("put", f"/api/panels/{foreign_panel_id}/alarm-rules", {"max_temperature": 90, "max_current": 600}),
            ("delete", f"/api/panels/{foreign_panel_id}/alarm-rules", None),
            ("patch", f"/api/work-orders/{order_id}", {"title": "Tentativa de alteração"}),
            ("patch", f"/api/work-orders/{order_id}/checklist/{checklist_id}", {"is_completed": True}),
            ("delete", f"/api/work-order-checklist-templates/{template_id}", None),
            ("patch", f"/api/assets/{asset_id}", {"notes": "Tentativa de alteração"}),
            ("patch", f"/api/maintenance/tasks/{task_id}", {"status": "CONCLUIDA"}),
            ("post", f"/api/devices/credentials/{credential_id}/revoke", None),
        )
        for method, endpoint, payload in foreign_mutations:
            response = self.client.request(method.upper(), endpoint, headers=headers_a, json=payload)
            self.assertEqual(response.status_code, 404, f"{method.upper()} {endpoint}: {response.text}")

        with SessionLocal() as db:
            self.assertEqual(db.query(AlarmModel).filter_by(id=alarm_id, tenant_id=tenant_b).one().status, "ACTIVE")
            self.assertEqual(db.query(WorkOrderModel).filter_by(id=order_id, tenant_id=tenant_b).one().title, "OS privada B")
            self.assertFalse(db.query(WorkOrderChecklistItemModel).filter_by(id=checklist_id, tenant_id=tenant_b).one().is_completed)
            self.assertIsNotNone(db.query(WorkOrderChecklistTemplateModel).filter_by(id=template_id, tenant_id=tenant_b).one())
            self.assertEqual(db.query(AssetModel).filter_by(id=asset_id, tenant_id=tenant_b).one().notes, "")
            self.assertEqual(db.query(MaintenanceTaskModel).filter_by(id=task_id, tenant_id=tenant_b).one().status, "PENDENTE")
            self.assertIsNone(db.query(DeviceCredentialModel).filter_by(id=credential_id, tenant_id=tenant_b).one().revoked_at)

    def test_hosted_public_registration_is_closed_by_default(self):
        with patch.dict(os.environ, {"RENDER": "true"}):
            os.environ.pop("ALLOW_SELF_SERVICE_REGISTRATION", None)
            status_response = self.client.get("/api/tenant/registration-status")
            self.assertEqual(status_response.status_code, 200, status_response.text)
            self.assertFalse(status_response.json()["self_service_enabled"])
            response = self.client.post("/api/tenant/register", json={
                "tenant_id": "PUBLIC-SIGNUP", "username": "admin_publicsignup",
                "password": "Senha-forte-de-teste-2026!",
            })
            self.assertEqual(response.status_code, 403, response.text)

    def test_mfa_enabled_account_requires_second_factor_at_login(self):
        tenant_id, _ = self.create_tenant("LOGINMFA")
        username = "admin_LOGINMFA"
        secret = pyotp.random_base32()
        recovery_code = "ABCD1234EFGH5678IJKL"
        with SessionLocal() as db:
            user = db.query(UserModel).filter(UserModel.username == username,
                                              UserModel.tenant_id == tenant_id).one()
            user.totp_enabled = True
            user.totp_secret_encrypted = encrypt_totp_secret(secret)
            user.totp_recovery_hashes = json.dumps([hash_recovery_code(recovery_code)])
            db.commit()

        credentials = {"username": username, "password": "Senha-forte-de-teste-2026!"}
        missing = self.client.post("/api/token", json=credentials)
        self.assertEqual(missing.status_code, 401)
        self.assertEqual(missing.json()["detail"], "MFA_REQUIRED")

        invalid = self.client.post("/api/token", json={**credentials, "mfa_code": "000000"})
        self.assertEqual(invalid.status_code, 401)
        self.assertNotIn("access_token", invalid.json())

        code = pyotp.TOTP(secret).now()
        valid = self.client.post("/api/token", json={**credentials, "mfa_code": code})
        self.assertEqual(valid.status_code, 200, valid.text)
        self.assertTrue(valid.json().get("access_token"))

        replayed = self.client.post("/api/token", json={**credentials, "mfa_code": code})
        self.assertEqual(replayed.status_code, 401)

        recovery_login = self.client.post("/api/token", json={**credentials, "mfa_code": recovery_code})
        self.assertEqual(recovery_login.status_code, 200, recovery_login.text)
        recovery_replay = self.client.post("/api/token", json={**credentials, "mfa_code": recovery_code})
        self.assertEqual(recovery_replay.status_code, 401)

    def test_websocket_ticket_is_single_use_and_bound_to_live_session(self):
        _, headers = self.create_tenant("WSTICKET")
        issued = self.client.post("/api/ws-ticket", headers=headers)
        self.assertEqual(issued.status_code, 200, issued.text)
        ticket = issued.json()["ticket"]
        with SessionLocal() as db:
            row = db.query(WebSocketTicketModel).filter_by(
                ticket_hash=hashlib.sha256(ticket.encode()).hexdigest()
            ).one()
            self.assertRegex(row.session_token_id_hash, r"^[a-f0-9]{64}$")

        ws_url = f"/ws/panels?ticket={ticket}"
        ws_headers = {"Origin": "http://localhost", "Host": "localhost"}
        with self.client.websocket_connect(ws_url, headers=ws_headers):
            pass
        with self.assertRaises(WebSocketDisconnect) as reused:
            with self.client.websocket_connect(ws_url, headers=ws_headers):
                pass
        self.assertEqual(reused.exception.code, 1008)

        second_ticket = self.client.post("/api/ws-ticket", headers=headers)
        self.assertEqual(second_ticket.status_code, 200, second_ticket.text)
        logout = self.client.post("/api/logout", headers=headers)
        self.assertEqual(logout.status_code, 200, logout.text)
        with self.assertRaises(WebSocketDisconnect) as revoked:
            with self.client.websocket_connect(
                f"/ws/panels?ticket={second_ticket.json()['ticket']}", headers=ws_headers,
            ):
                pass
        self.assertEqual(revoked.exception.code, 1008)

    def test_sensitive_routes_enforce_role_matrix(self):
        _, ceo_headers = self.create_tenant("ROLEMATRIX")
        credentials = {}
        for username, role in (("manager_rolematrix", "Gerente"), ("tech_rolematrix", "Técnico de Campo")):
            created = self.client.post("/api/users", headers=ceo_headers, json={
                "username": username, "password": "Senha-forte-de-teste-2026!", "role": role,
            })
            self.assertEqual(created.status_code, 200, created.text)
            login = self.client.post("/api/token", json={
                "username": username, "password": "Senha-forte-de-teste-2026!",
            })
            self.assertEqual(login.status_code, 200, login.text)
            credentials[role] = {"Authorization": f"Bearer {login.json()['access_token']}"}

        manager_headers = credentials["Gerente"]
        technician_headers = credentials["Técnico de Campo"]
        self.assertEqual(self.client.get("/api/users", headers=ceo_headers).status_code, 200)
        self.assertEqual(self.client.get("/api/users", headers=manager_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/users", headers=technician_headers).status_code, 403)

        self.assertEqual(self.client.get("/api/audit-logs", headers=ceo_headers).status_code, 200)
        self.assertEqual(self.client.get("/api/audit-logs", headers=manager_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/audit-logs", headers=technician_headers).status_code, 403)

        self.assertEqual(self.client.get("/api/devices/credentials", headers=ceo_headers).status_code, 200)
        self.assertEqual(self.client.get("/api/devices/credentials", headers=manager_headers).status_code, 200)
        self.assertEqual(self.client.get("/api/devices/credentials", headers=technician_headers).status_code, 403)

        self.assertEqual(self.client.get("/api/export/executive-report", headers=ceo_headers).status_code, 200)
        self.assertEqual(self.client.get("/api/export/executive-report", headers=manager_headers).status_code, 403)
        self.assertEqual(self.client.get("/api/export/executive-report", headers=technician_headers).status_code, 403)

        panel = self.client.get("/api/panels", headers=ceo_headers).json()["panels"][0]
        panel_id = panel["id"]

        # CEO-only mutations must reject both lower roles before making changes.
        ceo_only_mutations = (
            ("post", "/api/users", {"username": "should_not_be_created", "password": "Senha-forte-de-teste-2026!", "role": "Gerente"}),
            ("patch", "/api/users/tech_rolematrix", {"is_active": False}),
            ("post", "/api/users/tech_rolematrix/revoke-sessions", None),
            ("post", "/api/tenant/webhook", {"webhook_url": ""}),
            ("post", "/api/tenant/webhook/test", None),
        )
        for method, endpoint, payload in ceo_only_mutations:
            for role, headers in (("Gerente", manager_headers), ("Técnico de Campo", technician_headers)):
                response = self.client.request(method.upper(), endpoint, headers=headers, json=payload)
                self.assertEqual(response.status_code, 403, f"{role} {method.upper()} {endpoint}: {response.text}")

        # Organization managers may configure the service; technicians may
        # perform field work but cannot change tenant/device configuration.
        manager_writes = (
            ("post", "/api/tenant/rules", {"max_temperature": 90, "max_current": 600}),
            ("post", "/api/panels/add", {"id": "ROLE-MATRIX-NEW", "name": "Painel de teste", "location": "Local de teste"}),
            ("put", f"/api/panels/{panel_id}/alarm-rules", {"max_temperature": 90, "max_current": 600}),
            ("delete", f"/api/panels/{panel_id}/alarm-rules", None),
            ("post", "/api/demo/force-failure", {"panel_id": panel_id}),
            ("post", "/api/inventory/update", {"part_name": "Peça de teste", "quantity_change": 1}),
            ("post", "/api/work-order-checklist-templates", {"name": "Modelo de teste", "items": ["Verificar item"]}),
            ("delete", "/api/work-order-checklist-templates/999999", None),
            ("patch", "/api/assets/999999", {"notes": "Tentativa de edição"}),
            ("post", "/api/devices/credentials", {"panel_id": panel_id, "name": "Gateway de teste"}),
            ("post", "/api/devices/credentials/999999/revoke", None),
        )
        for method, endpoint, payload in manager_writes:
            response = self.client.request(method.upper(), endpoint, headers=technician_headers, json=payload)
            self.assertEqual(response.status_code, 403, f"Técnico {method.upper()} {endpoint}: {response.text}")

        # Verify the allowed edges too: a manager can configure, while a field
        # technician can create the operational records needed for field work.
        self.assertEqual(
            self.client.post("/api/tenant/rules", headers=manager_headers,
                             json={"max_temperature": 91, "max_current": 610}).status_code,
            200,
        )
        asset = self.client.post("/api/assets", headers=technician_headers, json={
            "asset_tag": "ROLE-TECH-ASSET", "name": "Ativo do técnico", "panel_id": panel_id,
        })
        self.assertEqual(asset.status_code, 201, asset.text)
        work_order = self.client.post("/api/work-orders", headers=technician_headers, json={
            "panel_id": panel_id, "title": "OS do técnico",
        })
        self.assertEqual(work_order.status_code, 201, work_order.text)

        with SessionLocal() as db:
            self.assertIsNone(db.query(UserModel).filter_by(username="should_not_be_created").first())
            technician = db.query(UserModel).filter_by(username="tech_rolematrix").one()
            self.assertTrue(technician.is_active)

    def test_every_api_route_requires_user_or_explicit_machine_authentication(self):
        intentionally_public = {
            "/api/token",  # Credentials are validated by the login endpoint.
            "/api/tenant/registration-status",  # Exposes only signup availability.
            "/api/tenant/register",  # Fail-closed unless explicitly enabled.
            "/api/device/telemetry",  # Requires a dedicated per-device bearer token.
        }
        unprotected = []
        for route in app.routes:
            path = getattr(route, "path", "")
            if not path.startswith("/api/") or path in intentionally_public:
                continue
            dependencies = list(getattr(getattr(route, "dependant", None), "dependencies", []))
            requires_user = False
            while dependencies:
                dependency = dependencies.pop()
                if dependency.call is get_current_user:
                    requires_user = True
                    break
                dependencies.extend(dependency.dependencies)
            if not requires_user:
                unprotected.append(path)
        self.assertEqual(unprotected, [], f"API routes lack server-side user auth: {unprotected}")

    def test_new_panel_waits_for_real_telemetry(self):
        _, headers = self.create_tenant("NEWPANEL")
        created = self.client.post("/api/panels/add", headers=headers, json={
            "id": "NEW-PANEL-01", "name": "Painel recém-cadastrado",
            "location": "Sala elétrica", "voltage": "380 V AC",
            "gateway_qr": "QR-NEW-PANEL-01",
        })
        self.assertEqual(created.status_code, 200, created.text)

        panel_response = self.client.get("/api/panels", headers=headers)
        panel = next(p for p in panel_response.json()["panels"] if p["id"] == "NEW-PANEL-01")
        self.assertEqual(panel["status"], "SEM_DADOS")
        self.assertFalse(panel["data_available"])
        self.assertFalse(panel["temperature_measured"])
        self.assertEqual(panel["current"], 0)
        self.assertEqual(panel["temperature"], 0)
        self.assertEqual(panel["connectivity_status"], "NOT_CONFIGURED")
        history = self.client.get("/api/telemetry/history/NEW-PANEL-01", headers=headers)
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual(history.json()["count"], 0)

        first_reading = self.client.post("/api/telemetry", headers=headers, json={
            "panel_id": "NEW-PANEL-01", "temperature": 32.5,
            "current": 12.0, "voltage": "381.2 V",
        })
        self.assertEqual(first_reading.status_code, 200, first_reading.text)
        updated = self.client.get("/api/panels", headers=headers).json()
        panel_after_reading = next(p for p in updated["panels"] if p["id"] == "NEW-PANEL-01")
        self.assertEqual(panel_after_reading["status"], "NORMAL")
        self.assertTrue(panel_after_reading["data_available"])
        self.assertTrue(panel_after_reading["temperature_measured"])
        self.assertEqual(panel_after_reading["current"], 12.0)
        self.assertEqual(panel_after_reading["temperature"], 32.5)

    def test_partial_device_reading_is_not_reported_as_normal(self):
        _, headers = self.create_tenant("PARTIAL")
        self.client.post("/api/panels/add", headers=headers, json={
            "id": "PARTIAL-PANEL", "name": "Painel parcial",
            "location": "Sala elétrica", "voltage": "380 V AC",
        })
        credential = self.client.post("/api/devices/credentials", headers=headers, json={
            "panel_id": "PARTIAL-PANEL", "name": "Gateway parcial",
        })
        self.assertEqual(credential.status_code, 201, credential.text)
        partial = self.client.post("/api/device/telemetry", headers={
            "Authorization": f"Bearer {credential.json()['device_token']}"
        }, json={"panel_id": "PARTIAL-PANEL", "voltage_v": 381.2})
        self.assertEqual(partial.status_code, 200, partial.text)

        panel = next(p for p in self.client.get("/api/panels", headers=headers).json()["panels"]
                     if p["id"] == "PARTIAL-PANEL")
        self.assertEqual(panel["status"], "PARCIAL")
        self.assertTrue(panel["data_available"])
        self.assertFalse(panel["temperature_has_reading"])
        self.assertFalse(panel["temperature_measured"])
        self.assertFalse(panel["current_has_reading"])
        self.assertFalse(panel["current_measured"])
        self.assertTrue(panel["voltage_has_reading"])
        self.assertTrue(panel["voltage_measured"])

    def test_inventory_cannot_become_negative(self):
        _, headers = self.create_tenant("STOCK")
        panels = self.client.get("/api/panels", headers=headers).json()["panels"]
        response = self.client.post("/api/inventory/update", headers=headers, json={
            "part_name": "Peça de teste", "category": "Teste", "quantity_change": 5,
            "unit_cost": 10, "min_threshold": 1
        })
        self.assertEqual(response.status_code, 200, response.text)
        response = self.client.post("/api/inventory/update", headers=headers, json={
            "part_name": "Peça de teste", "category": "Teste", "quantity_change": -6,
            "unit_cost": 10, "min_threshold": 1
        })
        self.assertEqual(response.status_code, 422, response.text)

    def test_alarm_lifecycle_and_tenant_isolation(self):
        tenant, headers = self.create_tenant("ALARMS")
        other_tenant, other_headers = self.create_tenant("OTHERALARMS")
        panel = self.client.get("/api/panels", headers=headers).json()["panels"][0]
        ingest = self.client.post("/api/telemetry", headers=headers, json={
            "panel_id": panel["id"], "temperature": 120, "current": 20, "voltage": "380V AC"
        })
        self.assertEqual(ingest.status_code, 200, ingest.text)
        alarms = self.client.get("/api/alarms?status_filter=ACTIVE", headers=headers)
        self.assertEqual(alarms.status_code, 200, alarms.text)
        self.assertTrue(any(a["alarm_type"] == "HIGH_TEMPERATURE" for a in alarms.json()))
        alarm = next(a for a in alarms.json() if a["alarm_type"] == "HIGH_TEMPERATURE")
        self.assertEqual(self.client.post(f"/api/alarms/{alarm['id']}/acknowledge", headers=headers).status_code, 200)
        foreign = self.client.post(f"/api/alarms/{alarm['id']}/clear", headers=other_headers)
        self.assertEqual(foreign.status_code, 404)
        clear_telemetry = self.client.post("/api/telemetry", headers=headers, json={
            "panel_id": panel["id"], "temperature": 30, "current": 20, "voltage": "380V AC"
        })
        self.assertEqual(clear_telemetry.status_code, 200, clear_telemetry.text)
        cleared = self.client.get(f"/api/alarms?status_filter=CLEARED", headers=headers)
        self.assertTrue(any(a["id"] == alarm["id"] for a in cleared.json()))

    def test_demo_simulation_creates_persistent_alarms(self):
        _, headers = self.create_tenant("SIMALARMS")
        panels = self.client.get("/api/panels", headers=headers).json()["panels"]
        panel = panels[0]
        response = self.client.post("/api/demo/force-failure", headers=headers, json={"panel_id": panel["id"]})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertGreaterEqual(response.json()["active_alarms"], 2)
        alarms = self.client.get("/api/alarms?status_filter=ACTIVE", headers=headers)
        self.assertEqual(alarms.status_code, 200, alarms.text)
        types = {alarm["alarm_type"] for alarm in alarms.json() if alarm["panel_id"] == panel["id"]}
        self.assertIn("HIGH_TEMPERATURE", types)
        self.assertIn("HIGH_CURRENT", types)

    def test_panel_alarm_rules_and_hysteresis(self):
        _, headers = self.create_tenant("PANELRULES")
        panel = self.client.get("/api/panels", headers=headers).json()["panels"][0]
        panel_id = panel["id"]
        saved = self.client.put(f"/api/panels/{panel_id}/alarm-rules", headers=headers, json={
            "max_temperature": 80, "max_current": 400,
            "temperature_hysteresis": 5, "current_hysteresis": 20
        })
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["max_temperature"], 80)
        read = self.client.get(f"/api/panels/{panel_id}/alarm-rules", headers=headers)
        self.assertTrue(read.json()["custom"])
        # Trigger at 82, remain active at 78 (limit - hysteresis = 75), clear at 74.
        self.assertEqual(self.client.post("/api/telemetry", headers=headers, json={"panel_id":panel_id,"temperature":82,"current":100,"voltage":"380V AC"}).status_code, 200)
        alarms = self.client.get("/api/alarms?status_filter=ACTIVE", headers=headers).json()
        alarm = next(a for a in alarms if a["panel_id"] == panel_id and a["alarm_type"] == "HIGH_TEMPERATURE")
        alarm_id = alarm["id"]
        self.client.post("/api/telemetry", headers=headers, json={"panel_id":panel_id,"temperature":78,"current":100,"voltage":"380V AC"})
        alarms = self.client.get("/api/alarms?status_filter=ACTIVE", headers=headers).json()
        self.assertTrue(any(a["id"] == alarm_id for a in alarms))
        self.client.post("/api/telemetry", headers=headers, json={"panel_id":panel_id,"temperature":74,"current":100,"voltage":"380V AC"})
        cleared = self.client.get("/api/alarms?status_filter=CLEARED", headers=headers).json()
        self.assertTrue(any(a["id"] == alarm_id for a in cleared))

    def test_panel_alarm_rules_tenant_isolation_and_validation(self):
        _, headers_a = self.create_tenant("RULESA")
        _, headers_b = self.create_tenant("RULESB")
        panel_a = self.client.get("/api/panels", headers=headers_a).json()["panels"][0]
        foreign = self.client.get(f"/api/panels/{panel_a['id']}/alarm-rules", headers=headers_b)
        self.assertEqual(foreign.status_code, 404)
        invalid = self.client.put(f"/api/panels/{panel_a['id']}/alarm-rules", headers=headers_a, json={"max_temperature":80,"max_current":100,"temperature_hysteresis":80,"current_hysteresis":10})
        self.assertEqual(invalid.status_code, 422)

    def test_asset_creation_and_tenant_isolation(self):
        tenant, headers = self.create_tenant("ASSET")
        other_tenant, other_headers = self.create_tenant("ASSETOTHER")
        panel = self.client.get("/api/panels", headers=headers).json()["panels"][0]
        created = self.client.post("/api/assets", headers=headers, json={
            "asset_tag": "ATIVO-001", "name": "Motor da bomba", "asset_type": "MOTOR",
            "location": "Sala de bombas", "manufacturer": "Fabricante teste", "panel_id": panel["id"]
        })
        self.assertEqual(created.status_code, 201, created.text)
        self.assertEqual(len(self.client.get("/api/assets", headers=headers).json()), 1)
        self.assertEqual(self.client.get("/api/assets", headers=other_headers).json(), [])
        duplicate = self.client.post("/api/assets", headers=headers, json={"asset_tag":"ATIVO-001","name":"Duplicado"})
        self.assertEqual(duplicate.status_code, 409)

    def test_maintenance_plan_generates_tasks_and_recurs(self):
        _, headers = self.create_tenant("MAINT")
        panel = self.client.get("/api/panels", headers=headers).json()["panels"][0]
        asset = self.client.post("/api/assets", headers=headers, json={"asset_tag":"AT-MANUT","name":"Painel teste","panel_id":panel["id"]})
        self.assertEqual(asset.status_code, 201, asset.text)
        plan = self.client.post("/api/maintenance/plans", headers=headers, json={"asset_id":asset.json()["id"],"title":"Inspeção mensal","interval_days":30,"checklist":"Visual;Conexões"})
        self.assertEqual(plan.status_code, 201, plan.text)
        tasks = self.client.get("/api/maintenance/tasks", headers=headers).json()
        self.assertEqual(len(tasks), 1)
        task_id = tasks[0]["id"]
        completed = self.client.patch(f"/api/maintenance/tasks/{task_id}", headers=headers, json={"status":"CONCLUIDA"})
        self.assertEqual(completed.status_code, 200, completed.text)
        self.assertEqual(len(self.client.get("/api/maintenance/tasks", headers=headers).json()), 2)

    def test_device_credential_ingestion_and_revocation(self):
        _, headers = self.create_tenant("DEVICE")
        panel = self.client.get("/api/panels", headers=headers).json()["panels"][0]
        credential = self.client.post("/api/devices/credentials", headers=headers, json={"panel_id":panel["id"],"name":"Gateway teste"})
        self.assertEqual(credential.status_code, 201, credential.text)
        token = credential.json()["device_token"]
        payload = {"panel_id":panel["id"],"temperature":45,"current":120,"voltage":"380V AC"}
        ingest = self.client.post("/api/device/telemetry", headers={"Authorization":f"Bearer {token}"}, json=payload)
        self.assertEqual(ingest.status_code, 200, ingest.text)
        self.assertEqual(ingest.json()["panel_id"], panel["id"])
        # Verify end-to-end persistence of all measurements, not just the current panel snapshot.
        dashboard = self.client.get("/api/panels", headers=headers)
        self.assertEqual(dashboard.status_code, 200, dashboard.text)
        latest = dashboard.json()["history"][panel["id"]][-1]
        self.assertEqual(latest["temperature"], 45)
        self.assertEqual(latest["current"], 120)
        self.assertEqual(latest["voltage"], "380V AC")
        credentials = self.client.get("/api/devices/credentials", headers=headers).json()
        self.assertTrue(credentials[0]["last_used_at"])
        wrong_panel = self.client.post("/api/device/telemetry", headers={"Authorization":f"Bearer {token}"}, json={**payload,"panel_id":"OUTRO"})
        self.assertEqual(wrong_panel.status_code, 403)
        revoked = self.client.post(f"/api/devices/credentials/{credential.json()['id']}/revoke", headers=headers)
        self.assertEqual(revoked.status_code, 200, revoked.text)
        rejected = self.client.post("/api/device/telemetry", headers={"Authorization":f"Bearer {token}"}, json=payload)
        self.assertEqual(rejected.status_code, 401)

    def test_device_telemetry_rejects_missing_token_and_invalid_ranges(self):
        _, headers = self.create_tenant("DEVICEVALIDATION")
        panel = self.client.get("/api/panels", headers=headers).json()["panels"][0]
        credential = self.client.post("/api/devices/credentials", headers=headers, json={"panel_id":panel["id"],"name":"Gateway validação"})
        self.assertEqual(credential.status_code, 201, credential.text)
        token = credential.json()["device_token"]
        payload = {"panel_id":panel["id"],"temperature":25,"current":10,"voltage":"380V AC"}
        no_token = self.client.post("/api/device/telemetry", json=payload)
        self.assertEqual(no_token.status_code, 401)
        invalid = self.client.post("/api/device/telemetry", headers={"Authorization":f"Bearer {token}"}, json={**payload,"current":-1})
        self.assertEqual(invalid.status_code, 422)

    def test_telemetry_history_pagination_tenant_isolation_and_device_status(self):
        _, headers = self.create_tenant("HISTORY")
        _, other_headers = self.create_tenant("HISTORYOTHER")
        panel = self.client.get("/api/panels", headers=headers).json()["panels"][0]
        initial_status = next(x for x in self.client.get("/api/panels", headers=headers).json()["panels"] if x["id"] == panel["id"])
        self.assertEqual(initial_status["connectivity_status"], "NOT_CONFIGURED")
        credential = self.client.post("/api/devices/credentials", headers=headers, json={"panel_id":panel["id"],"name":"Gateway histórico"})
        self.assertEqual(credential.status_code, 201, credential.text)
        after_create = next(x for x in self.client.get("/api/panels", headers=headers).json()["panels"] if x["id"] == panel["id"])
        self.assertEqual(after_create["connectivity_status"], "NEVER_CONNECTED")
        token = credential.json()["device_token"]
        for temp in (31, 32, 33):
            response = self.client.post("/api/device/telemetry", headers={"Authorization":f"Bearer {token}"}, json={"panel_id":panel["id"],"temperature":temp,"current":12,"voltage":"380V AC"})
            self.assertEqual(response.status_code, 200, response.text)
        online_panel = next(x for x in self.client.get("/api/panels", headers=headers).json()["panels"] if x["id"] == panel["id"])
        self.assertEqual(online_panel["connectivity_status"], "ONLINE")
        page1 = self.client.get(f"/api/telemetry/history/{panel['id']}?limit=2", headers=headers)
        self.assertEqual(page1.status_code, 200, page1.text)
        self.assertEqual(page1.json()["count"], 2)
        self.assertTrue(page1.json()["has_more"])
        page2 = self.client.get(f"/api/telemetry/history/{panel['id']}?limit=2&before_id={page1.json()['next_before_id']}", headers=headers)
        self.assertEqual(page2.status_code, 200, page2.text)
        self.assertTrue(all(a["id"] < b["id"] for a, b in zip(page2.json()["history"], page2.json()["history"][1:])))
        foreign = self.client.get(f"/api/telemetry/history/{panel['id']}", headers=other_headers)
        self.assertEqual(foreign.status_code, 404)
        invalid_limit = self.client.get(f"/api/telemetry/history/{panel['id']}?limit=1001", headers=headers)
        self.assertEqual(invalid_limit.status_code, 422)

    def test_report_requires_authentication(self):
        response = self.client.get("/api/export/executive-report")
        self.assertEqual(response.status_code, 401)

    def test_weak_password_rejected(self):
        response = self.client.post("/api/tenant/register", json={
            "tenant_id": "TEST-WEAK", "username": "weak_user", "password": "1234567890"
        })
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
