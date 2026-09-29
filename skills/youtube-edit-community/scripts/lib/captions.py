"""Word-anchored editable captions and bundled-font layout checks."""
import re
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageColor
from .settings import ROOT,read,write

def load_font(size,name='NotoSansJP-ExtraBold'):
    return ImageFont.truetype(str(ROOT/'fonts'/f'{name}.ttf'),round(size))

def wrap_lines(text,font,max_w,max_chars=24):
    lines=[]
    for part in text.split('\n'):
        while len(part)>max_chars or font.getlength(part)>max_w:
            candidates=[]
            for k in range(1,min(max_chars,len(part)-1)+1):
                if font.getlength(part[:k])>max_w or part[k] in '、。！？ーっゃゅょぁぃぅぇぉ': continue
                penalty=abs(min(max_chars,len(part)/2)-k)
                if part[k-1] in '、。！？': penalty-=20
                elif part[k-1] in 'はがをにでとへも': penalty-=8
                if re.match(r'[A-Za-z0-9]',part[k-1]) and re.match(r'[A-Za-z0-9]',part[k]): penalty+=100
                candidates.append((penalty,k))
            if not candidates: raise ValueError('字幕を画面幅へ収められません: '+part)
            k=min(candidates)[1];lines.append(part[:k]);part=part[k:]
        lines.append(part)
    return lines

def render_png(text,w,h,font,marginv,out_path,color='#ffffff'):
    """Portable PIL fallback/reference rasterizer; delivery uses Remotion renderStill."""
    lines=wrap_lines(text,font,w-160);lh=round(font.size*1.4)
    shadow=Image.new('RGBA',(w,h));draw=ImageDraw.Draw(shadow)
    y=h-marginv-lh*len(lines)
    for i,line in enumerate(lines): draw.text(((w-draw.textlength(line,font=font))/2+2,y+i*lh+2),line,font=font,fill=(0,0,0,225),anchor='lt')
    image=shadow.filter(ImageFilter.GaussianBlur(8));draw=ImageDraw.Draw(image)
    for i,line in enumerate(lines): draw.text(((w-draw.textlength(line,font=font))/2,y+i*lh),line,font=font,fill=ImageColor.getrgb(color)+(255,),anchor='lt')
    image.save(out_path)

def draft_text(text):
    """Remove filler tokens before sentence-aware splitting; keep English spaces."""
    from .caption_check import FILLER_WORDS
    text=re.sub(r'[、。，,！？!?；;：:]+', ' ', text).strip()
    for filler in sorted(FILLER_WORDS,key=len,reverse=True):text=text.replace(filler,'')
    text=re.sub(r'^(?:はい|あの|いや|じゃあ|だから)(?:\s|$)', '', text)
    text=re.sub(r'^っていう(?:のが|のは|ことで|のを)?', '', text)
    text=re.sub(r'(?<=[0-9０-９万千百十億年月日人回秒分円])(?:ぐらい|くらい|とか)', '', text)
    return re.sub(r'\s+', ' ', text).strip()

def boundary_cost(left,right):
    from .caption_check import HEAD_BAD, TAIL_BAD
    if not left or not right:return 0
    if HEAD_BAD.search(right) or right[0] in 'よね':return 1000
    if TAIL_BAD.search(left):return 1000
    if re.search(r'[A-Za-z0-9]$',left) and re.match(r'[A-Za-z0-9]',right):return 1000
    if re.search(r'[0-9][.,]$',left) and re.match(r'[0-9]',right):return 1000
    if re.search(r'[ァ-ヴー]$',left) and re.match(r'[ァ-ヴー]',right):return 1000
    # Whisper can split kanji stems and their inflections into separate tokens.
    if re.search(r'[一-龯]$',left) and re.match(r'(?:った|って|く(?:て|な|$)|かっ|かった|しい|しく|します|した|する)',right):return 1000
    if left.endswith(('です','ます','でした','ました','ません','よね','ですよ','だよ','だね')):return -18
    if left.endswith(('けど','ので','から','ても','ながら')):return -10
    if left.endswith(('て','で','と')):return 35
    if left.endswith(('を','に','が','は','も','へ')):return -2
    return 15

def captions(work,s):
    words=read(work/'transcript.json');timeline=read(work/'timeline.json');result=[];notes=[]
    def join_words(tokens):return "".join(w["w"] for w in tokens)
    for r in timeline['segments']:
        selected=[w for w in words if w['s']>=r['source_s']-1e-6 and w['e']<=r['source_e']+1e-6]
        # A retained range may end before the noun after a demonstrative.
        # Do not display that dangling fragment; retain the omitted words for review.
        omitted=[]
        while selected and selected[-1]['w'].strip(' 、。') in ('この','その','ちょっと'):
            word=selected.pop();omitted.insert(0,word)
            if word['w'].strip()=='この' and selected and selected[-1]['w'].strip()=='こ':
                omitted.insert(0,selected.pop())
        if omitted:notes.append({'segment':r['id'],'reason':'unfinished retained-range tail','omitted_words':omitted})
        sentences=[];pending=[]
        for wi,word in enumerate(selected):
            raw=word['w'];text=draft_text(raw)
            if raw.startswith(' ') and text and re.match(r'[A-Za-z]',text):text=' '+text
            next_raw=selected[wi+1]['w'].lstrip() if wi+1<len(selected) else ''
            numeric_comma=bool(re.search(r'\d,$',raw.rstrip()) and re.match(r'\d',next_raw))
            if raw.rstrip().endswith(('、',',')) and not numeric_comma:text+=' '
            token=text.strip()
            following=''.join(x['w'] for x in selected[wi+1:wi+3]).lstrip()
            demonstrative=token in ('あの','その') and following.startswith(('人','方','動画','画面','素材','ツール','商品','場所','本','日','回','辺','とき','時','まま'))
            filler=(token=='はい' or (token=='あの' and not demonstrative)
                    or (token=='その' and not demonstrative and raw.rstrip().endswith(('、',',')))
                    or (not pending and token in ('いや','じゃあ','だから','で')))
            if token and not filler:
                pending.append({**word,'w':text})
            if re.search(r'[。！？!?]',raw):
                if pending:sentences.append(pending);pending=[]
        if pending:sentences.append(pending)
        for tokens in sentences:
            n=len(tokens);cost=[float('inf')]*(n+1);cost[n]=0;choice={}
            def joined(a,b):return draft_text(join_words(tokens[a:b]))
            for i in range(n-1,-1,-1):
                for j in range(i+1,n+1):
                    text=joined(i,j)
                    if len(text)>23:break
                    if not text:continue
                    penalty=(len(text)-13)**2/5
                    if j<n:
                        boundary=boundary_cost(text,joined(j,n))
                        if boundary>=1000:continue
                        penalty+=boundary
                    score=penalty+cost[j]
                    if score<cost[i]:cost[i]=score;choice[i]=j
            i=0
            while i<n:
                j=choice.get(i)
                if j is None:raise ValueError('23字以内で語を分割できません。全文校閲が必要です: '+joined(i,n))
                text=joined(i,j);a=tokens[i]['s'];b=tokens[j-1]['e']
                result.append({'start':round(r['output_s']+a-r['source_s'],6),'end':round(r['output_s']+b-r['source_s'],6),
                               'text':text,'source_start':a,'source_end':b,'segment':r['id']})
                i=j
    write(work/'captions.json',result);write(work/'captions.draft-notes.json',notes);return result

def validate_captions(items,timeline,s):
    errors=[];font=load_font(s['caption']['px'],s['caption']['font']);last=0
    for i,c in enumerate(items):
        tag=f'caption {i}'
        if not 0<=c['start']<c['end']<=timeline['duration_s']+1e-6:errors.append(tag+': output range')
        if c['start']<last-1e-6:errors.append(tag+': overlap')
        last=c['end'];lines=c['text'].split('\n')
        if not c['text'].strip() or len(lines)>1 or any(len(l)>23 or font.getlength(l)>s['output']['width']-160 for l in lines):errors.append(tag+': layout')
        matches=[r for r in timeline['segments'] if r['output_s']-1e-6<=c['start'] and c['end']<=r['output_e']+1e-6]
        if not matches:errors.append(tag+': crosses cut')
        elif 'source_start' in c:
            r=matches[0]
            if not r['source_s']-1e-6<=c['source_start']<c['source_end']<=r['source_e']+1e-6:errors.append(tag+': source outside keep')
            if abs(c['start']-(r['output_s']+c['source_start']-r['source_s']))>.002 or abs(c['end']-(r['output_s']+c['source_end']-r['source_s']))>.002:errors.append(tag+': timestamp mapping')
    return errors
