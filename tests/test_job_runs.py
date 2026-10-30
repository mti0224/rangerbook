"""Completion-gated run history, process boundaries, old output and secret-safe search."""
import json
import pytest
from fastapi import HTTPException
from membership import job_runs as jobs

UNIT='rangerbook-v2-update.service'
RUN='a'*32
OTHER='b'*32
BOOT='c'*32
BASE=1793144640000000


def lifecycle(mid, run=RUN, when=BASE, **extra):
    return {'UNIT':UNIT,'INVOCATION_ID':run,'_BOOT_ID':BOOT,'_PID':'1','_TRANSPORT':'journal',
            '_SYSTEMD_UNIT':'init.scope','MESSAGE_ID':mid,'__REALTIME_TIMESTAMP':str(when),
            'MESSAGE':{jobs.START:'Starting task',jobs.SUCCESS:'Deactivated successfully',jobs.FAILED:'Failed task'}[mid],**extra}


def output(message, run=RUN, when=BASE+1000000, pid='42', **extra):
    return {'_SYSTEMD_UNIT':UNIT,'_SYSTEMD_INVOCATION_ID':run,'_BOOT_ID':BOOT,'_PID':pid,
            '_STREAM_ID':'d'*32,'_TRANSPORT':'stdout','PRIORITY':'6',
            '__REALTIME_TIMESTAMP':str(when),'MESSAGE':message,**extra}


class Journal:
    def __init__(self, rows):self.rows=rows;self.calls=[]
    def __call__(self, cmd, **kwargs):
        self.calls.append(cmd)
        # Emulate journal matches, including + disjunction and OR values of a field.
        branches=[{}]
        for arg in cmd:
            if arg=='+':branches.append({})
            elif not arg.startswith('-') and '=' in arg:
                key,value=arg.split('=',1);branches[-1].setdefault(key,[]).append(value)
        rows=[r for r in self.rows if any(all(str(r.get(k)) in values for k,values in branch.items()) for branch in branches)]
        if '--reverse' in cmd:rows.reverse()
        if any(x.startswith('--grep=') for x in cmd):
            import re
            pattern=next(x[7:] for x in cmd if x.startswith('--grep='))
            rows=[r for r in rows if re.search(pattern,r.get('MESSAGE',''),re.I)]
        limit=int(next(x[8:] for x in cmd if x.startswith('--lines=')))
        rows=rows[:limit] if '--reverse' in cmd else rows[-limit:]
        return '\n'.join(json.dumps(r) for r in rows)


def test_running_job_not_published_until_native_terminal_record():
    j=Journal([lifecycle(jobs.START),output('JSON converted: 0'),output('JSON unchanged: 29',pid='43')])
    assert jobs.completed_runs(j,'updates',24,'all',200,'')['items']==[]
    with pytest.raises(HTTPException) as error:jobs.run_detail(j,UNIT,RUN)
    assert error.value.status_code==404
    j.rows.append(lifecycle(jobs.SUCCESS,when=BASE+44_000_000))
    result=jobs.completed_runs(j,'updates',24,'all',200,'')
    assert len(result['items'])==1
    entry=result['items'][0]
    assert entry['status']=='success' and entry['durationSeconds']==44
    assert entry['message']=='' and entry['kind']=='run'
    detail=jobs.run_detail(j,UNIT,RUN)
    assert detail['message']=='Starting task\nJSON converted: 0\nJSON unchanged: 29\nDeactivated successfully'
    assert detail['lineCount']==4


def test_children_and_long_time_gaps_are_one_run_but_other_runs_stay_separate():
    j=Journal([lifecycle(jobs.START),output('begin',pid='42'),
               output('DB unchanged: 29',when=BASE+600_000_000,pid='500'),
               lifecycle(jobs.SUCCESS,when=BASE+900_000_000),
               lifecycle(jobs.START,run=OTHER,when=BASE+1000_000_000),
               output('other run',run=OTHER,when=BASE+1100_000_000),
               lifecycle(jobs.FAILED,run=OTHER,when=BASE+1200_000_000)])
    entries=jobs.completed_runs(j,'updates',24,'all',200,'')['items']
    assert [r['runId'] for r in entries]==[OTHER,RUN]
    text=jobs.run_detail(j,UNIT,RUN)['message']
    assert 'DB unchanged' in text and 'other run' not in text
    assert jobs.completed_runs(j,'updates',24,'error',200,'')['items'][0]['status']=='failed'


def test_process_output_cannot_forge_completion():
    fake=lifecycle(jobs.SUCCESS,_PID='42')
    j=Journal([fake,output('Finished task',MESSAGE_ID=jobs.SUCCESS,INVOCATION_ID=RUN)])
    assert jobs.completed_runs(j,'updates',24,'all',200,'')['items']==[]
    with pytest.raises(HTTPException):jobs.run_detail(j,UNIT,RUN)


def test_other_service_and_boot_are_excluded_from_detail():
    j=Journal([lifecycle(jobs.START),output('allowed'),output('wrong boot',_BOOT_ID='f'*32),
               output('wrong service',_SYSTEMD_UNIT='unrelated.service'),
               lifecycle(jobs.SUCCESS,when=BASE+50_000_000)])
    text=jobs.run_detail(j,UNIT,RUN)['message']
    assert 'allowed' in text and 'wrong' not in text


def test_keyword_keeps_one_whole_run_and_filters_after_multiline_redaction():
    j=Journal([lifecycle(jobs.START),output('DB unchanged: 29'),output('{'),
               output('  "token":'),output('    "SYNTHETIC-PRIVATE-VALUE"'),output('}'),
               lifecycle(jobs.SUCCESS,when=BASE+50_000_000)])
    assert len(jobs.completed_runs(j,'updates',24,'all',200,'DB unchanged')['items'])==1
    assert jobs.completed_runs(j,'updates',24,'all',200,'SYNTHETIC-PRIVATE-VALUE')['items']==[]
    detail=jobs.run_detail(j,UNIT,RUN)
    assert 'DB unchanged' in detail['message'] and 'SYNTHETIC-PRIVATE-VALUE' not in detail['message']


def test_missing_start_time_is_explicit_and_old_details_do_not_use_list_line_limit():
    j=Journal([output('first'),*[output('line '+str(i)) for i in range(600)],lifecycle(jobs.SUCCESS)])
    entry=jobs.completed_runs(j,'updates',1,'all',1,'')['items'][0]
    assert entry['startedAt'] is None and entry['durationSeconds'] is None
    detail=jobs.run_detail(j,UNIT,RUN)
    assert detail['lineCount']==602 and 'line 599' in detail['message'] and 'first' in detail['message']
    assert not any(x.startswith('--since=') for x in j.calls[-1])


def test_details_are_lazy_and_reject_invalid_services_or_ids():
    j=Journal([lifecycle(jobs.START),output('message'),lifecycle(jobs.SUCCESS)])
    jobs.completed_runs(j,'updates',24,'all',200,'')
    assert len(j.calls)==3
    for service,run in [('nginx.service',RUN),(UNIT,'../../etc/passwd'),('rangerbook-auth.service',RUN)]:
        with pytest.raises(HTTPException):jobs.run_detail(j,service,run)
    assert len(j.calls)==3


def test_resource_limit_fallback_is_marked_truncated():
    j=Journal([lifecycle(jobs.START),output('tail'),lifecycle(jobs.SUCCESS)])
    def reader(cmd,**kw):
        if '--lines=10000' in cmd:raise HTTPException(503,'logs.unavailable')
        return j(cmd,**kw)
    detail=jobs.run_detail(reader,UNIT,RUN)
    assert detail['truncated'] and detail['partial'] and 'tail' in detail['message']


@pytest.mark.parametrize('reason',['exit-code','timeout','signal'])
def test_failed_timed_out_and_interrupted_runs_are_retained(reason):
    end=lifecycle(jobs.FAILED,when=BASE+60_000_000,JOB_RESULT='failed',MESSAGE='Failed with result '+reason)
    j=Journal([lifecycle(jobs.START),output('last output before failure'),end])
    result=jobs.completed_runs(j,'updates',24,'error',200,'')['items']
    assert len(result)==1 and result[0]['status']=='failed'
    detail=jobs.run_detail(j,UNIT,RUN)
    assert reason in detail['message'] and 'last output' in detail['message']


def test_search_does_not_expose_a_running_matching_job():
    j=Journal([lifecycle(jobs.START),output('keyword')])
    assert jobs.completed_runs(j,'updates',24,'all',200,'keyword')['items']==[]


def test_completed_run_list_does_not_silently_include_raw_scheduler_events():
    from membership import backend_logs
    j=Journal([lifecycle(jobs.START),output('one'),output('two',pid='43'),lifecycle(jobs.SUCCESS)])
    result=jobs.completed_runs(j,'updates',24,'all',200,'')
    assert result['mode']=='runs' and len(result['items'])==1
    assert all(x['kind']=='run' for x in result['items'])


def test_summary_classifies_maintenance_once_without_fetching_each_run():
    j=Journal([lifecycle(jobs.START),output('HTTP 512: {"errorCode":512,"errorMessage":"GLOBAL_MAINTENANCE"}'),
               lifecycle(jobs.FAILED,when=BASE+50_000_000)])
    item=jobs.completed_runs(j,'updates',24,'all',200,'')['items'][0]
    assert item['summary']=={'reason':'maintenance','httpCodes':['512'],'apiCodes':['512'],'warning':False}
    assert item['message']=='' and len(j.calls)==3
    assert not any('--lines=10000' in call for call in j.calls)


def test_summary_cannot_use_other_boot_run_service_or_post_completion_output():
    j=Journal([lifecycle(jobs.START),output('HTTP 512 GLOBAL_MAINTENANCE',_BOOT_ID='f'*32),
               output('HTTP 512 GLOBAL_MAINTENANCE',run=OTHER),
               output('HTTP 512 GLOBAL_MAINTENANCE',_SYSTEMD_UNIT='unrelated.service'),
               lifecycle(jobs.FAILED,when=BASE+50_000_000),
               output('HTTP 512 GLOBAL_MAINTENANCE',when=BASE+60_000_000)])
    item=jobs.completed_runs(j,'updates',24,'all',200,'')['items'][0]
    assert item['summary']['reason']=='unknown'


def test_summary_read_failure_keeps_completed_list_usable():
    j=Journal([lifecycle(jobs.START),lifecycle(jobs.SUCCESS,when=BASE+50_000_000)])
    def read(cmd,**kwargs):
        if any(arg.startswith('--grep=') for arg in cmd):raise HTTPException(503,'logs.unavailable')
        return j(cmd,**kwargs)
    assert jobs.completed_runs(read,'updates',24,'all',200,'')['items'][0]['summary']['reason']=='completed'


def test_summary_full_output_reports_unchanged_and_zero_errors_are_not_failures():
    j=Journal([lifecycle(jobs.START),output('DB 未變更：29'),output('JSON 轉換：0'),
               output('JSON 無需轉換：29'),output('失敗：0'),lifecycle(jobs.SUCCESS,when=BASE+50_000_000)])
    assert jobs.run_detail(j,UNIT,RUN)['summary']['reason']=='unchanged'


@pytest.mark.parametrize('text,reason',[
    ('HTTP 512: GLOBAL_MAINTENANCE','maintenance'),
    ('[RETRY] API errorCode 429 (HTTP 400)','rateLimited'),
    ('[UNAVAILABLE] errorCode=112004 after retry','unavailableData'),
    ('HTTP 503','serviceUnavailable'),('errorCode=119801','apiRejected'),
    ('TimeoutError: timed out','timeout'),('No space left on device','diskFull'),
    ('PermissionError: denied','permission'),('Connection refused','connection'),
    ('Invalid HTTP request received.','invalidRequest'),('unrecognized failure','unknown')])
def test_short_summary_reasons(text,reason):
    from membership.log_summary import describe
    assert describe(text,'failed')['reason']==reason


def test_summary_only_emits_fixed_reasons_and_codes_and_retains_success_with_warning():
    from membership.log_summary import describe
    value=describe('[RETRY] API errorCode 429 (HTTP 400) token=PRIVATE http://private.test/uid/PRIVATE')
    assert value=={'reason':'rateLimited','httpCodes':['400'],'apiCodes':['429'],'warning':True}
    assert 'PRIVATE' not in json.dumps(value)
    assert describe('failed: 0 errors=0')['reason']=='completed'
    assert describe('JSON 轉換：0\nDB 未變更：29',complete=False)['reason']=='completed'
