#!/usr/bin/env python3
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from urllib.error import HTTPError, URLError
from pathlib import Path
from typing import Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
WIKIDATA_JSON = ROOT / 'wikidata.json'
CACHE_DIR = ROOT / '.cache'
SEARCH_CACHE_PATH = CACHE_DIR / 'wikidata_search_cache.json'

API_URL = 'https://www.wikidata.org/w/api.php'
LANGS = ['de', 'it', 'fr', 'en']
BATCH_SIZE = 50
USER_AGENT = 'ptt-kurskarten-wikidata-enricher/1.0 (local script)'

# High-signal place classes used for disambiguation.
PLACE_P31_IDS = {
    'Q486972',   # human settlement
    'Q56061',    # administrative territorial entity
    'Q515',      # city
    'Q3957',     # town
    'Q532',      # village
    'Q15284',    # municipality
    'Q747074',   # Italian comune
    'Q70208',    # municipality of Switzerland
}

# Common non-place classes that often collide with toponyms.
NON_PLACE_P31_IDS = {
    'Q101352',   # family name
    'Q202444',   # given name
    'Q3305213',  # painting
    'Q4167410',  # disambiguation page
    'Q13406463', # Wikimedia list article
    'Q11266439', # Wikimedia template
}

_ENTITY_META_CACHE: Dict[str, Dict[str, object]] = {}


def normalize(text: str) -> str:
    text = unicodedata.normalize('NFKD', text)
    text = ''.join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold()
    text = re.sub(r"[^\w\s]", ' ', text)
    text = re.sub(r"\s+", ' ', text).strip()
    return text


def api_get(params: Dict[str, str]) -> Dict:
    query = urllib.parse.urlencode(params)
    url = f"{API_URL}?{query}"
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    attempts = 8
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except HTTPError as err:
            if err.code in (429, 500, 502, 503, 504):
                retry_after = err.headers.get('Retry-After') if err.headers else None
                wait = float(retry_after) if retry_after and retry_after.isdigit() else 1.5 * (attempt + 1)
                if attempt < attempts - 1:
                    time.sleep(wait)
                    continue
            raise
        except (URLError, TimeoutError):
            if attempt == attempts - 1:
                raise
            time.sleep(1.0 * (attempt + 1))
    return {}


def search_qids(name: str, limit: int = 10) -> List[str]:
    wanted = normalize(name)
    candidates: Dict[str, int] = {}

    for lang in LANGS:
        data = api_get(
            {
                'action': 'wbsearchentities',
                'format': 'json',
                'type': 'item',
                'language': lang,
                'search': name,
                'limit': str(limit),
            }
        )

        for item in data.get('search', []):
            qid = item.get('id')
            if not qid or not qid.startswith('Q'):
                continue

            label = item.get('label') or ''
            match_text = (item.get('match') or {}).get('text') or ''
            desc = (item.get('description') or '').casefold()

            score = 0
            if normalize(label) == wanted:
                score += 100
            if match_text and normalize(match_text) == wanted:
                score += 120
            if any(word in desc for word in ['gemeinde', 'municipality', 'commune', 'frazione', 'village', 'town']):
                score += 10

            if score > 0:
                candidates[qid] = max(candidates.get(qid, 0), score)

        time.sleep(0.03)

    if not candidates:
        return []

    place_qids = set(filter_place_qids(list(candidates.keys())))
    if place_qids:
        # Strongly prefer geographical entities when available.
        for qid in place_qids:
            candidates[qid] += 200

    ranked = sorted(candidates.items(), key=lambda kv: kv[1], reverse=True)
    top_score = ranked[0][1]
    return sorted([qid for qid, score in ranked if score == top_score])


def load_search_cache() -> Dict[str, List[str]]:
    if SEARCH_CACHE_PATH.exists():
        try:
            return json.loads(SEARCH_CACHE_PATH.read_text(encoding='utf-8'))
        except Exception:
            return {}
    return {}


def save_search_cache(cache: Dict[str, List[str]]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    SEARCH_CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def fetch_labels(qids: List[str]) -> Dict[str, Dict[str, Optional[str]]]:
    out: Dict[str, Dict[str, Optional[str]]] = {}
    for i in range(0, len(qids), BATCH_SIZE):
        batch = qids[i : i + BATCH_SIZE]
        data = api_get(
            {
                'action': 'wbgetentities',
                'format': 'json',
                'ids': '|'.join(batch),
                'props': 'labels',
                'languages': '|'.join(LANGS),
            }
        )
        entities = data.get('entities', {})
        for qid in batch:
            ent = entities.get(qid, {})
            labels = ent.get('labels', {})
            out[qid] = {lang: (labels.get(lang) or {}).get('value') for lang in LANGS}
        time.sleep(0.03)
    return out


def fetch_entity_metadata(qids: List[str]) -> Dict[str, Dict[str, object]]:
    out: Dict[str, Dict[str, object]] = {}
    missing = [qid for qid in qids if qid not in _ENTITY_META_CACHE]

    for i in range(0, len(missing), BATCH_SIZE):
        batch = missing[i : i + BATCH_SIZE]
        data = api_get(
            {
                'action': 'wbgetentities',
                'format': 'json',
                'ids': '|'.join(batch),
                'props': 'claims',
            }
        )
        entities = data.get('entities', {})
        for qid in batch:
            claims = (entities.get(qid) or {}).get('claims') or {}
            p31_ids = _claim_entity_ids(claims.get('P31') or [])
            _ENTITY_META_CACHE[qid] = {
                'p31': p31_ids,
                'has_p17': bool(claims.get('P17')),
                'has_p131': bool(claims.get('P131')),
                'has_p625': bool(claims.get('P625')),
            }
        time.sleep(0.03)

    for qid in qids:
        if qid in _ENTITY_META_CACHE:
            out[qid] = _ENTITY_META_CACHE[qid]
    return out


def _claim_entity_ids(claims: List[Dict]) -> List[str]:
    ids: List[str] = []
    for claim in claims:
        value = ((claim.get('mainsnak') or {}).get('datavalue') or {}).get('value') or {}
        qid = value.get('id')
        if isinstance(qid, str) and qid.startswith('Q'):
            ids.append(qid)
    return ids


def is_place_entity(meta: Dict[str, object]) -> bool:
    p31_ids = set(meta.get('p31') or [])
    has_place_claims = bool(meta.get('has_p17') or meta.get('has_p131') or meta.get('has_p625'))

    if p31_ids & PLACE_P31_IDS:
        return True
    if p31_ids & NON_PLACE_P31_IDS:
        return False
    return has_place_claims


def filter_place_qids(qids: List[str]) -> List[str]:
    if not qids:
        return []
    meta = fetch_entity_metadata(qids)
    return [qid for qid in qids if is_place_entity(meta.get(qid, {}))]


def main() -> None:
    data = json.loads(WIKIDATA_JSON.read_text(encoding='utf-8'))
    search_cache = load_search_cache()

    resolved = 0
    ambiguous = 0

    for entry in data:
        if entry.get('qNumber'):
            continue

        name = entry.get('name', '')

        # Re-evaluate existing ambiguous matches and keep only place entities.
        existing_qids = [q for q in (entry.get('qNumbers') or []) if isinstance(q, str) and q.startswith('Q')]
        qids = filter_place_qids(existing_qids)

        # If nothing valid remains, perform (or refresh) search.
        if not qids:
            cached = search_cache.get(name)
            if isinstance(cached, list):
                qids = filter_place_qids([q for q in cached if isinstance(q, str)])
            if not qids:
                qids = search_qids(name)
            search_cache[name] = qids

        if len(qids) == 1:
            entry['qNumber'] = qids[0]
            entry['qNumbers'] = []
            resolved += 1
        elif len(qids) > 1:
            entry['qNumbers'] = qids
            ambiguous += 1
        else:
            entry['qNumbers'] = []
    save_search_cache(search_cache)

    all_qids = sorted(
        {
            q
            for entry in data
            for q in ([entry.get('qNumber')] if entry.get('qNumber') else []) + (entry.get('qNumbers') or [])
            if q
        }
    )

    label_map = fetch_labels(all_qids)

    for entry in data:
        qnumber = entry.get('qNumber')
        qnumbers = entry.get('qNumbers') or []

        if qnumber:
            entry['translations'] = label_map.get(qnumber, entry.get('translations'))
        else:
            entry['translations'] = entry.get('translations')
        if qnumbers:
            existing = entry.get('translationsByQNumber') or {}
            entry['translationsByQNumber'] = {
                q: label_map.get(q, existing.get(q, {lang: None for lang in LANGS})) for q in qnumbers
            }
        else:
            entry['translationsByQNumber'] = entry.get('translationsByQNumber') or {}

    WIKIDATA_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    single = sum(1 for e in data if e.get('qNumber'))
    no_match = sum(1 for e in data if e.get('qNumber') is None and not (e.get('qNumbers') or []))
    multi = sum(1 for e in data if len(e.get('qNumbers') or []) > 0)

    print(f'resolved_new={resolved} ambiguous_new={ambiguous}')
    print(f'total_single={single} total_ambiguous={multi} total_unmatched={no_match}')


if __name__ == '__main__':
    main()
