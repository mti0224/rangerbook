"""Read-only aggregate mail health; never outputs payloads or recipient data."""
import argparse
import json
from pathlib import Path
import sqlite3
import time


def inspect(database, now=None):
    now = time.time() if now is None else now
    # mode=ro also prevents typo paths from silently creating databases.
    with sqlite3.connect(Path(database).resolve().as_uri() + '?mode=ro', uri=True) as con:
        counts = dict(con.execute('SELECT status,count(*) FROM member_outbox GROUP BY status'))
        overdue = con.execute("SELECT count(*) FROM member_outbox WHERE status='pending' AND next_attempt<? AND lease_until<?", (now - 600, now)).fetchone()[0]
        suppression_count = con.execute('SELECT count(*) FROM member_suppression').fetchone()[0]
    return {'healthy': counts.get('failed', 0) == 0 and overdue == 0,
            'outbox_counts': counts, 'overdue_pending': overdue,
            'suppression_count': suppression_count}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', type=Path, required=True)
    args = parser.parse_args()
    result = inspect(args.database)
    print(json.dumps(result))
    return 0 if result['healthy'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
