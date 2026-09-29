"""Portable caption checks; ambiguous Japanese boundaries remain review warnings."""
import math
import re
from .settings import ROOT, read

FILLER_WORDS = ('えーと', 'えっと', 'えー', 'あのー', 'あー', 'うーん', 'まあ',
                'なんか', 'ちょっと', 'やっぱり', 'やっぱ', 'なんていうか',
                'っていうか', 'そうそう', 'よっしゃ')
HEAD_BAD = re.compile(r'^(?:[んっーゃゅょ]|です|でした|ます|ました|られ|れる|れて|れば)')
TAIL_BAD = re.compile(r'(?:この|その|ちょっと|してい|になっ|かもしれ|とい)$')
# Preserve decimal numbers, thousands separators and file extensions.
TECH_DOT = re.compile(r'(?<=\d)[.,](?=\d)|\.(?:md|py|json|txt|csv|mp4|mov|srt|js|tsx|ts|html|css|sh|yml|yaml|png|jpg|pdf)(?![a-zA-Z0-9])', re.I)
PUNCT = re.compile(r'[、。，．,.!?！？;；:：]')

def fillers(text):
    found = []
    for word in FILLER_WORDS:
        # Longer variants count once, not both やっぱ and やっぱり.
        if word == 'やっぱ' and 'やっぱり' in text:
            continue
        found.extend([word] * text.count(word))
    found += re.findall(r'(?:^|\s)(?:あの|はい|その)(?=\s|$)', text)
    found += re.findall(r'^(?:いや|じゃあ)(?=\s|$)', text)
    return found

def text_issues(text):
    fail, warn = [], []
    if not text.strip() or '\n' in text or '\r' in text: fail.append('one_line')
    if len(text) > 23: fail.append('max_chars')
    if PUNCT.search(TECH_DOT.sub('', text)): fail.append('punctuation')
    if HEAD_BAD.search(text): fail.append('head_fragment')
    elif text.startswith(('よ', 'ね', 'ら', 'り', 'る', 'れ', 'ろ')): warn.append('head_review')
    if TAIL_BAD.search(text) or text in ('て', 'で', 'と'): fail.append('unfinished_tail')
    elif text.endswith(('て', 'で', 'と')): warn.append('tail_review')
    if fillers(text): fail.append('filler')
    return fail, warn

def vocabulary_rules(out=None):
    rules = list(read(ROOT/'references/vocabulary.json').get('corrections', []))
    if out and (out/'vocabulary.local.json').exists():
        rules += read(out/'vocabulary.local.json').get('corrections', [])
    return rules

def check_captions(items, timeline, out=None):
    failures, warnings = [], []
    rules = vocabulary_rules(out)
    last = 0.0
    for i, c in enumerate(items):
        text = c.get('text', '')
        fail, warn = text_issues(text)
        a, b = c.get('start', -1), c.get('end', -1)
        valid = all(isinstance(x, (int, float)) and math.isfinite(x) for x in (a, b)) and 0 <= a < b <= timeline['duration_s'] + 1e-6
        cps = len(text)/(b-a) if valid else None
        if not valid: fail.append('time_range')
        else:
            if b-a < .6-1e-6: fail.append('minimum_duration')
            if cps > 12+1e-6: fail.append('cps_over_12')
            elif cps > 9: warn.append('cps_over_9')
            if a < last-1e-6: fail.append('overlap')
            if not any(r['output_s']-1e-6 <= a and b <= r['output_e']+1e-6 for r in timeline['segments']): fail.append('outside_keep')
            matches=[r for r in timeline['segments'] if r['output_s']-1e-6<=a and b<=r['output_e']+1e-6]
            if 'source_start' in c and matches:
                r=matches[0]
                if not r['source_s']-1e-6<=c['source_start']<c.get('source_end',-1)<=r['source_e']+1e-6:fail.append('source_outside_keep')
            last = b
        if any(re.search(r['pattern'], text) and re.sub(r['pattern'], r['replacement'], text) != text for r in rules): fail.append('uncorrected_vocabulary')
        for kind, bucket in ((fail, failures), (warn, warnings)):
            for code in kind: bucket.append({'index': i, 'code': code, 'text': text, 'cps': round(cps, 3) if cps is not None else None})
    if not items: failures.append({'index': None, 'code': 'empty_captions'})
    return {'status': 'FAIL' if failures else 'PASS', 'count': len(items), 'fail_count': len(failures),
            'warn_count': len(warnings), 'failures': failures, 'warnings': warnings,
            'boundary_policy': 'Certain fragments FAIL; potentially valid words/conjunctions WARN and require wording review.'}

def metrics(items):
    n = len(items)
    return {'count': n, 'comma_end_ratio': sum(c['text'].rstrip().endswith('、') for c in items)/n if n else 0,
            'filler_count': sum(len(re.findall(r'まあ|ちょっと|はい|なんか|やっぱ', c['text'])) for c in items),
            'cps_over_12': sum(len(c['text'])/max(1e-9,c['end']-c['start'])>12+1e-6 for c in items),
            'gaps_over_0_1': sum(b['start']-a['end']>.1+1e-6 for a,b in zip(items,items[1:]))}
