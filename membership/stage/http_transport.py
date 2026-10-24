"""Keep membership failures separate from the test entrance's HTTP Basic challenge.

Only the isolated launcher installs this transport. The browser receives 403 for
an application 401, with the original status in a response header. JSON bodies,
cookies and authorization decisions are preserved; Nginx's entrance stays 401.
"""
import importlib
import os


class StageAuthTransport:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        async def stage_send(message):
            if scope['type'] == 'http' and message['type'] == 'http.response.start' and message['status'] == 401:
                message = dict(message)
                message['status'] = 403
                headers = [(key, value) for key, value in message.get('headers', [])
                           if key.lower() not in {b'www-authenticate', b'x-rangerbook-auth-status'}]
                headers.append((b'x-rangerbook-auth-status', b'401'))
                if not any(key.lower() == b'cache-control' for key, _ in headers):
                    headers.append((b'cache-control', b'no-store, private'))
                message['headers'] = headers
            await send(message)
        await self.app(scope, receive, stage_send)


def create_app():
    from .launch import validate
    validate(os.environ)
    return StageAuthTransport(importlib.import_module('asgi').app)
