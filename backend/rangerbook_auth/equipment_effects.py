"""Compact public equipment with its actual advanced-option value.

Both inputs belong to the independent V2 pipeline. Never substitute a default
option or the maximum roll for a player's selected attribute and value grade.
"""
from __future__ import annotations

import json
import os
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from pathlib import Path
from typing import Any

ATTR_PATH = Path(os.getenv("RANGERBOOK_EQUIPMENT_ATTRIBUTES", "/home/ubuntu/rangerbook-v2/data/raw/unit_eqip_attr.json"))
CATALOG_PATH = Path(os.getenv("RANGERBOOK_EQUIPMENT_CATALOG", "/home/ubuntu/rangerbook-v2/data/v2/equipment.json"))
ITEM_PATH = Path(os.getenv("RANGERBOOK_EQUIPMENT_ITEMS", "/home/ubuntu/rangerbook-v2/data/raw/game_item_equip.json"))


@lru_cache(maxsize=2)
def _items(path: str, mtime: int):
    return {str(row["itemCode"]): row for row in json.loads(Path(path).read_text())}


def _roll(definition: dict, grade: Any) -> Decimal | None:
    divisions = _integer(definition.get("valueDivideGrades"))
    grade = _integer(grade)
    if divisions is None or divisions < 1 or grade is None or not 0 <= grade < divisions:
        return None
    low, high = (Decimal(str(definition[k])) for k in ("minValue", "maxValue"))
    return low if divisions == 1 else low + (high - low) * grade / (divisions - 1)


def analysis_values(equipment: dict[str, Any]) -> dict[str, Any]:
    """Only public combat attributes; never return inventory/account identifiers.

    Basic enchant uses the existing equipment-detail rule: rolled value times
    (currentEnchant + 1). attrNProb is not a stat enhancement multiplier.
    Missing rolls remain unknown; they are never substituted with max rolls.
    """
    try:
        attrs, _ = _definitions(str(ATTR_PATH), ATTR_PATH.stat().st_mtime_ns,
                                str(CATALOG_PATH), CATALOG_PATH.stat().st_mtime_ns)
        items = _items(str(ITEM_PATH), ITEM_PATH.stat().st_mtime_ns)
        item = items.get(equipment["itemCode"])
        if not item:
            return {}
        output = {"normalOptions": []}
        enchant = _integer(equipment.get("currentEnchant"))
        if enchant is not None and not 0 <= enchant <= int(item.get("maxEnchant", 0)):
            enchant = None
        for i in range(1, 4):
            attr_id = str(equipment.get(f"attr{i}No", ""))
            attr = attrs.get(attr_id)
            if not attr:
                continue
            option = {"optionKey": "EQUIP:GEAR_FILTER_" + attr["reinforceType"] + "_nm",
                      "value": None, "unit": "PERCENT" if attr["reinforceType"].endswith("_MUL") else "FLAT"}
            value = _roll(attr, equipment.get(f"attr{i}ValueGrade"))
            fields = [f"attr{n}" for n in range(1, 4) if str(item.get(f"attr{n}")) == attr_id]
            if value is not None and enchant is not None and len(fields) == 1:
                value *= enchant + 1
                if option["unit"] == "PERCENT":
                    value *= 100
                if value.is_finite():
                    option["value"] = float(round(value, 6))
            output["normalOptions"].append(option)
        if int(item.get("equipGrade", 0)) >= 7:
            attr = attrs.get(str(equipment.get("attr4No")))
            if attr:
                output["attr4OptionKey"] = "EQUIP:GEAR_FILTER_" + attr["reinforceType"] + "_nm"
                condition = attr.get("unitEquipRandOptTrigType")
                output["attr4Condition"] = ({"kind": "rangerType", "value": condition}
                                              if condition not in (None, "", "NONE") else {"kind": "always"})
        return output
    except (OSError, ValueError, KeyError, TypeError, InvalidOperation):
        return {}


@lru_cache(maxsize=2)
def _definitions(attr_path: str, attr_mtime: int, catalog_path: str, catalog_mtime: int):
    attrs = {str(row["attrNo"]): row for row in json.loads(Path(attr_path).read_text())}
    upgrades: dict[str, set[Decimal]] = {}
    for equipment in json.loads(Path(catalog_path).read_text())["equipment"]:
        for option in (equipment.get("highLevelOptions") or {}).get("switchOptions", []):
            if option.get("upgradeStep") is not None:
                upgrades.setdefault(option["optionKey"], set()).add(Decimal(str(option["upgradeStep"])))
    return attrs, upgrades


def _integer(value: Any) -> int | None:
    if isinstance(value, bool) or value in (None, ""):
        return None
    try:
        number = Decimal(str(value))
        return int(number) if number.is_finite() and number == number.to_integral_value() else None
    except (InvalidOperation, ValueError, OverflowError):
        return None


def advanced_value(equipment: dict[str, Any]) -> dict[str, Any]:
    grade = _integer(equipment.get("attr4ValueGrade"))
    enchant = _integer(equipment.get("currentAdvancedEnchant"))
    if grade is None or enchant is None or enchant < 0:
        return {}
    try:
        attrs, upgrades = _definitions(str(ATTR_PATH), ATTR_PATH.stat().st_mtime_ns,
                                       str(CATALOG_PATH), CATALOG_PATH.stat().st_mtime_ns)
        definition = attrs.get(str(equipment.get("attr4No")))
        if not definition:
            return {}
        divisions = _integer(definition.get("valueDivideGrades"))
        if divisions is None or divisions < 1 or not 0 <= grade < divisions:
            return {}
        kind = definition["reinforceType"]
        scale = 100 if kind.endswith("_MUL") else 1
        low, high = (Decimal(str(definition[key])) * scale for key in ("minValue", "maxValue"))
        value = low if divisions == 1 else low + (high - low) * grade / (divisions - 1)
        if enchant:
            steps = upgrades.get("EQUIP:GEAR_FILTER_" + kind + "_nm", set())
            if len(steps) != 1:
                return {}
            value += next(iter(steps)) * enchant
        if not value.is_finite():
            return {}
        return {"attr4Value": float(round(value, 6)), "attr4Unit": "PERCENT" if scale == 100 else "FLAT"}
    except (OSError, ValueError, KeyError, TypeError, InvalidOperation):
        # A temporarily unavailable V2 release must not break player queries.
        return {}


def public_equipment(value: Any) -> dict[str, Any] | None:
    if isinstance(value, str):
        return {"itemCode": value.strip()} if value.strip() else None
    if not isinstance(value, dict):
        return None
    code = str(value.get("equipItemCode") or value.get("itemCode") or value.get("code") or "").strip()
    if not code:
        return None
    output: dict[str, Any] = {"itemCode": code}
    for key in ("attr4No", "attr4ValueGrade", "currentAdvancedEnchant", "currentEnchant",
                *(f"attr{i}{suffix}" for i in range(1, 4) for suffix in ("No", "ValueGrade"))):
        if value.get(key) not in (None, ""):
            output[key] = value[key]
    output.update(advanced_value(output))
    output.update(analysis_values(output))
    return output
