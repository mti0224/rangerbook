"""Fixed, public-safe reason codes; never return extracted log text or identifiers."""
import re

# These are display classifications, not translations of undocumented game codes.
KNOWN_API_CODES = ('112004', '119801', '429', '512')
EVIDENCE = (r'GLOBAL_MAINTENANCE|HTTP[ :]+[45][0-9]{2}|errorCode|'
            r'Invalid HTTP request|timed out|TimeoutError|No space left on device|'
            r'PermissionError|Permission denied|ConnectionError|Connection refused')


def describe(text, status='success', *, complete=False):
    """Only emit a small vocabulary; even filtered/incomplete input cannot leak text."""
    http = sorted(set(re.findall(r'\bHTTP[ :]+([45]\d{2})\b', text)))
    api = [code for code in KNOWN_API_CODES
           if re.search(r'\berrorCode[\s\"\']*[:= ]+[\s\"\']*'+code+r'\b', text)]
    reason = 'unknown' if status == 'failed' else 'completed'
    if 'GLOBAL_MAINTENANCE' in text:
        reason = 'maintenance'
    elif '429' in http or '429' in api:
        reason = 'rateLimited'
    elif re.search(r'\b(?:timed out|TimeoutError)\b', text, re.I):
        reason = 'timeout'
    elif 'No space left on device' in text:
        reason = 'diskFull'
    elif re.search(r'PermissionError|Permission denied', text):
        reason = 'permission'
    elif re.search(r'ConnectionError|Connection refused', text):
        reason = 'connection'
    elif 'Invalid HTTP request' in text:
        reason = 'invalidRequest'
    elif '112004' in api:
        reason = 'unavailableData'
    elif any(int(code) >= 500 for code in http):
        reason = 'serviceUnavailable'
    elif http or api:
        reason = 'apiRejected'
    # Only complete, sanitized output can establish that nothing changed.
    if complete and reason == 'completed':
        changes = re.findall(r'(?:DB 更新|JSON 轉換)[：:]\s*(\d+)', text)
        unchanged = re.findall(r'(?:DB 未變更|JSON 無需轉換)[：:]\s*(\d+)', text)
        if changes and all(int(n) == 0 for n in changes) and any(int(n) > 0 for n in unchanged):
            reason = 'unchanged'
    return {'reason': reason, 'httpCodes': http[:3], 'apiCodes': api[:3],
            'warning': status == 'success' and reason not in {'completed', 'unchanged'}}
