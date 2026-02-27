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


def main() -> None:
    data = json.loads(WIKIDATA_JSON.read_text(encoding='utf-8'))
    search_cache = load_search_cache()

    resolved = 0
    ambiguous = 0

    for entry in data:
        if entry.get('qNumber') is None and not entry.get('qNumbers'):
            name = entry.get('name', '')
            if name in search_cache:
                qids = search_cache[name]
            else:
                qids = search_qids(name)
                search_cache[name] = qids
            if len(qids) == 1:
                entry['qNumber'] = qids[0]
                resolved += 1
            elif len(qids) > 1:
                entry['qNumbers'] = qids
                ambiguous += 1
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
