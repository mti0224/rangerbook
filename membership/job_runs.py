"""Read completed systemd invocations as runs; never infer completion from silence.

The scheduler's own terminal record is the publication gate. No timer changes,
buffering of the task itself, or unprotected copies of its output are needed.
"""
import datetime
import json
import re
import time

from fastapi import HTTPException
from .backend_logs import ALL_UNITS, SOURCES, clean_message, group_entries

SCHEDULED = tuple(x for x in ALL_UNITS if x not in SOURCES['auth'])
START = '7d4958e842da4a758f6c1cdc7b36dcc5'
SUCCESS = '7ad2d189f7e94e70a38c781354912448'
FAILED = 'be02cf6855d2428ba40df7e9d022f03d'
TERMINALS = (SUCCESS, FAILED)
FIELDS = '__REALTIME_TIMESTAMP,_SYSTEMD_UNIT,UNIT,PRIORITY,MESSAGE,_PID,_STREAM_ID,_SYSTEMD_INVOCATION_ID,INVOCATION_ID,_BOOT_ID,_TRANSPORT,MESSAGE_ID,JOB_RESULT'
ID = re.compile(r'^[a-f0-9]{32}$')


def iso(micros):
    return datetime.datetime.fromtimestamp(int(micros)/1e6,datetime.timezone.utc).isoformat()


def records(text):
    for line in text.splitlines():
        try:
            row=json.loads(line)
            if isinstance(row,dict):yield row
        except (ValueError,TypeError):pass


def command(*matches, lines=500, reverse=False):
    result=['/usr/bin/journalctl','--no-pager','--quiet','--output=json','--output-fields='+FIELDS,
            '--lines='+str(lines)]
    if reverse:result.append('--reverse')
    return result+list(matches)


def bounded(reader, cmd, deadline):
    remaining=deadline-time.monotonic()
    if remaining<=0:raise HTTPException(503,'logs.unavailable')
    return list(records(reader(cmd,timeout=min(5,remaining))))


def terminal(row, units):
    return (row.get('_PID')=='1' and row.get('_TRANSPORT')=='journal'
            and row.get('UNIT') in units and row.get('MESSAGE_ID') in TERMINALS
            and isinstance(row.get('INVOCATION_ID'),str) and ID.fullmatch(row['INVOCATION_ID'])
            and isinstance(row.get('_BOOT_ID'),str) and ID.fullmatch(row['_BOOT_ID']))


def metadata(row, started=None):
    ended=iso(row['__REALTIME_TIMESTAMP'])
    failed=row['MESSAGE_ID']==FAILED
    duration=(int(row['__REALTIME_TIMESTAMP'])-int(started))/1e6 if started else None
    return {'kind':'run','runId':row['INVOCATION_ID'],'service':row['UNIT'],
            'status':'failed' if failed else 'success','priority':3 if failed else 6,
            'time':ended,'endedAt':ended,'startedAt':iso(started) if started else None,
            'durationSeconds':max(0,duration) if duration is not None else None,
            'message':'','partial':False,'truncated':False}


def completed_runs(reader, source, hours, level, limit, keyword):
    deadline=time.monotonic()+10
    units=SCHEDULED if source=='all' else tuple(x for x in SOURCES[source] if x in SCHEDULED)
    candidate_ids=None
    search_limited=False
    if keyword:
        candidates=bounded(reader,command(*[f'--unit={x}' for x in units],
                           '--since='+str(hours)+' hours ago','--grep='+re.escape(keyword),
                           '--case-sensitive=no',lines=1000,reverse=True),deadline)
        candidate_ids=list(dict.fromkeys(
            value for r in candidates for value in [r.get('_SYSTEMD_INVOCATION_ID') or r.get('INVOCATION_ID')]
            if isinstance(value,str) and ID.fullmatch(value)))
        search_limited=len(candidates)==1000 or len(candidate_ids)>200
        candidate_ids=candidate_ids[:200]
        if not candidate_ids:
            return {'items':[],'limit':limit,'mode':'runs','searchLimited':search_limited,
                    'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    matches=['_PID=1',*[f'UNIT={x}' for x in units],*[f'MESSAGE_ID={x}' for x in ((FAILED,) if level in {'error','warning'} else TERMINALS)]]
    if candidate_ids is not None:matches.extend(f'INVOCATION_ID={x}' for x in candidate_ids)
    rows=bounded(reader,command(*matches,'--since='+str(hours)+' hours ago',lines=limit*2,reverse=True),deadline)
    done={}
    for row in rows:
        try:
            if terminal(row,units):
                key=(row['UNIT'],row['INVOCATION_ID'],row['_BOOT_ID'])
                if key not in done:done[key]=row
        except (KeyError,ValueError,TypeError):pass
    # One batch query finds start times even when a run began outside the chosen window.
    starts={}
    if done:
        ids=list(dict.fromkeys(key[1] for key in done))
        start_rows=bounded(reader,command('_PID=1','MESSAGE_ID='+START,
                            *[f'INVOCATION_ID={x}' for x in ids],lines=len(ids)*2),deadline)
        for row in start_rows:
            key=(row.get('UNIT'),row.get('INVOCATION_ID'),row.get('_BOOT_ID'))
            if row.get('_PID')=='1' and row.get('MESSAGE_ID')==START and key in done:
                starts[key]=row.get('__REALTIME_TIMESTAMP')
    result=[]
    for key,row in done.items():
        try:
            entry=metadata(row,starts.get(key))
            if level in {'error','warning'} and entry['status']!='failed':continue
            result.append(entry)
        except (ValueError,TypeError,KeyError,OverflowError,OSError):pass
    result.sort(key=lambda x:x['time'],reverse=True)
    if keyword and result:
        # grep only discovers candidates; matching is repeated on sanitized full
        # run output, so a credential printed on a separate line cannot leak.
        matches=[]
        for entry in result:
            if time.monotonic()>=deadline or len(matches)>=20:
                search_limited=True
                break
            detail=run_detail(reader,entry['service'],entry['runId'],deadline=deadline)
            if keyword.casefold() in detail['message'].casefold():matches.append(entry)
        result=matches
    return {'items':result[:limit],'limit':limit,'mode':'runs','searchLimited':search_limited,
            'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}


def run_detail(reader, service, run_id, *, deadline=None):
    if service not in SCHEDULED or not ID.fullmatch(run_id):raise HTTPException(422,'member.invalidInput')
    deadline=deadline or time.monotonic()+10
    ends=bounded(reader,command('_PID=1','UNIT='+service,'INVOCATION_ID='+run_id,
                               *[f'MESSAGE_ID={x}' for x in TERMINALS],lines=4,reverse=True),deadline)
    end=next((r for r in ends if terminal(r,(service,)) and r.get('INVOCATION_ID')==run_id),None)
    if end is None:raise HTTPException(404,'logs.runNotComplete')
    cmd=command('_SYSTEMD_INVOCATION_ID='+run_id,'+','INVOCATION_ID='+run_id,lines=10000)
    truncated=False
    try:rows=bounded(reader,cmd,deadline)
    except HTTPException as error:
        if error.status_code!=503:raise
        truncated=True
        rows=bounded(reader,command('_SYSTEMD_INVOCATION_ID='+run_id,'+','INVOCATION_ID='+run_id,lines=1000),deadline)
    parsed=[]
    started=None
    for row in rows:
        try:
            unit=row.get('_SYSTEMD_UNIT')
            if unit!=service:unit=row.get('UNIT')
            invocation=row.get('_SYSTEMD_INVOCATION_ID') if row.get('_SYSTEMD_UNIT')==service else row.get('INVOCATION_ID')
            if unit!=service or invocation!=run_id or row.get('_BOOT_ID')!=end['_BOOT_ID']:continue
            if row.get('_PID')=='1' and row.get('MESSAGE_ID')==START:started=row['__REALTIME_TIMESTAMP']
            micros=int(row['__REALTIME_TIMESTAMP'])
            identity=[row.get(k) for k in ('_BOOT_ID','_SYSTEMD_INVOCATION_ID','_STREAM_ID','_PID')]
            stream=(service,*identity) if row.get('_TRANSPORT')=='stdout' and all(isinstance(v,str) and v for v in identity) else None
            parsed.append({'time':iso(micros),'micros':micros,'service':service,'priority':int(row.get('PRIORITY',6)),
                           'stream':stream,'message':clean_message(row.get('MESSAGE',''))})
        except (ValueError,TypeError,KeyError,OverflowError,OSError):pass
    groups=group_entries(list(reversed(parsed)),max_chars=262144)
    text='\n'.join(group['message'] for group in reversed(groups))
    info=metadata(end,started)
    info.update(message=text[:524288],lineCount=sum(g['lineCount'] for g in groups),
                truncated=truncated or len(rows)==10000 or len(text)>524288 or any(g['truncated'] for g in groups),
                partial=truncated or any(g['partial'] for g in groups))
    return info
