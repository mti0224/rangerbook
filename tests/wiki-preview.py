"""Local-only browser QA fixture. Never install this server in a public vhost."""
from pathlib import Path
import os
import sys, tempfile, mimetypes
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import Response
from membership.wiki.service import Wiki
ROOT=Path(os.environ.get('WIKI_QA_ROOT', str(Path(__file__).resolve().parents[1]))).resolve()
app=FastAPI()
def authorize(request:Request):
    if request.cookies.get('fixture')!='admin':raise HTTPException(403)
    return {'account':'synthetic-admin'}
def origin(request):
    if request.headers.get('origin')!='http://127.0.0.1:'+os.environ.get('WIKI_QA_PORT','4186'):raise HTTPException(403)
wiki=Wiki(Path(tempfile.mkdtemp())/'wiki').install(app,authorize,origin)
@app.get('/auth/me')
def me(request:Request):return {'logged_in':request.cookies.get('fixture')=='admin','role':'admin' if request.cookies.get('fixture')=='admin' else 'user','account':'synthetic-admin'}
@app.get('/auth/features')
def features():return {'member_navigation':True}
@app.get('/{name:path}')
def static(name:str):
    path=(ROOT/name).resolve()
    if path!=ROOT and not path.is_relative_to(ROOT):raise HTTPException(404)
    if path.is_dir():path=path/'index.html'
    if not path.is_file():raise HTTPException(404)
    if path.name in {'pwa-head.js','pwa.js','visitor-region.js'}:return Response('/* QA disabled */',media_type='application/javascript')
    raw=path.read_bytes()
    if path.suffix=='.js':raw=raw.replace(b'https://rangerbook-test.warmycat.com', ('http://127.0.0.1:'+os.environ.get('WIKI_QA_PORT','4186')).encode())
    if path.suffix=='.html':raw=raw.replace(b'</head>',b'<script>window.RANGERBOOK_AUTH_API_BASE=location.origin;window.gtag=function(){};window.RB_PRIVATE_PAGE=true;</script></head>')
    return Response(raw,media_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
if __name__=='__main__':
    import uvicorn
    uvicorn.run(app,host='127.0.0.1',port=int(os.environ.get('WIKI_QA_PORT','4186')),access_log=False)
