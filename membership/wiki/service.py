"""Wiki routes, installed explicitly by the isolated acceptance app factory.

Drafts and immutable revisions live outside the public website. A publication is
an atomic pointer change; public routes never read the mutable working document.
"""
import base64
import binascii
from contextlib import contextmanager
from datetime import datetime, timezone
from html import escape
from html.parser import HTMLParser
from io import BytesIO
import json
import os
from pathlib import Path
import re
import sqlite3
from urllib.parse import urlsplit
import uuid
import warnings

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, UnidentifiedImageError

MAX_BODY = 9 * 1024 * 1024
MAX_IMAGE = 6 * 1024 * 1024
SLUG = re.compile(r'^[a-z0-9][a-z0-9-]{0,79}$')
ID = re.compile(r'^[a-f0-9]{32}$')
KINDS = {'header', 'subheader', 'paragraph', 'latex', 'code', 'image'}


class WikiBodyLimit:
    """Keep the existing auth limit; allow bounded documents/images on wiki paths."""
    def __init__(self, app, max_bytes=16384):
        self.app, self.default = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope.get('method') not in {'POST', 'PUT', 'PATCH'}:
            return await self.app(scope, receive, send)
        path = scope.get('path', '')
        limit = MAX_BODY if path.startswith('/admin/wiki/images/') else 600000 if path.startswith('/admin/wiki/articles') else self.default
        messages, size = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            size += len(message.get('body', b''))
            if size > limit:
                return await JSONResponse({'detail': '請求內容超過大小限制。'}, status_code=413)(scope, receive, send)
            messages.append(message)
            if not message.get('more_body', False):
                break
        async def replay():
            return messages.pop(0) if messages else await receive()
        await self.app(scope, replay, send)


def now():
    return datetime.now(timezone.utc).isoformat()


class InlineHTML(HTMLParser):
    """Small, symmetric formatting allowlist for stored rich text."""
    tags = {'b', 'strong', 'i', 'em', 's', 'strike', 'del', 'u', 'br', 'a', 'code', 'mark'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        if tag not in self.tags:
            return
        if tag == 'a':
            href = dict(attrs).get('href', '')
            try:
                parsed = urlsplit(href.strip())
            except ValueError:
                parsed = urlsplit('#')
            if not (parsed.scheme in {'http', 'https'} and parsed.netloc) and not (
                    href.startswith(('/', '#')) and not href.startswith('//')):
                href = '#'
            self.parts.append('<a href="' + escape(href, quote=True) + '" rel="noopener noreferrer">')
        else:
            self.parts.append('<' + tag + '>')
        if tag != 'br':
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag != 'br':
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            while self.stack:
                value = self.stack.pop()
                self.parts.append('</' + value + '>')
                if value == tag:
                    break

    def handle_data(self, data):
        self.parts.append(escape(data))

    def result(self, value):
        self.feed(value)
        self.close()
        return ''.join(self.parts) + ''.join('</' + tag + '>' for tag in reversed(self.stack))


def text(value, limit, name, required=False):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        raise HTTPException(422, name + '格式或長度不正確。')
    return value.strip()


def document(value):
    if not isinstance(value, dict) or value.get('schemaVersion', 1) != 1:
        raise HTTPException(422, '不支援的文章格式。')
    blocks = value.get('blocks')
    if not isinstance(blocks, list) or len(blocks) > 300:
        raise HTTPException(422, '文章最多可有 300 個區塊。')
    result = []
    for block in blocks:
        if not isinstance(block, dict) or block.get('type') not in KINDS or not isinstance(block.get('data'), dict):
            raise HTTPException(422, '不支援的區塊類型。')
        kind, data = block['type'], block['data']
        if kind in {'header', 'subheader', 'paragraph'}:
            clean = {'text': InlineHTML().result(text(data.get('text', ''), 30000, '文字'))}
        elif kind == 'latex':
            clean = {'formula': text(data.get('formula', ''), 16000, '公式')}
        elif kind == 'code':
            text(data.get('code', ''), 60000, '程式碼')
            clean = {'code': data.get('code', ''),
                     'language': text(data.get('language', 'plaintext'), 24, '程式語言')}
            if not re.fullmatch(r'[a-z0-9_+-]+', clean['language']):
                raise HTTPException(422, '程式語言格式不正確。')
        else:
            asset = text(data.get('asset_id', ''), 32, '圖片', True)
            if not ID.fullmatch(asset):
                raise HTTPException(422, '請先上傳圖片。')
            width = data.get('width', 'full')
            if width not in {'small', 'medium', 'full'}:
                raise HTTPException(422, '圖片大小不正確。')
            clean = {'asset_id': asset, 'caption': text(data.get('caption', ''), 1000, '圖片說明'),
                     'alt': text(data.get('alt', ''), 500, '替代文字'), 'width': width}
        result.append({'id': str(block.get('id', uuid.uuid4().hex))[:64], 'type': kind, 'data': clean})
    clean = {'schemaVersion': 1, 'blocks': result}
    if len(json.dumps(clean, ensure_ascii=False).encode()) > 500000:
        raise HTTPException(422, '文章內容過長。')
    return clean


def snapshot(payload):
    if not isinstance(payload, dict):
        raise HTTPException(422, '文章格式不正確。')
    slug = text(payload.get('slug', ''), 80, '網址代稱', True)
    if not SLUG.fullmatch(slug):
        raise HTTPException(422, '網址代稱限小寫英數字及連字號。')
    return {'title': text(payload.get('title', ''), 160, '標題', True), 'slug': slug,
            'summary': text(payload.get('summary', ''), 600, '摘要'),
            'category': text(payload.get('category', ''), 60, '分類'),
            'document': document(payload.get('document', {'blocks': []}))}


def assets(doc):
    return {block['data']['asset_id'] for block in doc['blocks'] if block['type'] == 'image'}


async def body(request, maximum=600000):
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > maximum:
            raise HTTPException(413, '上傳內容超過大小限制。')
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError):
        raise HTTPException(422, 'JSON 格式不正確。') from None
    if not isinstance(value, dict):
        raise HTTPException(422, 'JSON 必須是物件。')
    return value


class Wiki:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.images = self.root / 'images'
        self.images.mkdir(exist_ok=True, mode=0o700)
        with self.db() as con:
            con.executescript('''
                CREATE TABLE IF NOT EXISTS articles(
                    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
                    draft TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
                    published_revision TEXT, created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL, updated_by TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS revisions(
                    id TEXT PRIMARY KEY, article_id TEXT NOT NULL,
                    snapshot TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL,
                    actor TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS revision_article ON revisions(article_id,created_at);
                CREATE TABLE IF NOT EXISTS images(
                    id TEXT PRIMARY KEY, article_id TEXT NOT NULL, filename TEXT NOT NULL,
                    mime TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS public_images(
                    article_id TEXT NOT NULL, image_id TEXT NOT NULL,
                    PRIMARY KEY(article_id,image_id));
            ''')

    @contextmanager
    def db(self):
        con = sqlite3.connect(self.root / 'wiki.sqlite3', timeout=10)
        con.row_factory = sqlite3.Row
        try:
            with con:
                yield con
        finally:
            con.close()

    def row(self, con, article_id):
        row = con.execute('SELECT * FROM articles WHERE id=?', (article_id,)).fetchone()
        if not row:
            raise HTTPException(404, '找不到文章。')
        return row

    def check_version(self, row, payload):
        if payload.get('version') != row['version']:
            raise HTTPException(409, '文章已被其他管理員更新。請先複製尚未儲存的內容，再重新載入。')

    def check_assets(self, con, article_id, doc):
        for asset in assets(doc):
            if not con.execute('SELECT 1 FROM images WHERE id=? AND article_id=?', (asset, article_id)).fetchone():
                raise HTTPException(422, '文章包含無效的圖片引用。')

    def revision(self, con, article_id, value, action, actor):
        rid = uuid.uuid4().hex
        con.execute('INSERT INTO revisions VALUES(?,?,?,?,?,?)',
                    (rid, article_id, json.dumps(value, ensure_ascii=False), action, now(), actor))
        return rid

    def admin_value(self, row):
        return {**json.loads(row['draft']), 'id': row['id'], 'version': row['version'],
                'published': bool(row['published_revision']), 'published_revision': row['published_revision'],
                'updated_at': row['updated_at'], 'updated_by': row['updated_by']}

    def save(self, article_id, payload, actor):
        value = snapshot(payload)
        with self.db() as con:
            con.execute('BEGIN IMMEDIATE')
            row = self.row(con, article_id)
            self.check_version(row, payload)
            if value['slug'] != row['slug']:
                raise HTTPException(422, '文章建立後網址代稱保持固定，確保既有連結有效。')
            self.check_assets(con, article_id, value['document'])
            if value != json.loads(row['draft']):
                self.revision(con, article_id, value, 'draft', actor)
                con.execute('UPDATE articles SET draft=?,version=version+1,updated_at=?,updated_by=? WHERE id=?',
                            (json.dumps(value, ensure_ascii=False), now(), actor, article_id))
            return self.admin_value(self.row(con, article_id))

    def install(self, app, authorize, trusted_origin):
        router = APIRouter()

        def admin(request: Request, user=Depends(authorize)):
            if request.method not in {'GET', 'HEAD'}:
                trusted_origin(request)
            return user

        def actor(user):
            return str(user['account'])

        @router.get('/public/wiki/articles')
        def public_list(q: str = '', category: str = ''):
            q = q[:160].casefold()
            with self.db() as con:
                rows = con.execute('SELECT a.id,r.snapshot,r.created_at FROM articles a JOIN revisions r ON r.id=a.published_revision ORDER BY r.created_at DESC').fetchall()
            items = []
            for row in rows:
                value = json.loads(row['snapshot'])
                if (not category or value['category'] == category) and (not q or q in (value['title'] + ' ' + value['summary']).casefold()):
                    items.append({key: value[key] for key in ['title', 'slug', 'summary', 'category']} | {'id': row['id'], 'updated_at': row['created_at']})
            return JSONResponse({'items': items}, headers={'Cache-Control': 'no-store'})

        @router.get('/public/wiki/articles/{slug}')
        def public_article(slug: str):
            with self.db() as con:
                row = con.execute('SELECT a.id,r.snapshot,r.created_at FROM articles a JOIN revisions r ON r.id=a.published_revision WHERE a.slug=?', (slug,)).fetchone()
            if not row:
                raise HTTPException(404, '文章尚未發布或已下架。')
            return JSONResponse({**json.loads(row['snapshot']), 'id': row['id'], 'updated_at': row['created_at']}, headers={'Cache-Control': 'no-store'})

        @router.get('/admin/wiki/articles')
        def admin_list(_=Depends(admin)):
            with self.db() as con:
                rows = con.execute('SELECT * FROM articles ORDER BY updated_at DESC').fetchall()
            return {'items': [{k: v for k, v in self.admin_value(row).items() if k != 'document'} for row in rows]}

        @router.post('/admin/wiki/articles')
        async def create(request: Request, user=Depends(admin)):
            value = snapshot(await body(request))
            if assets(value['document']):
                raise HTTPException(422, '請先建立文章，再上傳圖片。')
            aid, stamp = uuid.uuid4().hex, now()
            try:
                with self.db() as con:
                    con.execute('INSERT INTO articles VALUES(?,?,?,1,NULL,?,?,?)',
                                (aid, value['slug'], json.dumps(value, ensure_ascii=False), stamp, stamp, actor(user)))
                    self.revision(con, aid, value, 'created', actor(user))
                    return self.admin_value(self.row(con, aid))
            except sqlite3.IntegrityError:
                raise HTTPException(409, '此網址代稱已被使用。') from None

        @router.get('/admin/wiki/articles/{article_id}')
        def get_draft(article_id: str, _=Depends(admin)):
            with self.db() as con:
                return self.admin_value(self.row(con, article_id))

        @router.put('/admin/wiki/articles/{article_id}')
        async def save_draft(article_id: str, request: Request, user=Depends(admin)):
            return self.save(article_id, await body(request), actor(user))

        @router.post('/admin/wiki/articles/{article_id}/{action}')
        async def transition(article_id: str, action: str, request: Request, user=Depends(admin)):
            if action not in {'publish', 'unpublish', 'restore'}:
                raise HTTPException(404)
            payload = await body(request)
            with self.db() as con:
                con.execute('BEGIN IMMEDIATE')
                row = self.row(con, article_id)
                self.check_version(row, payload)
                draft = json.loads(row['draft'])
                if action == 'restore':
                    rev = con.execute('SELECT snapshot FROM revisions WHERE id=? AND article_id=?', (payload.get('revision'), article_id)).fetchone()
                    if not rev:
                        raise HTTPException(404, '找不到此版本。')
                    draft = json.loads(rev['snapshot'])
                    self.revision(con, article_id, draft, 'restored', actor(user))
                    con.execute('UPDATE articles SET draft=? WHERE id=?', (json.dumps(draft, ensure_ascii=False), article_id))
                else:
                    rid = None
                    con.execute('DELETE FROM public_images WHERE article_id=?', (article_id,))
                    if action == 'publish':
                        if not draft['document']['blocks']:
                            raise HTTPException(422, '請先加入文章內容。')
                        self.check_assets(con, article_id, draft['document'])
                        rid = self.revision(con, article_id, draft, 'published', actor(user))
                        con.executemany('INSERT INTO public_images VALUES(?,?)', [(article_id, aid) for aid in assets(draft['document'])])
                    else:
                        self.revision(con, article_id, draft, 'unpublished', actor(user))
                    con.execute('UPDATE articles SET published_revision=? WHERE id=?', (rid, article_id))
                con.execute('UPDATE articles SET version=version+1,updated_at=?,updated_by=? WHERE id=?', (now(), actor(user), article_id))
                return self.admin_value(self.row(con, article_id))

        @router.get('/admin/wiki/articles/{article_id}/revisions')
        def revisions(article_id: str, _=Depends(admin)):
            with self.db() as con:
                self.row(con, article_id)
                rows = con.execute('SELECT id,action,actor,created_at FROM revisions WHERE article_id=? ORDER BY rowid DESC LIMIT 100', (article_id,)).fetchall()
            return {'items': [dict(row) for row in rows]}

        @router.get('/admin/wiki/articles/{article_id}/revisions/{revision_id}')
        def revision_detail(article_id: str, revision_id: str, _=Depends(admin)):
            with self.db() as con:
                row = con.execute('SELECT snapshot FROM revisions WHERE id=? AND article_id=?', (revision_id, article_id)).fetchone()
            if not row:
                raise HTTPException(404)
            return json.loads(row[0])

        @router.post('/admin/wiki/images/{article_id}')
        async def upload(article_id: str, request: Request, _=Depends(admin)):
            with self.db() as con:
                self.row(con, article_id)
            payload = await body(request, MAX_BODY)
            encoded = payload.get('base64', '')
            if not isinstance(encoded, str) or len(encoded) > MAX_BODY:
                raise HTTPException(413, '圖片不得超過 6 MB。')
            try:
                raw = base64.b64decode(encoded, validate=True)
            except (ValueError, binascii.Error):
                raise HTTPException(422, '圖片編碼無效。') from None
            if not raw or len(raw) > MAX_IMAGE:
                raise HTTPException(413, '圖片不得超過 6 MB。')
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter('error', Image.DecompressionBombWarning)
                    image = Image.open(BytesIO(raw))
                    if image.format not in {'PNG', 'JPEG', 'WEBP', 'GIF'} or image.width * image.height > 20000000:
                        raise ValueError()
                    image.verify()
                    image = Image.open(BytesIO(raw))
                    # Decode and re-encode the first frame; strip metadata and active content.
                    image = image.convert('RGBA')
                    output = BytesIO()
                    image.save(output, format='WEBP', lossless=True)
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
                raise HTTPException(422, '請上傳有效的 PNG、JPEG、WebP 或 GIF 圖片（最多 2,000 萬像素；GIF 使用第一幀）。') from None
            aid = uuid.uuid4().hex
            path = self.images / (aid + '.webp')
            path.write_bytes(output.getvalue())
            path.chmod(0o600)
            try:
                with self.db() as con:
                    con.execute('INSERT INTO images VALUES(?,?,?,?,?)', (aid, article_id, path.name, 'image/webp', now()))
            except Exception:
                path.unlink(missing_ok=True)
                raise
            return {'id': aid}

        def image_response(asset_id, public):
            if not ID.fullmatch(asset_id):
                raise HTTPException(404)
            with self.db() as con:
                query = 'SELECT i.* FROM images i WHERE i.id=?'
                if public:
                    query += ' AND EXISTS(SELECT 1 FROM public_images p JOIN articles a ON a.id=p.article_id WHERE p.image_id=i.id AND a.published_revision IS NOT NULL)'
                row = con.execute(query, (asset_id,)).fetchone()
            if not row or not (self.images / row['filename']).is_file():
                raise HTTPException(404)
            return FileResponse(self.images / row['filename'], media_type=row['mime'],
                                headers={'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff'})

        @router.get('/public/wiki/assets/{asset_id}')
        def public_image(asset_id: str):
            return image_response(asset_id, True)

        @router.get('/admin/wiki/assets/{asset_id}')
        def private_image(asset_id: str, _=Depends(admin)):
            return image_response(asset_id, False)

        app.include_router(router)
        return self


def install_stage(app, host):
    if os.environ.get('RANGERBOOK_STAGE') != '1':
        raise RuntimeError('Wiki acceptance installer requires the isolated stage')
    root = Path(os.environ['RANGERBOOK_AUTH_DB']).resolve().parent / 'wiki'
    from security import RequestBodyLimit
    for layer in app.user_middleware:
        if layer.cls is RequestBodyLimit:
            layer.cls = WikiBodyLimit
        if layer.cls.__name__ == 'CORSMiddleware':
            layer.kwargs['allow_methods'] = sorted(set(layer.kwargs.get('allow_methods', [])) | {'PUT'})
    return Wiki(root).install(app, host.require_admin, host.require_trusted_origin)
