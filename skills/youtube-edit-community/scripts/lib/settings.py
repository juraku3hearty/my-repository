"""Local paths, subprocess logging and validated project settings."""
from pathlib import Path
from fractions import Fraction
import json, subprocess, time, math, re
ROOT = Path(__file__).resolve().parents[2]

def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))

def write(path, data):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')

def run(cmd, log=None):
    start=time.monotonic()
    p=subprocess.run([str(x) for x in cmd],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    if log:
        Path(log).parent.mkdir(parents=True,exist_ok=True)
        Path(log).write_text(p.stderr,encoding='utf-8')
        write(str(log)+'.command.json',{'argv':[str(x) for x in cmd],'seconds':time.monotonic()-start,'returncode':p.returncode})
    if p.returncode: raise RuntimeError(f'command failed ({p.returncode}): {cmd[0]}\n{p.stderr[-2500:]}\nlog: {log}')
    return p.stdout,p.stderr

def ff(args, log):
    return run(['ffmpeg','-hide_banner','-nostdin','-y']+args,log)

def validate(s):
    if s.get('version')!=1: raise ValueError('settings.version must be 1')
    for key,choices in [('plan',('A','B','C')),('screen_mode',('none','pip','auto'))]:
        if s[key] not in choices: raise ValueError(key)
    if s['pip']['position'] not in ('right','left') or s['pip']['size'] not in ('normal','small'): raise ValueError('pip settings')
    if s['audio']['master'] not in ('auto','mic','camera','screen'): raise ValueError('audio.master')
    if any(r not in ('mic','camera','screen') for r in s['audio'].get('exclude_master',[])): raise ValueError('audio.exclude_master')
    if s['caption']['font'] not in ('NotoSansJP-ExtraBold','NotoSansJP-Black'): raise ValueError('bundled caption font required')
    heading=s['heading']
    for key,value in {'position':'left','bg_color':'#ffffff','text_color':'#132129','style':'slant_band'}.items():heading.setdefault(key,value)
    if heading['position'] not in ('left','right') or heading['style']!='slant_band':raise ValueError('heading position/style')
    if any(not re.fullmatch(r'#[0-9a-fA-F]{6}',heading[k]) for k in ('bg_color','text_color')):raise ValueError('heading colors')
    o=s['output'];o.setdefault('video_bitrate','8M')
    if not re.fullmatch(r'[1-9][0-9]*(?:\.[0-9]+)?[kKmM]?',str(o['video_bitrate'])):raise ValueError('output.video_bitrate')
    if any(not isinstance(o[k],int) or o[k]<2 or o[k]%2 for k in ('width','height')): raise ValueError('even output width/height required')
    if o['fps']!='source' and not 1<=float(Fraction(str(o['fps'])))<=120: raise ValueError('output.fps')
    if not 0<s['face']['crop_scale']<=4 or any(not 0<=v<=1 for v in s['face']['crop_center']): raise ValueError('face crop')
    # Keep old settings byte-for-byte compatible when the optional image section is absent.
    from .glass import image_settings
    image=image_settings(s);bounds=image['glass_source_x']
    if not isinstance(bounds,(list,tuple)) or len(bounds)!=2 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in bounds) or not 0<=bounds[0]<bounds[1]<=1:
        raise ValueError('image.glass_source_x must be [left, right] within 0..1')
    if image['presenter_side'] not in ('left','right'):raise ValueError('image.presenter_side')
    if not isinstance(image['presenter_center_x'],(int,float)) or not math.isfinite(image['presenter_center_x']) or not 0<=image['presenter_center_x']<=1:raise ValueError('image.presenter_center_x')
    for section,keys in [('caption',['px','bottom_px']),('heading',['px','enter_s']),('face',['diameter_px','small_px','margin_x_px','bottom_px'])]:
        if any(not math.isfinite(s[section][k]) or s[section][k]<0 for k in keys): raise ValueError(section)
    return s

def init(out, settings=None, plan=None):
    out=Path(out).expanduser().resolve();work=out/'work';work.mkdir(parents=True,exist_ok=True)
    saved=out/'settings.json'
    if settings: s=read(settings)
    elif saved.exists(): s=read(saved)
    else: s=read(ROOT/'presets'/f'{plan or "B"}.json')
    if plan and s['plan']!=plan:
        s['plan']=plan;s['screen_mode']={'A':'none','B':'auto','C':'pip'}[plan];s['heading']['enabled']=plan=='B'
    validate(s);write(saved,s)
    return out,work,s

def fps_for(probe,s):
    if s['output']['fps']!='source': return str(Fraction(str(s['output']['fps'])))
    for role in ('camera','screen'):
        if role in probe and probe[role].get('video'): return probe[role]['video']['fps']
    raise ValueError('映像素材がありません')

def duration(work): return read(Path(work)/'timeline.json')['duration_s']
