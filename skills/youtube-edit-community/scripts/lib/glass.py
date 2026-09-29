"""Static frosted glass and image cards; all design lengths originate at 3840x2160."""
from pathlib import Path
from fractions import Fraction
import math
import subprocess
import time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageOps, ImageFont
from .settings import ROOT, read, write, ff
from .fingerprints import file_hash, object_hash


def image_settings(s):
    return {'glass_source_x': [0.6, 1.0], 'presenter_side': 'left',
            'presenter_center_x': s['face']['crop_center'][0], **s.get('image', {})}


def load_image(path, dest):
    """FFmpeg applies HEIF irot/imir; EXIF transpose handles JPEG/PNG orientation."""
    path = Path(path)
    if path.suffix.lower() in ('.heic', '.heif'):
        ff(['-v', 'error', '-i', path, '-frames:v', '1', '-update', '1', dest], dest.with_suffix('.log'))
        with Image.open(dest) as source:
            im = source.convert('RGB')
    else:
        with Image.open(path) as source:
            im = ImageOps.exif_transpose(source).convert('RGB')
    im.save(dest)
    return im


def make_glass(room, tw, th, scale):
    if room is None:
        im = Image.new('RGB', (tw, th), '#E8E4DF')
    else:
        sw, sh = max(1, round(tw * 1.2)), max(1, round(th * 1.2))
        factor = max(sw / room.width, sh / room.height)
        im = room.resize((math.ceil(room.width * factor), math.ceil(room.height * factor)), Image.Resampling.LANCZOS)
        x, y = (im.width - sw) // 2, (im.height - sh) // 2
        im = im.crop((x, y, x + sw, y + sh))
        k = 6
        im = im.resize((max(1, sw // k), max(1, sh // k)), Image.Resampling.LANCZOS)
        im = im.filter(ImageFilter.GaussianBlur(100 * scale / k)).resize((sw, sh), Image.Resampling.BICUBIC)
        im = ImageEnhance.Color(im).enhance(1.4)
        im = Image.blend(im, Image.new('RGB', im.size, 'white'), .70)
        x, y = (sw - tw) // 2, (sh - th) // 2
        im = im.crop((x, y, x + tw, y + th))
    a = np.asarray(im).astype(np.float32)
    a += np.random.default_rng(7).normal(0, 255 * .03 / 2, (th, tw, 1))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def shadowed(canvas, box, radius, scale):
    x0, y0, x1, y1 = box
    for oy, blur, opacity in [(24, 72, .20), (2, 8, .12)]:
        mask = Image.new('L', canvas.size)
        ImageDraw.Draw(mask).rounded_rectangle((x0, y0 + oy * scale, x1, y1 + oy * scale),
                                               radius=radius, fill=round(255 * opacity))
        canvas.paste((0, 0, 0, 255), (0, 0), mask.filter(ImageFilter.GaussianBlur(blur * scale / 2)))


def rounded_mask(size, radius):
    mask = Image.new('L', size)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0]-1, size[1]-1), radius=radius, fill=255)
    return mask


def glass_preview(work, s):
    scenes = read(work/'scenes.json')
    first = next((r for r in scenes if r['view'] == 'image'), None)
    if first is None:
        raise ValueError('glass-previewにはimageシーンが必要です')
    from .overlays import validate_scenes
    tl, p = read(work/'timeline.json'), read(work/'probe.json')
    validate_scenes(scenes, tl, s, p)
    dest = work/'images'; dest.mkdir(exist_ok=True)
    w, h = s['output']['width'], s['output']['height']
    cfg = image_settings(s); room = None
    evidence = {'source': 'solid', 'color': '#E8E4DF', 'grain': .03}
    if 'camera' in p:
        seg = next(r for r in tl['segments'] if r['output_s'] <= first['start'] < r['output_e'])
        t = seg['source_s'] + first['start'] - seg['output_s'] + seg['offsets']['camera']
        source = dest/'source.png'
        ff(['-v', 'error', '-ss', f'{t:.9f}', '-i', p['camera']['path'], '-frames:v', '1', source], dest/'source.log')
        with Image.open(source) as im: frame = im.convert('RGB')
        a, b = cfg['glass_source_x']
        box = (round(frame.width*a), 0, round(frame.width*b), frame.height)
        if box[2] <= box[0]: raise ValueError('glass_source_xの範囲が1px未満です')
        room = frame.crop(box)
        check = frame.copy(); draw = ImageDraw.Draw(check)
        draw.rectangle((box[0], 0, min(box[2]-1, frame.width-1), frame.height-1), outline='red', width=max(2, round(frame.width/480)))
        font = ImageFont.truetype(str(ROOT/'fonts/NotoSansJP-ExtraBold.ttf'), max(12,round(frame.width/120)))
        label = f'x={a:.4f}..{b:.4f}  pixels={box}'
        lx = min(box[0]+10, max(0, frame.width-round(draw.textlength(label,font=font))-20))
        draw.rectangle((lx,10,frame.width-10,10+font.size*2), fill='white')
        draw.text((lx+4,14), label, font=font, fill='red')
        check.save(dest/'source-crop-check.png'); room.save(dest/'source-crop.png')
        evidence = {'source': p['camera']['path'], 'camera_time_s': t, 'output_time_s': first['start'],
                    'glass_source_x': [a, b], 'crop_pixels': box, 'source_size': frame.size,
                    'review_image': 'images/source-crop-check.png'}
    else:
        Image.new('RGB', (w, h), '#E8E4DF').save(dest/'source-crop-check.png')
    make_glass(room, w, h, w/3840).save(dest/'glass-full.png')
    fw = round(w*2/5); fw -= fw%2
    pw = w - fw
    make_glass(room, pw, h, w/3840).save(dest/'glass-panel.png')
    if room is None:
        make_glass(None, fw, h, w/3840).save(dest/'glass-empty-presenter.png')
    write(dest/'glass-preview.json', {**evidence, 'glass': 'images/glass-full.png', 'visual_review': 'not_run'})
    print('glass-preview:', dest/'glass-full.png', dest/'source-crop-check.png', flush=True)
    return dest


def zoom_scale(frame, frames):
    return 1.0 + .04 * frame / max(1, frames-1)


def zoom_frame(image, size, zoom, fill=(232, 228, 223), channels=None):
    """Inverse affine sampling keeps floating-point coordinates, with no integer crop steps."""
    iw, ih = image.size; w, h = size
    factor = min(w/iw, h/ih) * zoom
    inv = 1/factor
    transform = (inv, 0, iw/2 - w*inv/2, 0, inv, ih/2 - h*inv/2)
    # RGB's integer interpolation truncates at each sample, causing a small jump
    # from the identity frame. Interpolate float channels, then round once.
    channels = channels or [c.convert('F') for c in image.split()]
    result = np.empty((h, w, 3), dtype=np.uint8)
    for c, channel in enumerate(channels):
        sampled = channel.transform(size, Image.Transform.AFFINE, transform,
                                    resample=Image.Resampling.BICUBIC, fillcolor=float(fill[c]))
        result[:,:,c] = np.clip(np.rint(np.asarray(sampled)), 0, 255).astype(np.uint8)
    return Image.fromarray(result)


def corner_color(image):
    a = np.asarray(image); n = max(1, min(image.size)//100)
    corners = np.concatenate([a[:n,:n].reshape(-1,3), a[:n,-n:].reshape(-1,3),
                              a[-n:,:n].reshape(-1,3), a[-n:,-n:].reshape(-1,3)])
    color = np.median(corners, axis=0)
    uniform = bool(np.max(np.abs(corners.astype(float)-color)) <= 24)
    return (tuple(int(v) for v in color) if uniform else (232, 228, 223)), uniform


def card_assets(image, layout, dest, s):
    w, h = s['output']['width'], s['output']['height']; k = w/3840; ky = h/2160
    if layout == 'contain':
        color, uniform = corner_color(image)
        return {'size': [w,h], 'background': list(color), 'corners_uniform': uniform}, None, None
    bg = Image.open(dest/('glass-panel.png' if layout == 'split' else 'glass-full.png')).convert('RGBA')
    max_w = bg.width - round(240*k); max_h = round((1540 if layout == 'split' else 1960)*ky)
    factor = min(max_w/image.width, max_h/image.height)
    # The approved watch screenshot is capped at 2.6x (4K); square UIs fit the box.
    square = .6 <= image.width/image.height <= 1.7
    if layout == 'split': factor = min(factor, 2.6*k)
    cw, ch = max(2, round(image.width*factor)), max(2, round(image.height*factor))
    x = (bg.width-cw)//2
    y = round(330*ky) + (max_h-ch)//2 if layout == 'split' else round(100*ky)
    radius = (56 if layout == 'split' and square else 88)*k
    mask = rounded_mask((cw,ch), radius)
    shadowed(bg, (x,y,x+cw,y+ch), radius, k)
    info = {'size':[cw,ch], 'position':[x,y], 'radius':radius}
    return info, bg, mask


def write_motion(path, image, layout, info, bg, mask, frames, fps):
    w,h = bg.size if bg else tuple(info['size'])
    cmd = ['ffmpeg','-hide_banner','-nostdin','-y','-v','error','-f','rawvideo','-pixel_format','rgb24',
           '-video_size',f'{w}x{h}','-framerate',fps,'-i','pipe:0','-an','-c:v','ffv1',
           '-level','3','-threads','2','-pix_fmt','bgr0',str(path)]
    start = time.monotonic()
    target = tuple(info['size'])
    fit = min(target[0]/image.width, target[1]/image.height)
    image = image.resize((max(1, round(image.width*fit)), max(1, round(image.height*fit))), Image.Resampling.LANCZOS)
    channels = [c.convert('F') for c in image.split()]
    with path.with_suffix('.log').open('w') as log:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=log)
        try:
            edge = None
            if layout == 'full':
                x,y = info['position']; cw,ch = info['size']
                edge = Image.new('RGBA', bg.size)
                ImageDraw.Draw(edge).rounded_rectangle((x,y,x+cw-1,y+ch-1), radius=info['radius'],
                                                       outline=(255,255,255,102), width=max(1,round(2*w/3840)))
            for f in range(frames):
                zoom = zoom_scale(f, frames)
                if layout == 'full':
                    frame = bg.copy(); photo = zoom_frame(image, (cw,ch), zoom, channels=channels)
                    frame.paste(photo, (x,y), mask); frame.alpha_composite(edge); frame = frame.convert('RGB')
                else:
                    frame = zoom_frame(image, (w,h), zoom, tuple(info['background']), channels=channels)
                proc.stdin.write(frame.tobytes())
        except BaseException:
            proc.kill(); proc.wait(); raise
        finally:
            proc.stdin.close()
        if proc.wait(): raise RuntimeError('画像ズームの生成失敗: '+str(path.with_suffix('.log')))
    write(path.with_suffix('.motion.json'), {'method':'float_bicubic_inverse_affine', 'frames':frames,
          'scale_first':zoom_scale(0,frames), 'scale_last':zoom_scale(frames-1,frames),
          'scale_step':.04/max(1,frames-1), 'seconds':time.monotonic()-start, 'card':info})


def prepare_images(work, s):
    scenes = read(work/'scenes.json'); tl = read(work/'timeline.json')
    if not any(r['view']=='image' for r in scenes): return []
    write(work/'images.json', {'status':'running'})
    dest = glass_preview(work, s); fps = tl['fps']; rate = float(Fraction(fps)); rows=[]
    for i,r in enumerate(scenes):
        if r['view'] != 'image': continue
        im = load_image(r['image'], dest/f'source-{i:03}.png')
        layout = r['layout']; info,bg,mask = card_assets(im,layout,dest,s)
        frames = round(r['end']*rate)-round(r['start']*rate)
        if frames < 1: raise ValueError('imageシーンは1フレーム以上必要です')
        path = dest/f'scene-{i:03}'
        if layout == 'split':
            path = path.with_suffix('.png'); x,y=info['position']
            bg.paste(im.resize(tuple(info['size']),Image.Resampling.LANCZOS),(x,y),mask); bg.convert('RGB').save(path)
        else:
            path = path.with_suffix('.mkv'); write_motion(path,im,layout,info,bg,mask,frames,fps)
        fd = min(.3 if layout=='split' else .36, (r['end']-r['start'])/2)
        rows.append({'index':i,'file':str(path.relative_to(work)), 'layout':layout,
                     'start':round(r['start']*rate)/rate, 'end':round(r['end']*rate)/rate,
                     'frames':frames, 'fade_in':fd if i and scenes[i-1]['view']!='image' else 0,
                     'fade_out':fd if i+1<len(scenes) and scenes[i+1]['view']!='image' else 0,
                     'card':info,'decoded_size':im.size,'source_sha256':file_hash(r['image']),
                     'asset_sha256':file_hash(path)})
        print('image:',i,layout,frames,flush=True)
    # Fade the same gradient with the image layer; captions stay at global center.
    w,h=s['output']['width'],s['output']['height']; gh=max(1,round(480*h/2160))
    a=np.zeros((h,w,4),dtype=np.uint8)
    a[-gh:,:,3]=(np.arange(gh)[:,None]/gh*255*.35).astype(np.uint8)
    Image.fromarray(a).save(dest/'gradient.png')
    # contain（Web画面・製品ページの全面表示）は白い画面が多いので、承認済み本編と同じ濃いグラデ
    # （高さ460/2160・色#050a11・下へ向けて32%地点で16%→下端65%）を使う。
    gh2=max(1,round(460*h/2160)); b=np.zeros((h,w,4),dtype=np.uint8); b[-gh2:,:,:3]=(5,10,17)
    t=np.arange(gh2)/gh2; alpha=np.where(t<.32,.16*t/.32,.16+(.65-.16)*(t-.32)/.68)
    b[-gh2:,:,3]=(alpha[:,None]*255).astype(np.uint8)
    Image.fromarray(b).save(dest/'gradient_contain.png')
    write(work/'images.json',{'status':'complete', 'signature':object_hash({'settings':s,'scenes':scenes,'timeline':tl}), 'scenes':rows})
    return rows


def validate_images(work,s):
    scenes=read(work/'scenes.json')
    if not any(r['view']=='image' for r in scenes): return []
    data=read(work/'images.json')
    if data.get('status')!='complete' or data['signature']!=object_hash({'settings':s,'scenes':scenes,'timeline':read(work/'timeline.json')}):
        raise ValueError('画像設定が変更されています。renderを再実行してください')
    for r in data['scenes']:
        if not (work/r['file']).is_file() or file_hash(work/r['file'])!=r['asset_sha256'] or file_hash(scenes[r['index']]['image'])!=r['source_sha256']:
            raise ValueError('画像が変更されています。renderを再実行してください')
    return data['scenes']


def background_scenes(scenes, images):
    """Expose an adjacent screen (and its face) beneath the image boundary fades."""
    result=[dict(r) for r in scenes]
    for r in images:
        i=r['index']
        if r['fade_in']: result[i-1]['end']=r['start']+r['fade_in']
        if r['fade_out']: result[i+1]['start']=r['end']-r['fade_out']
    return result


def compose_images(work,s,rows,args,idx,g,base):
    w,h=s['output']['width'],s['output']['height'];fps=read(work/'timeline.json')['fps'];cfg=image_settings(s)
    rate=Fraction(fps)
    # Use one shared microsecond clock for every image-branch stream. Mixed
    # rational time bases can be reduced differently by framesync (especially
    # a camera's measured, nonstandard fps), even after rebuilding frame PTS.
    def clock(offset=0):
        return f'settb=AVTB,setpts=round((N+{offset})*{rate.denominator}*1000000/{rate.numerator})'
    g.append(f'[{base}]{clock()}[image_clock_base]');base='image_clock_base'
    def inp(key,file,still):
        idx[key]=len(idx)
        if still: args.extend(['-loop','1','-framerate',fps])
        args.extend(['-i',work/file]);return idx[key]
    splits=[r for r in rows if r['layout']=='split']
    if splits and 'talk' in idx:
        # A second decode avoids changing the pre-existing presenter/screen graph.
        source=inp('image_talk','talk.mp4',False)
        g.append(f'[{source}:v]{clock()},split={len(splits)}'+''.join(f'[image_talk{r["index"]}]' for r in splits))
    elif splits:
        source=inp('image_empty_presenter','images/glass-empty-presenter.png',True)
        g.append(f'[{source}:v]{clock()},format=rgba,split={len(splits)}'+''.join(f'[image_face{r["index"]}]' for r in splits))
    glass_rows=[r for r in rows if r['layout']!='contain'];contain_rows=[r for r in rows if r['layout']=='contain']
    if glass_rows:
        grad=inp('image_gradient','images/gradient.png',True)
        g.append(f'[{grad}:v]{clock()},format=rgba,split={len(glass_rows)}'+''.join(f'[image_grad{r["index"]}]' for r in glass_rows))
    if contain_rows:
        grad=inp('image_gradient_contain','images/gradient_contain.png',True)
        g.append(f'[{grad}:v]{clock()},format=rgba,split={len(contain_rows)}'+''.join(f'[image_grad{r["index"]}]' for r in contain_rows))
    fw=round(w*2/5);fw-=fw%2;pw=w-fw
    for r in rows:
        i=r['index'];source=inp(f'image{i}',r['file'],r['layout']=='split');layer=f'image_layer{i}'
        if r['layout']=='split':
            if 'talk' in idx:
                x=max(0,min(w-fw,round(cfg['presenter_center_x']*w-fw/2)))
                g.append(f'[image_talk{i}]crop={fw}:{h}:{x}:0,format=rgba[image_face{i}]')
            g.append(f'[{source}:v]{clock()},scale={pw}:{h},format=rgba[image_panel{i}]')
            labels=f'[image_face{i}][image_panel{i}]' if cfg['presenter_side']=='left' else f'[image_panel{i}][image_face{i}]'
            g.append(labels+f'hstack=inputs=2[{layer}]')
        else:
            # Matroska rounds timestamps to milliseconds. Rebuild the exact
            # timeline frame clock, otherwise overlay can repeat/skip a zoom
            # frame when the two clocks straddle the same display instant.
            start_frame=round(r['start']*float(rate))
            g.append(f'[{source}:v]{clock(start_frame)},format=rgba[{layer}]')
        g.append(f'[{layer}][image_grad{i}]overlay=0:0:format=auto[image_shaded{i}]')
        fades=[]
        if r['fade_in']:fades.append(f'fade=t=in:st={r["start"]:.9f}:d={r["fade_in"]:.9f}:alpha=1')
        if r['fade_out']:fades.append(f'fade=t=out:st={r["end"]-r["fade_out"]:.9f}:d={r["fade_out"]:.9f}:alpha=1')
        g.append(f'[image_shaded{i}]'+','.join(fades or ['null'])+f'[image_faded{i}]')
        dest=f'with_image{i}'
        # Compare against the same integer-microsecond boundaries as frame PTS.
        # Half a clock tick avoids floating-point ties at an exact scene cut.
        start=(math.floor(round(r['start']*float(rate))*rate.denominator*1000000/rate.numerator+.5)-.5)/1000000
        end=(math.floor(round(r['end']*float(rate))*rate.denominator*1000000/rate.numerator+.5)-.5)/1000000
        g.append(f'[{base}][image_faded{i}]overlay=0:0:enable=\'gte(t,{start:.7f})*lt(t,{end:.7f})\':eof_action=repeat[{dest}]')
        base=dest
    return base
