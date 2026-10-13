#!/usr/bin/env python3
"""Fetch aggregate GA4 metrics into private, atomic report cache files."""
from __future__ import annotations
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import DateRange, Dimension, Filter, FilterExpression, Metric, OrderBy, RunReportRequest
from popular_pages import build_popular_report

PROPERTY = os.getenv("RANGERBOOK_GA4_PROPERTY_ID", "").strip()
CACHE = Path(os.getenv("RANGERBOOK_TRAFFIC_CACHE_DIR", "/home/ubuntu/rangerbook-auth/traffic-cache"))

def query(client, days, dimensions, metrics, limit=100):
    response = client.run_report(RunReportRequest(
        property="properties/" + PROPERTY,
        date_ranges=[DateRange(start_date=f"{days - 1}daysAgo", end_date="today")],
        dimensions=[Dimension(name=name) for name in dimensions],
        metrics=[Metric(name=name) for name in metrics],
        limit=limit,
    ))
    return [
        ([value.value for value in row.dimension_values],
         [int(float(value.value)) for value in row.metric_values])
        for row in response.rows
    ]

def generate(client, days):
    totals = query(client, days, [], ["totalUsers", "screenPageViews", "sessions", "engagedSessions"], 1)
    numbers = totals[0][1] if totals else [0, 0, 0, 0]
    trend = query(client, days, ["date"], ["totalUsers", "screenPageViews"], 120)
    pages = query(client, days, ["pagePath"], ["screenPageViews"], 100)
    sources = query(client, days, ["sessionDefaultChannelGroup"], ["sessions"], 100)
    return {
        "status": "ready",
        "days": days,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": dict(zip(["users", "views", "sessions", "engagedSessions"], numbers)),
        "daily": sorted([
            {"date": f"{d[0][:4]}-{d[0][4:6]}-{d[0][6:]}",
             "users": m[0], "views": m[1]} for d, m in trend
        ], key=lambda value: value["date"]),
        "pages": [
            {"path": d[0], "views": m[0]} for d, m in
            sorted(pages, key=lambda value: value[1][0], reverse=True)
            if not d[0].startswith("/admin")
        ][:25],
        "sources": [
            {"source": d[0], "sessions": m[0]} for d, m in
            sorted(sources, key=lambda value: value[1][0], reverse=True)
        ][:20],
    }

def generate_popular(client):
    # Read all rows before canonicalizing aliases, rather than ranking a truncated
    # admin report. Only production hosts and navigable leaf pages are eligible.
    pages, offset = [], 0
    while True:
        response = client.run_report(RunReportRequest(
            property="properties/" + PROPERTY,
            date_ranges=[DateRange(start_date="6daysAgo", end_date="today")],
            dimensions=[Dimension(name="pagePath")],
            metrics=[Metric(name="screenPageViews")],
            dimension_filter=FilterExpression(filter=Filter(
                field_name="hostName", in_list_filter=Filter.InListFilter(
                    values=["rangerbook.warmycat.com", "mti0224.github.io"]))),
            order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="screenPageViews"), desc=True)],
            limit=10000, offset=offset,
        ))
        pages.extend({"path": row.dimension_values[0].value,
                      "views": int(float(row.metric_values[0].value))} for row in response.rows)
        offset += len(response.rows)
        if not response.rows or offset >= response.row_count:
            break
    return build_popular_report(pages, datetime.now(timezone.utc).isoformat())

def write_cache(name, report):
    fd, temporary = tempfile.mkstemp(prefix=".traffic-", dir=CACHE)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False)
        os.chmod(temporary, 0o600)
        os.replace(temporary, CACHE / name)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def main():
    if not PROPERTY.isdigit():
        raise SystemExit("Missing numeric RANGERBOOK_GA4_PROPERTY_ID")
    client = BetaAnalyticsDataClient()
    CACHE.mkdir(parents=True, exist_ok=True)
    for days in (7, 30, 90):
        report = generate(client, days)
        write_cache(f"report-{days}.json", report)
        print(f"GA4 report updated: {days} days")
    write_cache("popular-pages.json", generate_popular(client))
    print("GA4 public leaf-page ranking updated: 7 days")

if __name__ == "__main__":
    main()
