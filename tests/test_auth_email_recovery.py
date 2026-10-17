"""Run: python -m unittest tests.test_auth_email_recovery

Requires backend requirements plus httpx (FastAPI TestClient). No SES calls or
production database are touched.
"""
from __future__ import annotations

import importlib
import os
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "rangerbook_auth"))

# Configure a fresh, disposable DB before importing app (DB_PATH is set at import).
TEST_DIR = tempfile.TemporaryDirectory(prefix="rangerbook-email-tests-")
os.environ["RANGERBOOK_AUTH_DB"] = str(pathlib.Path(TEST_DIR.name) / "auth.db")
os.environ["RANGERBOOK_EMAIL_ENABLED"] = "1"
os.environ["RANGERBOOK_EMAIL_REQUIRED"] = "1"
os.environ["RANGERBOOK_SES_FROM"] = "no-reply@warmycat.com"

from fastapi.testclient import TestClient
import account_email
from asgi import app
from app import bootstrap_super_admin

ORIGIN = {"origin": "https://rangerbook.warmycat.com"}


class AccountEmailRecoveryTests(unittest.TestCase):
    def test_full_flow(self):
        sent = []

        def fake_send(address, purpose, token):
            sent.append((address, purpose, token))

        with patch.object(account_email, "_send_email", fake_send):
            with TestClient(app) as client:
                bootstrap_super_admin("rootowner", "a-strong-super-admin-password")
                register = client.post(
                    "/auth/register", headers=ORIGIN,
                    json={"account": "newplayer", "password": "first-password-strong",
                          "email": "player@example.net"},
                )
                self.assertEqual(register.status_code, 200, register.text)
                self.assertTrue(register.json()["email_verification_required"])
                self.assertEqual(sent[-1][:2], ("player@example.net", "verify"))

                login = client.post(
                    "/auth/login", headers=ORIGIN,
                    json={"account": "newplayer", "password": "first-password-strong"},
                )
                self.assertEqual(login.status_code, 200, login.text)
                before = client.get("/auth/email/status").json()
                self.assertIsNone(before["email"])
                self.assertEqual(before["pending_email"], "player@example.net")

                # Pending/unverified email addresses must not receive reset links.
                res = client.post(
                    "/auth/password/forgot", headers=ORIGIN,
                    json={"email": "player@example.net"},
                )
                self.assertEqual(res.status_code, 200)
                self.assertEqual(len(sent), 1)

                verify_token = sent[-1][2]
                good = client.post(
                    "/auth/email/confirm", headers=ORIGIN,
                    json={"token": verify_token},
                )
                self.assertEqual(good.status_code, 200, good.text)
                repeat_verify = client.post(
                    "/auth/email/confirm", headers=ORIGIN,
                    json={"token": verify_token},
                )
                self.assertEqual(repeat_verify.status_code, 400)
                self.assertTrue(client.get("/auth/email/status").json()["verified"])

                # Nonexisting addresses get exactly the same success response.
                unknown = client.post(
                    "/auth/password/forgot", headers=ORIGIN,
                    json={"email": "nobody@example.net"},
                )
                known = client.post(
                    "/auth/password/forgot", headers=ORIGIN,
                    json={"email": "player@example.net"},
                )
                self.assertEqual(unknown.json(), known.json())
                self.assertEqual(sent[-1][:2], ("player@example.net", "reset"))
                reset_token = sent[-1][2]
                invalid = client.post(
                    "/auth/password/reset", headers=ORIGIN,
                    json={"token": "z" * 43, "new_password": "second-password-strong"},
                )
                self.assertEqual(invalid.status_code, 400)

                reset = client.post(
                    "/auth/password/reset", headers=ORIGIN,
                    json={"token": reset_token, "new_password": "second-password-strong"},
                )
                self.assertEqual(reset.status_code, 200, reset.text)
                self.assertEqual(client.get("/auth/me").json()["logged_in"], False)
                reuse = client.post(
                    "/auth/password/reset", headers=ORIGIN,
                    json={"token": reset_token, "new_password": "third-password-strong"},
                )
                self.assertEqual(reuse.status_code, 400)
                old = client.post(
                    "/auth/login", headers=ORIGIN,
                    json={"account": "newplayer", "password": "first-password-strong"},
                )
                self.assertEqual(old.status_code, 401)
                new = client.post(
                    "/auth/login", headers=ORIGIN,
                    json={"account": "newplayer", "password": "second-password-strong"},
                )
                self.assertEqual(new.status_code, 200)

                # No anonymous administrative reset and no predictable password endpoint.
                self.assertEqual(
                    client.post("/admin/users/usr_any/reset-password", headers=ORIGIN).status_code,
                    404,
                )


if __name__ == "__main__":
    unittest.main()
