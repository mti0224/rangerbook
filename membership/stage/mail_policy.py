"""Explicit test-mail ceiling. Raising it requires owner approval, never a reset."""
import math
import os


def mail_limits(env=None):
    env = os.environ if env is None else env
    budget = int(env.get('RANGERBOOK_STAGE_MAIL_MAX_ATTEMPTS', '5'))
    deadline = float(env.get('RANGERBOOK_STAGE_EXPIRES_AT', '0'))
    if not 1 <= budget <= 20 or not math.isfinite(deadline) or deadline < 0:
        raise ValueError('Invalid approved test-mail budget or deadline')
    return budget, deadline
