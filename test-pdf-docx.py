#!/usr/bin/env python3
"""Validate browser-generated acceptance DOCX files; set OUTPUT_DIR."""
import os
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET

root = Path(os.environ.get('OUTPUT_DIR', '.'))
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
R = '{http://schemas.openxmlformats.org/package/2006/relationships}'

def check(name, pages, contains, tables=0):
    with ZipFile(root / name) as z:
        assert z.testzip() is None
        names = set(z.namelist())
        doc = ET.fromstring(z.read('word/document.xml'))
        rels = ET.fromstring(z.read('word/_rels/document.xml.rels'))
        media = [n for n in names if n.startswith('word/media/') and not n.endswith('/')]
        assert len(media) == pages, (name, media)
        targets = [r.attrib['Target'] for r in rels.findall(R+'Relationship') if r.attrib.get('Type','').endswith('/image')]
        assert len(targets) == pages
        for target in targets:
            from posixpath import normpath
            assert normpath('word/'+target.lstrip('/')) in names
        assert len(doc.findall('.//'+W+'tbl')) == tables
        breaks = [b for b in doc.iter(W+'br') if b.attrib.get(W+'type') == 'page']
        assert len(breaks) == pages-1, (name,len(breaks))
        text = ''.join(t.text or '' for t in doc.iter(W+'t'))
        pos = -1
        for s in contains:
            pos = text.find(s, pos+1)
            assert pos >= 0, (name,s,text[:500])
        return doc, text

mixed, text = check('accept-mixed.docx',2,['FIRST EDIT','FAKE PAGE','<&> 😀','SECOND EDIT','HELLO WORLD'])
assert '\f' not in text
check('accept-ind.docx',1,['SELAMAT PAGI INDONESIA','TERIMA KASIH BANYAK'])
check('accept-forced.docx',1,['FIRST DIGITAL PAGE'])
check('accept-scanned-table.docx',1,['ALPHA'],0)
check('accept-replacement.docx',1,['FIRST DIGITAL PAGE'])
doc,_ = check('accept-digital-table.docx',1,['BEFORE','Name','Amount','EDITED','10','Beta','20','AFTER'],1)
cells = [''.join(t.text or '' for t in c.iter(W+'t')) for c in doc.iter(W+'tc')]
assert cells == ['Name','Amount','EDITED','10','Beta','20'], cells
print('PASS 6 DOCX ZIP/XML files: text order, page breaks, tables, media relationships')
