"""Knowledge-base lifecycle tests use temporary files and synthetic sessions."""
import base64
from io import BytesIO
import json
import sqlite3

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from PIL import Image

from membership.wiki.service import Wiki, InlineHTML, WikiBodyLimit


@pytest.fixture
def env(tmp_path):
    app = FastAPI()
    app.add_middleware(WikiBodyLimit)
    def authorized(request: Request):
        who = request.cookies.get('fixture')
        if not who:
            raise HTTPException(401)
        if who != 'admin':
            raise HTTPException(403)
        return {'account': 'synthetic-admin'}
    def trusted(request):
        if request.headers.get('origin') != 'https://fixture.test':
            raise HTTPException(403)
    wiki = Wiki(tmp_path / 'wiki').install(app, authorized, trusted)
    with TestClient(app, base_url='https://fixture.test', headers={'Origin': 'https://fixture.test'}) as client:
        client.cookies.set('fixture', 'admin')
        yield wiki, client


def doc(value='Original'):
    return {'schemaVersion': 1, 'blocks': [
        {'type': 'header', 'data': {'text': 'Title'}},
        {'type': 'subheader', 'data': {'text': 'Subtitle'}},
        {'type': 'paragraph', 'data': {'text': '<b>' + value + '</b><s>old</s>'}},
        {'type': 'latex', 'data': {'formula': r'\frac{a}{b}'}},
        {'type': 'code', 'data': {'code': '\n  a = 1\n', 'language': 'python'}}]}


def create(client, slug='damage', value='Original'):
    response = client.post('/admin/wiki/articles', json={'title': '傷害如何計算？', 'slug': slug,
        'category': '傷害', 'summary': 'Summary', 'document': doc(value)})
    assert response.status_code == 200, response.text
    return response.json()


def action(client, article, verb, **extra):
    return client.post(f"/admin/wiki/articles/{article['id']}/{verb}", json={'version': article['version'], **extra})


def test_publication_is_snapshot_and_restore_only_changes_draft(env):
    wiki, c = env
    a = create(c)
    assert c.get('/public/wiki/articles').json() == {'items': []}
    assert c.get('/public/wiki/articles/damage').status_code == 404
    a = action(c, a, 'publish').json()
    published = c.get('/public/wiki/articles/damage').json()
    assert published['document']['blocks'][4]['data']['code'] == '\n  a = 1\n'
    old_revision = a['published_revision']
    a['title'] = '新的草稿標題'
    a['document'] = doc('Draft')
    a = c.put('/admin/wiki/articles/' + a['id'], json=a).json()
    assert c.get('/public/wiki/articles/damage').json() == published
    c.cookies.clear()
    assert c.get('/admin/wiki/articles/' + a['id']).status_code == 401
    assert c.get('/admin/wiki/articles/' + a['id'] + '/revisions').status_code == 401
    assert c.get('/public/wiki/articles').json()['items'][0]['title'] == '傷害如何計算？'
    c.cookies.set('fixture', 'member')
    assert c.get('/admin/wiki/articles').status_code == 403
    c.cookies.set('fixture', 'admin')
    a = action(c, a, 'publish').json()
    assert c.get('/public/wiki/articles/damage').json()['title'] == '新的草稿標題'
    a = action(c, a, 'restore', revision=old_revision).json()
    assert a['title'] == '傷害如何計算？'
    assert c.get('/public/wiki/articles/damage').json()['title'] == '新的草稿標題'
    a = action(c, a, 'unpublish').json()
    assert not a['published']
    assert c.get('/public/wiki/articles/damage').status_code == 404
    assert c.get('/public/wiki/articles').json() == {'items': []}


def test_conflict_origin_slug_and_schema(env):
    _, c = env
    a = create(c)
    duplicate = c.post('/admin/wiki/articles', json=a)
    assert duplicate.status_code == 409
    old = dict(a)
    a['summary'] = 'changed'
    saved = c.put('/admin/wiki/articles/' + a['id'], json=a)
    assert saved.status_code == 200
    a = saved.json()
    assert c.put('/admin/wiki/articles/' + a['id'], json=old).status_code == 409
    assert action(c, old, 'publish').status_code == 409
    assert c.put('/admin/wiki/articles/' + a['id'], json=a, headers={'Origin': 'https://other.test'}).status_code == 403
    a['slug'] = 'new-slug'
    assert c.put('/admin/wiki/articles/' + a['id'], json=a).status_code == 422
    a['slug'] = 'damage'
    a['document'] = {'blocks': [{'type': 'html', 'data': {'text': '<script>alert(1)</script>'}}]}
    assert c.put('/admin/wiki/articles/' + a['id'], json=a).status_code == 422
    assert c.post('/admin/wiki/articles', content='[1,2]').status_code == 422
    assert c.post('/admin/wiki/articles', content='x' * 600001).status_code == 413


def test_image_lifecycle_private_draft_and_public_published_only(env):
    _, c = env
    a = create(c)
    raw = BytesIO()
    Image.new('RGBA', (5, 5), (255, 0, 0, 100)).save(raw, 'PNG')
    uploaded = c.post('/admin/wiki/images/' + a['id'], json={'base64': base64.b64encode(raw.getvalue()).decode()})
    assert uploaded.status_code == 200, uploaded.text
    aid = uploaded.json()['id']
    private, public = '/admin/wiki/assets/' + aid, '/public/wiki/assets/' + aid
    assert c.get(private).headers['content-type'] == 'image/webp'
    assert c.get(public).status_code == 404
    a['document']['blocks'].append({'type': 'image', 'data': {'asset_id': aid, 'caption': '測試', 'alt': '紅色', 'width': 'medium'}})
    a = c.put('/admin/wiki/articles/' + a['id'], json=a).json()
    a = action(c, a, 'publish').json()
    assert c.get(public).status_code == 200
    a['document']['blocks'].pop()
    a = c.put('/admin/wiki/articles/' + a['id'], json=a).json()
    assert c.get(public).status_code == 200, 'Saving a draft must not revoke an image in the live revision'
    a = action(c, a, 'publish').json()
    assert c.get(public).status_code == 404
    assert c.get(private).status_code == 200
    c.cookies.clear()
    assert c.get(private).status_code == 401
    c.cookies.set('fixture', 'admin')
    b = create(c, 'other')
    b['document']['blocks'].append({'type': 'image', 'data': {'asset_id': aid}})
    assert c.put('/admin/wiki/articles/' + b['id'], json=b).status_code == 422
    assert c.post('/admin/wiki/images/' + a['id'], json={'base64': base64.b64encode(b'<svg onload=alert(1)>').decode()}).status_code == 422
    assert c.post('/admin/wiki/images/' + a['id'], json={'base64': '!!!'}).status_code == 422


def test_rich_text_allowlist(env):
    _, c = env
    a = create(c)
    a['document']['blocks'][2]['data']['text'] = '<b onclick="evil()">bold</b><i>italic</i><s>strike</s><u>under</u><img src=x onerror=evil()><a href="javascript:alert(1)">bad</a><script>evil()</script>'
    a = c.put('/admin/wiki/articles/' + a['id'], json=a).json()
    value = a['document']['blocks'][2]['data']['text']
    assert 'onclick' not in value and '<img' not in value and '<script' not in value and 'javascript:' not in value
    assert '<b>bold</b><i>italic</i><s>strike</s><u>under</u>' in value
    assert '<a href="#" rel="noopener noreferrer">bad</a>' in value


def test_revisions_are_scoped_to_the_article_and_bad_publish_rolls_back(env):
    wiki, c = env
    a = create(c)
    b = create(c, 'other')
    a = action(c, a, 'publish').json()
    rid = a['published_revision']
    assert c.get('/admin/wiki/articles/' + b['id'] + '/revisions/' + rid).status_code == 404
    assert action(c, b, 'restore', revision=rid).status_code == 404
    assert c.get('/admin/wiki/articles/' + a['id'] + '/revisions').json()['items'][0]['action'] == 'published'
    assert c.get('/public/wiki/articles?q=傷害&category=傷害').json()['items']
    assert not c.get('/public/wiki/articles?category=other').json()['items']
    c.cookies.clear()
    assert c.post('/admin/wiki/articles', json=b).status_code == 401
    assert c.post('/admin/wiki/images/' + a['id'], json={'base64': ''}).status_code == 401


def test_article_size_limit_does_not_expand_auth_endpoints(env):
    _, c = env
    a = create(c)
    a['document']['blocks'][2]['data']['text'] = 'a' * 25000
    assert c.put('/admin/wiki/articles/' + a['id'], json=a).status_code == 200
    assert c.post('/auth/login', content='a' * 20000).status_code == 413
