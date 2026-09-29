#!/usr/bin/python3
"""Single entry point; all timestamps are seconds, all paths are local."""
import argparse,sys,time
sys.dont_write_bytecode = True
from pathlib import Path
from lib.settings import init,read,write

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('command',choices=['probe','transcribe','sync','cut','captions','glass-preview','render','finalize','qc','preview','full'])
    p.add_argument('--out',required=True);p.add_argument('--settings');p.add_argument('--plan',choices=['A','B','C'])
    for name in ['camera','screen','mic','keep','scenes','captions','model']: p.add_argument('--'+name)
    p.add_argument('--master',choices=['mic','camera','screen'])
    p.add_argument('--exclude-master',choices=['mic','camera','screen'],action='append',default=None)
    p.add_argument('--range',nargs=2,type=float);p.add_argument('--force',action='store_true')
    args=p.parse_args();out,work,s=init(args.out,args.settings,args.plan);start=time.monotonic();status='FAIL'
    try:
        from lib.probe import probe
        from lib.transcribe import transcribe
        from lib.sync import sync
        from lib.cutter import cut
        inputs={k:getattr(args,k) for k in ['camera','screen','mic']}
        c=args.command
        if args.exclude_master is not None: s['audio']['exclude_master']=args.exclude_master
        if args.master:
            s['audio']['master']=args.master
            s['audio']['exclude_master']=[r for r in s['audio'].get('exclude_master',[]) if r!=args.master]
        write(out/'settings.json',s)
        if c not in ('probe','preview','full') and (args.master or args.exclude_master is not None): probe(work,inputs,s)
        if c=='probe': probe(work,inputs,s,args.force)
        elif c=='transcribe': transcribe(work,s,args.force,args.model)
        elif c=='sync': sync(work,s)
        elif c=='cut': cut(work,s,read(args.keep or work/'keep_segments.json'))
        elif c=='captions':
            from lib.captions import captions
            if args.captions:
                from lib.caption_timing import import_reviewed
                import_reviewed(work,args.captions)
            else:captions(work,s)
        elif c=='glass-preview':
            from lib.glass import glass_preview
            if args.scenes:write(work/'scenes.json',read(args.scenes))
            glass_preview(work,s)
        else:
            from lib.pipeline import execute
            execute(args,out,work,s)
        status='PASS';print(f'{c}: PASS ({time.monotonic()-start:.2f}s)',flush=True)
    finally:
        record=work/'timings.json';timings=read(record) if record.exists() else []
        timings.append({'command':args.command,'seconds':round(time.monotonic()-start,3),'status':status});write(record,timings)
if __name__=='__main__':
    try: main()
    except Exception as e: print('ERROR:',e,file=sys.stderr);sys.exit(1)
