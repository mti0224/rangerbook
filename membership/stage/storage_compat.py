"""Keep already-issued synthetic IDs usable without rewriting identity records."""
import os
from pathlib import Path
import re

from .launch import ROOT


def configure(game_binding):
    if os.environ.get('RANGERBOOK_STAGE') != '1':
        return False
    # This compatibility branch must never change production storage validation.
    database = Path(os.environ.get('RANGERBOOK_AUTH_DB', '')).resolve()
    teams = Path(os.environ.get('RANGERBOOK_PRIVATE_TEAM_DIR', '')).resolve()
    if database != ROOT / 'auth.db' or teams != ROOT / 'teams' or game_binding.PRIVATE_DIR.resolve() != teams:
        raise RuntimeError('Synthetic ID compatibility requires the isolated acceptance paths')
    game_binding.PRIVATE_USER_ID = re.compile(r'^(?:usr_[A-Za-z0-9_-]{12,64}|stage-[0-9a-f]{24})$')
    return True
