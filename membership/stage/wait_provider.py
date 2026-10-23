"""Wait for provider readiness without requesting any secret value."""
import time
import urllib.error
import urllib.request


def main():
    for attempt in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:2773/ping', timeout=1):
                return
        except (urllib.error.URLError, OSError):
            if attempt == 19:
                raise RuntimeError('Test secret provider is unavailable') from None
            time.sleep(0.5)


if __name__ == '__main__':
    main()
