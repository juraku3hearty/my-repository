"""Word timestamps, gap recovery, and vocabulary edits with source anchors."""
import re
from copy import deepcopy
import numpy as np
from scipy.io import wavfile
from .settings import ROOT, ff, write, read
from .audio import master_role, stream_index, rms_frames
from .fingerprints import file_hash, object_hash

MODEL = 'mlx-community/whisper-large-v3-turbo'
REVISION = 4


def vocabulary(work):
    terms, corrections = [], []
    for path in (ROOT / 'references/vocabulary.json', work.parent / 'vocabulary.local.json'):
        if not path.exists():
            continue
        data = read(path)
        terms.extend(data.get('initial_prompt_terms', []))
        corrections.extend(data.get('corrections', []))
    for item in corrections:
        re.compile(item['pattern'])
    return {'initial_prompt_terms': list(dict.fromkeys(terms)), 'corrections': corrections}


def normalized_text(text):
    # Whisper's leading spaces are word boundaries, not disposable decoration.
    return re.sub(r'\s+', lambda m: ' ' if m.start() and m.end() < len(text)
                  and re.match('[A-Za-z]', text[m.start()-1]) and re.match('[A-Za-z]', text[m.end()]) else '', text)


def normalize_words(words):
    text = ''.join(w['w'] for w in words)
    owners = [i for i, w in enumerate(words) for _ in w['w']]
    pieces = [''] * len(words)
    cursor = 0
    for match in re.finditer(r'\s+', text):
        for j in range(cursor, match.start()):
            pieces[owners[j]] += text[j]
        if match.start() and match.end() < len(text) and re.match('[A-Za-z]', text[match.start()-1]) and re.match('[A-Za-z]', text[match.end()]):
            pieces[owners[match.end()]] += ' '
        cursor = match.end()
    for j in range(cursor, len(text)):
        pieces[owners[j]] += text[j]
    return [dict(w, w=piece) for w, piece in zip(words, pieces) if piece]


def extract_words(result, offset=0):
    words, checks = [], []
    for i, seg in enumerate(result.get('segments', [])):
        raw = seg.get('words', [])
        body = normalized_text(seg.get('text', ''))
        joined = normalized_text(''.join(w['word'] for w in raw))
        checks.append({'segment': i, 'matches': body == joined, 'text': body, 'word_text': joined})
        words.extend({'w': w['word'], 's': float(w['start']) + offset, 'e': float(w['end']) + offset}
                     for w in raw if w['word'].strip())
    return normalize_words(words), checks


def merge_zero_words(words):
    words = deepcopy(words)
    before = ''.join(w['w'] for w in words)
    merged = 0
    i = 0
    while i < len(words):
        word = words[i]
        if word['e'] < word['s']:
            raise ValueError('負の長さの単語時刻')
        if word['e'] != word['s']:
            i += 1
            continue
        if len(words) == 1:
            raise ValueError('長さ0秒の単語しかありません。時刻を回復できません')
        # After sentence punctuation, prepend to the following word when available.
        to_next = i == 0 or (re.search(r'[、。！？,.!?]$', words[i-1]['w'].rstrip()) and i+1 < len(words))
        target = words[i+1] if to_next else words[i-1]
        target['w'] = word['w'] + target['w'] if to_next else target['w'] + word['w']
        target.setdefault('zero_duration_words', []).extend(word.get('zero_duration_words', []) + [{'w': word['w'], 's': word['s'], 'e': word['e']}])
        del words[i]
        merged += 1
    if ''.join(w['w'] for w in words) != before:
        raise ValueError('0秒単語の結合で本文が変わりました')
    return words, merged


def apply_corrections(words, corrections):
    words = deepcopy(words)
    anchors = deepcopy(words)
    edits = []
    for rule in corrections:
        text = ''.join(w['w'] for w in words)
        owners = [i for i, w in enumerate(words) for _ in w['w']]
        pieces = [''] * len(words)
        cursor = 0
        for match in re.finditer(rule['pattern'], text):
            if match.start() == match.end():
                raise ValueError('語彙補正は空文字に一致できません')
            for j in range(cursor, match.start()):
                pieces[owners[j]] += text[j]
            replacement = match.expand(rule['replacement'])
            # Keep every affected word anchor when the replacement has enough
            # characters. A very short source token must not disappear through
            # proportional rounding alone.
            affected = list(dict.fromkeys(owners[match.start():match.end()]))
            weights = [owners[match.start():match.end()].count(i) for i in affected]
            minimum = int(len(replacement) >= len(affected))
            remaining = len(replacement) - minimum * len(affected)
            shares = [remaining * weight / sum(weights) for weight in weights]
            sizes = [minimum + int(share) for share in shares]
            order = sorted(range(len(sizes)), key=lambda i: shares[i] - int(shares[i]), reverse=True)
            for i in order[:len(replacement) - sum(sizes)]:
                sizes[i] += 1
            pos = 0
            for owner, size in zip(affected, sizes):
                pieces[owner] += replacement[pos:pos+size]
                pos += size
            edits.append({'pattern': rule['pattern'], 'before': match.group(), 'after': replacement,
                          's': words[owners[match.start()]]['s'], 'e': words[owners[match.end()-1]]['e']})
            cursor = match.end()
        for j in range(cursor, len(text)):
            pieces[owners[j]] += text[j]
        for word, piece in zip(words, pieces):
            word['w'] = piece
    for word, original in zip(words, anchors):
        if word['w'] != original['w']:
            word['source_words'] = [{'w': original['w'], 's': original['s'], 'e': original['e']}]
    # A shorter replacement can consume an entire token. Preserve its original
    # anchors in source_words, and use only original endpoints for the merged token.
    for i in range(len(words)-1, -1, -1):
        if words[i]['w'] or len(words) == 1:
            continue
        target = words[i-1] if i else words[i+1]
        target.setdefault('source_words', [{'w': target['w'], 's': target['s'], 'e': target['e']}])
        target['source_words'].extend(words[i]['source_words'])
        target['source_words'].sort(key=lambda w: (w['s'], w['e']))
        target['s'] = min(target['s'], words[i]['s'])
        target['e'] = max(target['e'], words[i]['e'])
        del words[i]
    if not words or not any(w['w'] for w in words):
        raise ValueError('語彙補正で本文が空になりました')
    return words, edits


def find_gaps(words, duration):
    gaps, end = [], 0.
    for word in words:
        if word['s'] - end >= 3:
            gaps.append((end, word['s']))
        end = max(end, word['e'])
    if duration - end >= 3:
        gaps.append((end, duration))
    return gaps


def recover_gaps(work, words, data, rate, recognize):
    records, checks = [], []
    additions, zero_count = [], 0
    for i, (start, end) in enumerate(find_gaps(words, len(data) / rate)):
        frames = rms_frames(data[round(start*rate):round(end*rate)], rate)
        active = float(np.count_nonzero(frames > -40) * .05)
        record = {'s': start, 'e': end, 'active_s': active, 'retrieved_words': 0, 'inserted_words': 0, 'retried': active >= .5}
        if record['retried']:
            a, b = max(0., start-1), min(len(data)/rate, end+1)
            chunk = work / f'transcribe-gap-{i:03d}.wav'
            wavfile.write(chunk, rate, data[round(a*rate):round(b*rate)])
            result = recognize(chunk)
            write(work / f'transcript.gap-{i:03d}.raw.json', result)
            recovered, checked = extract_words(result, a)
            checks.extend(dict(row, gap=i) for row in checked)
            if recovered:
                recovered, count = merge_zero_words(recovered)
                zero_count += count
            # Context words already present in the transcript must not be duplicated.
            inserted = [w for w in recovered if w['s'] >= start and w['e'] <= end]
            additions.extend(inserted)
            record.update(extract_s=a, extract_e=b, retrieved_words=len(recovered), inserted_words=len(inserted))
        records.append(record)
    words = sorted(words + additions, key=lambda w: (w['s'], w['e']))
    report = {'threshold_s': 3, 'rms_threshold_dbfs': -40, 'minimum_active_s': .5,
              'detected_count': sum(r['retried'] for r in records), 'gap_count': len(records),
              'inserted_word_count': len(additions), 'intervals': records}
    write(work / 'transcript.gaps.json', report)
    return words, zero_count, checks


def transcribe(work, s, force=False, model=None):
    p = read(work / 'probe.json')
    role = master_role(p, s)
    source, index = p[role]['path'], stream_index(p[role])
    path, meta = work / 'transcript.json', work / 'transcript.meta.json'
    vocab = vocabulary(work)
    signature = {'revision': REVISION, 'master': role, 'source': source, 'source_sha256': file_hash(source),
                 'audio_stream_index': index, 'model': model or MODEL, 'vocabulary_sha256': object_hash(vocab),
                 'condition_on_previous_text': False, 'temperature': 0}
    previous = read(meta) if meta.exists() else {}
    sidecars = ['transcript.gaps.json', 'transcript.validation.json', 'transcript.words.original.json', 'transcript.text.json']
    if not force and path.exists() and previous.get('signature') == signature and previous.get('transcript_sha256') == file_hash(path) and all((work / f).exists() for f in sidecars):
        return read(path)
    # A failed rerun must not leave the previous successful cache marker usable.
    write(meta, {'status': 'running', 'signature': signature})
    ff(['-v', 'error', '-i', source, '-map', f'0:{index}', '-vn', '-ac', '1', '-ar', '16000',
        work / 'transcribe.wav'], work / 'logs/transcribe_extract.log')
    import mlx_whisper
    def recognize(wav):
        return mlx_whisper.transcribe(str(wav), path_or_hf_repo=model or MODEL, language='ja',
                                     word_timestamps=True, verbose=False, condition_on_previous_text=False,
                                     temperature=0, initial_prompt='、'.join(vocab['initial_prompt_terms']))
    result = recognize(work / 'transcribe.wav')
    write(work / 'transcript.raw.json', result)
    words, checks = extract_words(result)
    if not words:
        raise ValueError('単語時刻を取得できませんでした')
    words, zero_count = merge_zero_words(words)
    rate, data = wavfile.read(work / 'transcribe.wav')
    data = data.astype(np.float32) / 32768
    words, recovered_zeros, recovered_checks = recover_gaps(work, words, data, rate, recognize)
    checks.extend(recovered_checks)
    write(work / 'transcript.words.original.json', words)
    words, edits = apply_corrections(words, vocab['corrections'])
    validation = {'segment_text_matches': all(r['matches'] for r in checks),
                  'segment_count': len(checks), 'segment_mismatches': [r for r in checks if not r['matches']],
                  'zero_duration_merged': zero_count + recovered_zeros, 'initial_zero_duration_merged': zero_count,
                  'gap_zero_duration_merged': recovered_zeros, 'corrections': edits,
                  'word_count': len(words), 'remaining_zero_duration': sum(w['s'] == w['e'] for w in words)}
    write(work / 'transcript.validation.json', validation)
    if not validation['segment_text_matches']:
        raise ValueError('単語連結とセグメント本文が一致しません。transcript.validation.jsonを確認してください')
    write(path, words)
    write(work / 'transcript.text.json', {'text': ''.join(w['w'] for w in words), 'corrections': edits})
    write(meta, {'signature': signature, 'transcript_sha256': file_hash(path), 'status': 'complete'})
    print(f'文字起こし: {len(words)}語、0秒単語結合 {zero_count + recovered_zeros}、有音ギャップ {read(work / "transcript.gaps.json")["detected_count"]}', flush=True)
    return words
