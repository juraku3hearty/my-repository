from fractions import Fraction
from pathlib import Path
from .settings import read,write,run,ROOT
from .captions import validate_captions
from .caption_check import check_captions

def validate_render_inputs(work, s):
    path = work/'input-props.json'
    if not path.exists():
        raise ValueError('renderを先に実行してください')
    props = read(path)
    timeline = read(work/'timeline.json')
    expected = {'settings': s, 'captions': read(work/'captions.json'),
                'scenes': read(work/'scenes.json'), 'frames': timeline['frames'],
                'fps': float(Fraction(timeline['fps']))}
    if any(props.get(key) != value for key, value in expected.items()):
        raise ValueError('字幕・シーン・設定がrender後に変更されています。renderを再実行してください')

def validate_scenes(scenes,timeline,s,probe):
    cursor=0
    for i,r in enumerate(scenes):
        if abs(r['start']-cursor)>.002 or r['end']<=r['start']: raise ValueError(f'scene {i}: gaps/overlap')
        if r['view'] not in ('presenter','screen','image'):raise ValueError('scene.view')
        if r['view']=='image':
            image=Path(r.get('image',''))
            if not image.is_absolute() or not image.is_file() or image.suffix.lower() not in ('.png','.jpg','.jpeg','.heic','.heif'):raise ValueError('imageにはPNG/JPG/HEICの絶対パスが必要です')
            if r.get('layout') not in ('split','full','contain'):raise ValueError('image.layout must be split|full|contain')
        if r['view']=='screen' and 'screen' not in probe:raise ValueError('画面素材がありません')
        if r['view']=='presenter' and 'camera' not in probe:raise ValueError('人物素材がありません')
        if r.get('face') and (r['view']!='screen' or 'camera' not in probe):raise ValueError('丸ワイプは画面表示中の人物素材にのみ適用')
        if s['screen_mode']=='none' and r.get('face'):raise ValueError('screen_mode none では face:false')
        if s['screen_mode']=='pip' and r['view']=='screen' and 'camera' in probe and not r.get('face'):raise ValueError('screen_mode pip では画面表示中 face:true')
        cursor=r['end']
    if abs(cursor-timeline['duration_s'])>.002:raise ValueError('scenes.json は完成タイムライン全体を覆う必要があります')

def render(work,s):
    timeline=read(work/'timeline.json');captions=read(work/'captions.json');scenes=read(work/'scenes.json');probe=read(work/'probe.json')
    errors=validate_captions(captions,timeline,s)
    if errors:raise ValueError('\n'.join(errors[:20]))
    caption_qc=check_captions(captions,timeline,work.parent)
    write(work/'caption-check.json',caption_qc)
    if caption_qc['fail_count']:raise ValueError('字幕FAILを修正してください: '+str(work/'caption-check.json'))
    validate_scenes(scenes,timeline,s,probe)
    if any(r['view']=='image' for r in scenes):
        from .glass import prepare_images
        prepare_images(work,s)
    fps=float(Fraction(timeline['fps']));n=timeline['frames'];events={0,n};heading_spans=[]
    for c in captions:
        events.update([max(0,round(c['start']*fps)),min(n,round(c['end']*fps))])
    for r in scenes:
        start=max(0,round(r['start']*fps));end=min(n,round(r['end']*fps));events.update([start,end])
        visible=s['heading']['enabled'] and r.get('heading') and not(s['heading']['hide_during_screen'] and r['view']=='screen' and 'camera' in probe)
        if visible:
            if heading_spans and heading_spans[-1]['end_frame']==start and heading_spans[-1]['text']==r['heading']:heading_spans[-1]['end_frame']=end
            else:heading_spans.append({'start_frame':start,'end_frame':end,'text':r['heading']})
    for r in heading_spans:
        events.update(range(r['start_frame'],min(r['end_frame'],r['start_frame']+round(s['heading']['enter_s']*fps))+1))
    events=sorted(e for e in events if 0<=e<=n)
    # Every interval has one still, including a transparent still during gaps.
    schedule=[{'frame':a,'t_start':a/fps,'t_end':b/fps,'file':f'overlays/{i:05d}.png'} for i,(a,b) in enumerate(zip(events,events[1:])) if b>a]
    props={'settings':s,'captions':captions,'scenes':scenes,'headingSpans':heading_spans,'fps':fps,'frames':n}
    write(work/'input-props.json',props);write(work/'overlay-schedule.json',schedule)
    run(['node',ROOT/'remotion/render.mjs','--work',work],work/'logs/remotion.log')
    write(work/'overlays.json',schedule)
    return schedule
