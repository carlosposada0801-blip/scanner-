#!/usr/bin/env python3
"""Generate js/verses.js with exact KJV and BSB text.

Sources (download into a scratch folder, then pass its path):
  KJV: https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json
  BSB: npm package @bible-help/get-bible-verses -> data/berean/berean_verses.json
       and data/clarkson/index_conversions.json
  ASV: https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/ASV.json (save as asv.json)

Usage: python3 tools/build_verses.py /path/to/sources > js/verses.js
"""
import json, re, sys
from pathlib import Path

SRC = Path(sys.argv[1])
OSIS = ['Gen','Exod','Lev','Num','Deut','Josh','Judg','Ruth','1Sam','2Sam','1Kgs','2Kgs','1Chr','2Chr','Ezra','Neh','Esth','Job','Ps','Prov','Eccl','Song','Isa','Jer','Lam','Ezek','Dan','Hos','Joel','Amos','Obad','Jonah','Mic','Nah','Hab','Zeph','Hag','Zech','Mal',
        'Matt','Mark','Luke','John','Acts','Rom','1Cor','2Cor','Gal','Eph','Phil','Col','1Thess','2Thess','1Tim','2Tim','Titus','Phlm','Heb','Jas','1Pet','2Pet','1John','2John','3John','Jude','Rev']
NAMES = {'Gen':'Genesis','Deut':'Deuteronomy','Josh':'Joshua','Ps':'Psalm','Prov':'Proverbs','Eccl':'Ecclesiastes','Isa':'Isaiah','Jer':'Jeremiah','Lam':'Lamentations','Mic':'Micah','Zeph':'Zephaniah',
         'Matt':'Matthew','John':'John','Acts':'Acts','Rom':'Romans','1Cor':'1 Corinthians','2Cor':'2 Corinthians','Gal':'Galatians','Eph':'Ephesians','Phil':'Philippians','Col':'Colossians',
         '1Thess':'1 Thessalonians','2Tim':'2 Timothy','Heb':'Hebrews','Jas':'James','1Pet':'1 Peter','1John':'1 John','Rev':'Revelation'}

kjv = json.loads((SRC / 'kjv.json').read_text(encoding='utf-8-sig'))
bsb = json.loads((SRC / 'berean_verses.json').read_text())['verses']
bidx = json.loads((SRC / 'index_conversions.json').read_text())['osisRef']
asv = json.loads((SRC / 'asv.json').read_text())['books']

# Psalm titles the BSB prints as part of verse 1.
SUPERSCRIPTIONS = re.compile(r'^(A Psalm of David\.( Maschil\.)?|Of David\.( A Maskil\.)?|A Psalm of David; Maschil\.)\s+')

def clean(t):
    t = re.sub(r'[{}\[\]]', '', t)          # KJV italics markers
    t = re.sub(r'\s+([,;:.?!])', r'\1', t)   # 'LORD ,' -> 'LORD,'
    return re.sub(r'\s+', ' ', t).strip()

def text(book, ch, v1, v2, tr):
    out = []
    for v in range(v1, v2 + 1):
        if tr == 'KJV':
            out.append(kjv[OSIS.index(book)]['chapters'][ch - 1][v - 1])
        elif tr == 'ASV':
            vs = asv[OSIS.index(book)]['chapters'][ch - 1]['verses']
            t = next(x['text'] for x in vs if x['verse'] == v)
            out.append(SUPERSCRIPTIONS.sub('', t) if book == 'Ps' and v == 1 else t)
        else:
            t = bsb[bidx[f'{book}.{ch}.{v}']]
            out.append(SUPERSCRIPTIONS.sub('', t) if book == 'Ps' and v == 1 else t)
    return clean(' '.join(out))

def V(id, spec):
    """spec like 'John 3:16' or 'Prov 3:5-6' using OSIS book codes."""
    book, cv = spec.rsplit(' ', 1)
    ch, vs = cv.split(':')
    v1, v2 = (vs.split('-') + [vs])[:2]
    ch, v1, v2 = int(ch), int(v1), int(v2)
    ref = f"{NAMES[book]} {ch}:{v1}" + (f"-{v2}" if v2 != v1 else '')
    return {'id': id, 'ref': ref, 'kjv': text(book, ch, v1, v2, 'KJV'), 'bsb': text(book, ch, v1, v2, 'BSB'), 'asv': text(book, ch, v1, v2, 'ASV')}

def chain(id, spec, parts):
    v = V(id, spec)
    v['chain'] = parts
    return v

def passage(prefix, book, ch, v1, v2):
    ids = [f'{prefix}{v}' for v in range(v1, v2 + 1)]
    verses = [V(i, f'{book} {ch}:{v}') for i, v in zip(ids, range(v1, v2 + 1))]
    return verses + [chain(f'{prefix}{v1}to{v2}', f'{book} {ch}:{v1}-{v2}', ids)]

PACKS = [
  dict(id='start', name='Start Here', icon='🌱', desc='The foundations — who God is and what He has done.', tags='gospel salvation basics new believer foundations', verses=[
    V('psa119-11','Ps 119:11'), V('jhn3-16','John 3:16'), V('rom3-23','Rom 3:23'), V('rom6-23','Rom 6:23'), V('rom5-8','Rom 5:8'),
    V('eph2-8','Eph 2:8-9'), V('rom10-9','Rom 10:9'), V('2co5-17','2Cor 5:17'), V('1jn1-9','1John 1:9'), V('jhn14-6','John 14:6'),
    V('gal2-20','Gal 2:20'), V('psa119-105','Ps 119:105'), V('2ti3-16','2Tim 3:16'), V('heb4-12','Heb 4:12'), V('pro3-5','Prov 3:5-6'), V('mat6-33','Matt 6:33')]),
  dict(id='peace', name='Peace & Courage', icon='🕊️', desc='Promises to hold onto when life is heavy.', tags='peace courage strength brave hard times trust', verses=[
    V('jos1-9','Josh 1:9'), V('isa41-10','Isa 41:10'), V('php4-6','Phil 4:6-7'), V('isa26-3','Isa 26:3'), V('1pe5-7','1Pet 5:7'),
    V('mat11-28','Matt 11:28'), V('2ti1-7','2Tim 1:7'), V('deu31-6','Deut 31:6'), V('psa27-1','Ps 27:1'), V('psa46-10','Ps 46:10'),
    V('isa40-31','Isa 40:31'), V('psa23-1','Ps 23:1'), V('zep3-17','Zeph 3:17'), V('lam3-22','Lam 3:22-23'), V('rom8-28','Rom 8:28'),
    V('rom8-38','Rom 8:38-39'), V('jer29-11','Jer 29:11')]),
  dict(id='walk', name='Walking with Christ', icon='👣', desc='Living out faith day by day.', tags='discipleship growth obedience fruit spirit daily life', verses=[
    V('php4-13','Phil 4:13'), V('rom12-2','Rom 12:2'), V('jhn15-5','John 15:5'), V('gal5-22','Gal 5:22-23'), V('col3-23','Col 3:23'),
    V('mic6-8','Mic 6:8'), V('mat22-37','Matt 22:37'), V('jhn13-34','John 13:34'), V('1jn4-19','1John 4:19'), V('mat5-16','Matt 5:16'),
    V('1co10-13','1Cor 10:13'), V('jas1-5','Jas 1:5'), V('psa37-4','Ps 37:4'), V('eph2-10','Eph 2:10'), V('1th5-16','1Thess 5:16-18'), V('heb11-1','Heb 11:1')]),
  dict(id='hope', name='Hope & Mission', icon='✨', desc='Who Jesus is, and the good news we carry.', tags='hope mission evangelism witness share faith jesus', verses=[
    V('gen1-1','Gen 1:1'), V('jhn1-1','John 1:1'), V('jhn11-25','John 11:25'), V('heb13-8','Heb 13:8'), V('rom1-16','Rom 1:16'),
    V('act1-8','Acts 1:8'), V('mat28-19','Matt 28:19-20'), V('rom15-13','Rom 15:13'), V('psa34-8','Ps 34:8'), V('psa139-14','Ps 139:14')]),
  dict(id='anxiety', name='Anxiety & Fear', icon='🌤️', topic=True, desc='When worry won’t let go.', tags='anxious anxiety worry worried fear afraid scared stress stressed panic nervous overwhelmed', verses=[
    V('php4-6','Phil 4:6-7'), V('1pe5-7','1Pet 5:7'), V('mat6-34','Matt 6:34'), V('psa56-3','Ps 56:3'), V('jhn14-27','John 14:27'),
    V('isa41-10','Isa 41:10'), V('2ti1-7','2Tim 1:7'), V('psa94-19','Ps 94:19')]),
  dict(id='forgive', name='Forgiveness', icon='🤍', topic=True, desc='Receiving grace, and giving it.', tags='forgive forgiveness forgiven guilt guilty shame sin mercy grace sorry regret', verses=[
    V('1jn1-9','1John 1:9'), V('rom8-1','Rom 8:1'), V('psa103-12','Ps 103:12'), V('isa1-18','Isa 1:18'), V('eph4-32','Eph 4:32'),
    V('col3-13','Col 3:13'), V('psa32-1','Ps 32:1')]),
  dict(id='temptation', name='Temptation & Purity', icon='🛡️', topic=True, desc='Standing firm when it’s hard.', tags='temptation tempted lust addiction purity pure struggle resist sin habit', verses=[
    V('1co10-13','1Cor 10:13'), V('jas4-7','Jas 4:7'), V('psa119-9','Ps 119:9'), V('mat26-41','Matt 26:41'), V('heb4-15','Heb 4:15'),
    V('gal5-16','Gal 5:16'), V('1co6-19','1Cor 6:19-20'), V('psa119-11','Ps 119:11')]),
  dict(id='love', name='Love & Marriage', icon='💞', topic=True, desc='For marriage, family and friendship.', tags='love marriage married relationship husband wife friend friends friendship family dating kindness', verses=[
    V('1co13-4','1Cor 13:4-7'), V('1jn4-7','1John 4:7-8'), V('col3-14','Col 3:14'), V('eph4-2','Eph 4:2-3'), V('ecc4-12','Eccl 4:12'),
    V('pro17-17','Prov 17:17'), V('jhn15-13','John 15:13'), V('rom12-10','Rom 12:10')]),
  dict(id='grief', name='Grief & Comfort', icon='🌧️', topic=True, desc='When your heart is hurting.', tags='grief grieving sad sadness loss death mourning depressed depression lonely hurting hurt comfort pain broken heartbroken', verses=[
    V('psa34-18','Ps 34:18'), V('mat5-4','Matt 5:4'), V('psa147-3','Ps 147:3'), V('rev21-4','Rev 21:4'), V('2co1-3','2Cor 1:3-4'),
    V('jhn16-33','John 16:33'), V('psa73-26','Ps 73:26')]),
  dict(id='identity', name='Identity in Christ', icon='🪞', topic=True, desc='Who God says you are.', tags='identity worth worthless self esteem confidence insecure value chosen loved accepted who am i', verses=[
    V('jhn1-12','John 1:12'), V('1pe2-9','1Pet 2:9'), V('eph1-7','Eph 1:7'), V('2co5-17','2Cor 5:17'), V('psa139-14','Ps 139:14'),
    V('eph2-10','Eph 2:10'), V('gal2-20','Gal 2:20')]),
  dict(id='purpose', name='Purpose & Direction', icon='🧭', topic=True, desc='For decisions, work and the road ahead.', tags='purpose work job career school study future plans plan calling direction decision decisions guidance', verses=[
    V('pro16-3','Prov 16:3'), V('pro16-9','Prov 16:9'), V('psa32-8','Ps 32:8'), V('1co10-31','1Cor 10:31'), V('col3-23','Col 3:23'),
    V('jer29-11','Jer 29:11'), V('pro3-5','Prov 3:5-6')]),
  dict(id='passages', name='Passages', icon='📖', desc='Learn verse by verse, then recite the whole passage.', tags='passage chapter long psalm 23 lords prayer beatitudes', verses=
    passage('psa23-', 'Ps', 23, 1, 6) +
    passage('mat6-', 'Matt', 6, 9, 13) +
    passage('jhn1-', 'John', 1, 1, 5) +
    passage('isa53-', 'Isa', 53, 4, 6) +
    passage('mat5-', 'Matt', 5, 3, 10)),
]

# Reuse existing ids so progress carries over (psa23-1 and jhn1-1 already exist).
PASSAGE_NAMES = {'psa23-1to6': 'Psalm 23', 'mat6-9to13': 'The Lord’s Prayer', 'jhn1-1to5': 'The Word', 'isa53-4to6': 'The Suffering Servant', 'mat5-3to10': 'The Beatitudes'}
for v in PACKS[-1]['verses']:
    if v.get('chain'):
        v['title'] = PASSAGE_NAMES[v['id']]

print('// Generated by tools/build_verses.py. Do not edit by hand.')
print('// KJV, ASV: public domain. BSB: The Holy Bible, Berean Standard Bible, BSB, dedicated to the public domain.')
print('window.PACKS = ' + json.dumps(PACKS, ensure_ascii=False, indent=1) + ';')
