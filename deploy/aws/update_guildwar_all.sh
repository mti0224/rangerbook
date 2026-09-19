#!/usr/bin/env bash
set -u

PY="/home/ubuntu/rangerbook-guildwar-env/bin/python"
COLLECTOR="/home/ubuntu/rangerbook-scripts/collect_guildwar_compact.py"
PLAYER_INDEX_COLLECTOR="/home/ubuntu/rangerbook-scripts/collect_guildwar_player_index.py"
INDEX_BUILDER="/home/ubuntu/build_guildwar_usage_index.py"

LOCK_DIR="/home/ubuntu/rangerbook-cache/guildwar_compact"
LOCK_FILE="${LOCK_DIR}/scheduled-update.lock"

mkdir -p "$LOCK_DIR"

exec 9>"$LOCK_FILE"

if ! flock -n 9; then
    echo "[SKIP] Another Guild War scheduled update is already running."
    exit 0
fi

echo "============================================================"
echo "[START] Guild War full scheduled update"
echo "[TIME]  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

FAILED=0
PLAYER_INDEX_PID=""

if [ -f "$PLAYER_INDEX_COLLECTOR" ]; then
    echo
    echo "[START] Player index collector (LEGEND -> GOLD) in parallel"
    "$PY" "$PLAYER_INDEX_COLLECTOR" &
    PLAYER_INDEX_PID=$!
else
    echo "[ERROR] Player index collector not found: $PLAYER_INDEX_COLLECTOR"
    FAILED=1
fi

for TIER in LEGEND MASTER; do
    echo
    echo "============================================================"
    echo "[START] ${TIER}"
    echo "[TIME]  $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    echo "============================================================"

    if "$PY" "$COLLECTOR" --tier "$TIER"; then
        echo "[OK] ${TIER} compact data updated."

        if "$PY" "$INDEX_BUILDER" "$TIER"; then
            echo "[OK] ${TIER} usage index updated."
        else
            echo "[ERROR] ${TIER} usage index build failed."
            FAILED=1
        fi
    else
        echo "[ERROR] ${TIER} compact collector failed."
        echo "[SKIP] ${TIER} usage index will NOT be rebuilt from failed/stale collector result."
        FAILED=1
    fi

    echo "[END] ${TIER} - $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
done

if [ -n "$PLAYER_INDEX_PID" ]; then
    echo
    echo "============================================================"
    echo "[WAIT] Player index collector PID=${PLAYER_INDEX_PID}"
    echo "============================================================"

    if wait "$PLAYER_INDEX_PID"; then
        echo "[OK] Player index updated from LEGEND through GOLD."
    else
        echo "[ERROR] Player index update failed."
        FAILED=1
    fi
fi

echo
echo "============================================================"

if [ "$FAILED" -eq 0 ]; then
    echo "[DONE] All Guild War data and player index updates completed successfully."
else
    echo "[DONE WITH ERRORS] One or more Guild War update jobs failed."
fi

echo "[TIME] $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "============================================================"

exit "$FAILED"
