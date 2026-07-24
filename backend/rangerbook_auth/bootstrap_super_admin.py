from __future__ import annotations

import getpass
import sys

from app import bootstrap_super_admin


def main() -> int:
    if len(sys.argv) > 2:
        print("Usage: python bootstrap_super_admin.py [account]", file=sys.stderr)
        return 2

    account = sys.argv[1].strip() if len(sys.argv) == 2 else input("Super admin account: ").strip()
    password = getpass.getpass("Super admin password: ")
    confirm = getpass.getpass("Confirm password: ")

    if password != confirm:
        print("Passwords do not match.", file=sys.stderr)
        return 1

    try:
        user = bootstrap_super_admin(account, password)
    except Exception as error:
        print(f"Failed: {error}", file=sys.stderr)
        return 1

    print(f"Super admin ready: {user['account']} ({user['id']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
