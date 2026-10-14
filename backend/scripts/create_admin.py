"""Create an admin login, or reset its password.

    python -m scripts.create_admin you@example.com
"""

import getpass
import sys

from app.auth import hash_password
from app.db import SessionLocal
from app.models import User


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Usage: python -m scripts.create_admin EMAIL")
    email = sys.argv[1].strip().lower()
    password = getpass.getpass("Password (min 8 characters): ")
    if len(password) < 8:
        sys.exit("Password too short")
    if password != getpass.getpass("Again: "):
        sys.exit("Passwords don't match")
    db = SessionLocal()
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.password_hash = hash_password(password)
        print(f"Password updated for {email}")
    else:
        db.add(User(email=email, name=email.split("@")[0], password_hash=hash_password(password)))
        print(f"Admin {email} created")
    db.commit()
    db.close()


if __name__ == "__main__":
    main()
