import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel max for hobby plan

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const GEO_CACHE_TTL_MS = 1000 * 60 * 60 * 24;
const geoCache = new Map();
const authorGeoCache = new Map();
const wikidataAuthorCache = new Map();
const OPEN_LIBRARY_FIELDS = [
    'key',
    'title',
    'subtitle',
    'author_name',
    'author_key',
    'cover_i',
    'subject_places',
    'publish_country',
    'edition_count',
    'first_publish_year'
].join(',');
const OPEN_LIBRARY_LIMIT = 5;
const GOOGLE_BOOKS_LIMIT = 5;
const OPEN_LIBRARY_CONFIDENT_SCORE = 72;
const GOOGLE_BOOKS_CONFIDENT_SCORE = 72;
const MIN_MATCH_SCORE = 38;
const WIKIDATA_SEARCH_LIMIT = 5;
const SEARCH_TIMEOUT_MS = 3500;
const ENTITY_TIMEOUT_MS = 3000;
const GEOCODE_TIMEOUT_MS = 2200;
const COVER_TIMEOUT_MS = 4500;
const COVER_SEARCH_TIMEOUT_MS = 6000;
const LOCAL_BOOK_HINTS = [
    { title: 'Pride and Prejudice', author: 'Jane Austen', country: 'United Kingdom', aliases: ['傲慢与偏见'], coverRef: 13148521, coverSource: 'openlibrary' },
    { title: 'Blindness', author: 'Jose Saramago', country: 'Portugal', aliases: ['失明症漫记'], coverRef: 'https://books.google.com/books/content?id=9ab5g1_ghuQC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api', coverSource: 'url' },
    { title: 'The Name of the Rose', author: 'Umberto Eco', country: 'Italy', aliases: ['玫瑰之名'], coverRef: 'https://books.google.com/books/content?id=ChlOAwAAQBAJ&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api', coverSource: 'google' },
    { title: 'Things Fall Apart', author: 'Chinua Achebe', country: 'Nigeria', aliases: ['瓦解'], coverRef: 'https://books.google.com/books/content?id=yz0GAQAAIAAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api', coverSource: 'google' },
    { title: 'Le Petit Prince', author: 'Antoine de Saint-Exupery', country: 'France', aliases: ['Le petit prince', 'The Little Prince', '小王子'], coverRef: 966008, coverSource: 'openlibrary' },
    { title: '一句顶一万句', author: '刘震云', country: '中国', aliases: ['Someone to Talk To'] },
    { title: '流俗地', author: '黎紫书', country: 'Malaysia' },
    { title: '三体', author: '刘慈欣', country: '中国', aliases: ['The Three-Body Problem'], coverRef: 'https://books.google.com/books/content?id=QxbFBAAAQBAJ&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api', coverSource: 'google' },
    { title: '百年孤独', author: '加夫列尔·加西亚·马尔克斯', country: 'Colombia', aliases: ['One Hundred Years of Solitude'], coverRef: 15093420, coverSource: 'openlibrary' },
    { title: 'Season of Migration to the North', author: 'Tayeb Salih', country: 'Sudan', coverRef: 'https://books.google.com/books/content?id=_hZjaWrQtmcC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api', coverSource: 'google' },
    { title: 'The House of the Spirits', author: 'Isabel Allende', country: 'Chile', coverRef: 'https://books.google.com/books/content?id=EbypCgAAQBAJ&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api', coverSource: 'google' },
    { title: 'The God of Small Things', author: 'Arundhati Roy', country: 'India', coverRef: 'https://books.google.com/books/content?id=nwICBETtEqYC&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api', coverSource: 'google' },
    { title: 'The Master and Margarita', author: 'Mikhail Bulgakov', country: 'Russia', coverRef: 'https://books.google.com/books/content?id=ZJ38DwAAQBAJ&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api', coverSource: 'google' },
    { title: 'Animal Farm', author: 'George Orwell', country: 'United Kingdom', aliases: ['动物农场', '动物农场（李继宏导读注释版）'], coverRef: 'https://books.google.com/books/content?id=UKvYEAAAQBAJ&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api', coverSource: 'google' },
];
const COUNTRY_NAME_ALIASES = {
    'united states': 'US',
    'united states of america': 'US',
    usa: 'US',
    us: 'US',
    '中国': 'CN',
    china: 'CN',
    "people's republic of china": 'CN',
    '法国': 'FR',
    france: 'FR',
    '英国': 'GB',
    'united kingdom': 'GB',
    'united kingdom of great britain and ireland': 'GB',
    uk: 'GB',
    britain: 'GB',
    england: 'GB',
    '葡萄牙': 'PT',
    '意大利': 'IT',
    '尼日利亚': 'NG',
    '马来西亚': 'MY',
    '哥伦比亚': 'CO',
    '俄罗斯': 'RU',
    '印度': 'IN',
    '智利': 'CL',
    '苏丹': 'SD',
    'south korea': 'KR',
    korea: 'KR',
    'north korea': 'KP',
    russia: 'RU',
    iran: 'IR',
    syria: 'SY',
    vietnam: 'VN',
    laos: 'LA',
    bolivia: 'BO',
    venezuela: 'VE',
    tanzania: 'TZ',
    moldova: 'MD',
    taiwan: 'TW',
    'czech republic': 'CZ',
};
let localCountryIndex = null;

function normalizeCountryLookupValue(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[().]/g, ' ')
        .replace(/\s+/g, ' ');
}

function getGeometryCenter(geometry) {
    const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.coordinates || [];
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    polygons.forEach(poly => {
        poly.forEach(ring => {
            ring.forEach(([lon, lat]) => {
                if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
                minLon = Math.min(minLon, lon);
                maxLon = Math.max(maxLon, lon);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            });
        });
    });

    if (![minLon, maxLon, minLat, maxLat].every(Number.isFinite)) {
        return { lat: 0, lon: 0 };
    }

    return {
        lat: (minLat + maxLat) / 2,
        lon: (minLon + maxLon) / 2,
    };
}

function ensureLocalCountryIndex() {
    if (localCountryIndex) return localCountryIndex;

    const geojsonPath = path.join(process.cwd(), 'public', 'countries.geojson');
    const data = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
    const byCode = new Map();
    const byName = new Map(Object.entries(COUNTRY_NAME_ALIASES));

    data.features.forEach((feature) => {
        const props = feature.properties || {};
        const isoCandidates = [
            props.ISO_A2,
            props.iso_a2,
            props.ISO_A2_EH,
            props.iso_a2_eh,
        ]
            .map(value => String(value || '').toUpperCase())
            .filter(value => value && value !== '-99');
        const isoA2 = isoCandidates[0] || '';
        if (!isoA2 || isoA2 === '-99') return;

        const center = Number.isFinite(Number(props.LABEL_Y)) && Number.isFinite(Number(props.LABEL_X))
            ? { lat: Number(props.LABEL_Y), lon: Number(props.LABEL_X) }
            : getGeometryCenter(feature.geometry);
        const country = {
            code: isoA2,
            country: normalizeCountryLabel(props.NAME_EN || props.NAME || props.ADMIN || isoA2),
            lat: center.lat,
            lon: center.lon,
        };
        byCode.set(isoA2, country);

        const primaryNames = [
            props.ADMIN,
            props.NAME,
            props.NAME_LONG,
            props.NAME_EN,
            props.NAME_ZH,
            props.NAME_ZHT,
            props.FORMAL_EN,
            props.BRK_NAME,
            props.GEOUNIT,
        ];
        const secondaryNames = [
            props.SOVEREIGNT,
            props.ABBREV,
        ];

        primaryNames.forEach((name) => {
            const normalizedName = normalizeCountryLookupValue(name);
            if (normalizedName) byName.set(normalizedName, isoA2);
        });

        secondaryNames.forEach((name) => {
            const normalizedName = normalizeCountryLookupValue(name);
            if (normalizedName && !byName.has(normalizedName)) {
                byName.set(normalizedName, isoA2);
            }
        });
    });

    localCountryIndex = { byCode, byName };
    return localCountryIndex;
}

function resolveLocalCountryMeta(hint) {
    const normalizedHint = normalizeInputText(hint);
    if (!normalizedHint) return null;

    const { byCode, byName } = ensureLocalCountryIndex();
    const directCode = normalizedHint.toUpperCase();
    const isoCode = byCode.has(directCode)
        ? directCode
        : byName.get(normalizeCountryLookupValue(normalizedHint));

    if (!isoCode) return null;

    return byCode.get(isoCode) || null;
}

// ==========================================
// 工具：通过 Nominatim 地理编码（含 sleep 防封禁队列）
// ==========================================
async function geocode(locationName, retries = 2) {
    if (!locationName) return null;
    const cacheKey = locationName.trim().toLowerCase();
    const localCountryMeta = resolveLocalCountryMeta(locationName);
    if (localCountryMeta) {
        const localResult = {
            lat: localCountryMeta.lat,
            lon: localCountryMeta.lon,
            countryCode: localCountryMeta.code,
            displayName: localCountryMeta.country,
        };
        geoCache.set(cacheKey, { value: localResult, ts: Date.now() });
        return localResult;
    }

    const cached = geoCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GEO_CACHE_TTL_MS) {
        return cached.value;
    }

    for (let i = 0; i < retries; i++) {
        try {
            // Nominatim 严格限速，保持单线程 + 间隔请求
            await sleep(400);
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=jsonv2&limit=1&addressdetails=1`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
            const res = await fetch(url, {
                headers: { 'User-Agent': 'ReadingOdyssey/1.1 (github.com/yancey/reading-odyssey)' },
                signal: controller.signal,
            }).finally(() => clearTimeout(timeoutId));
            
            if (res.status === 429) {
                console.warn('>>> [GEO] 429 Rate Limited. Sleeping 5s...');
                await sleep(5000);
                continue;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            if (data && data[0]) {
                const item = data[0];
                const result = {
                    lat: parseFloat(item.lat),
                    lon: parseFloat(item.lon),
                    countryCode: (item.address?.country_code || '').toUpperCase(),
                    displayName: item.display_name,
                };
                geoCache.set(cacheKey, { value: result, ts: Date.now() });
                return result;
            }
        } catch (e) {
            console.warn(`>>> [GEO] Error for "${locationName}" (retry ${i+1}):`, e.message);
        }
    }

    geoCache.set(cacheKey, { value: null, ts: Date.now() });
    return null;
}

// ==========================================
// 工具：查询规范化与打分
// ==========================================
function normalizeInputText(input) {
    return String(input || '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripBookQuotes(text) {
    return text
        .replace(/[《〈「『【]/g, '')
        .replace(/[》〉」』】]/g, '')
        .trim();
}

function stripFieldLabel(value, patterns) {
    let normalized = normalizeInputText(value);
    for (const pattern of patterns) {
        normalized = normalized.replace(pattern, '');
    }
    return normalizeInputText(normalized);
}

function cleanAuthorHint(value) {
    return stripFieldLabel(value, [/^(?:作者|author|by)[:：]?\s*/i]);
}

function cleanCountryHint(value) {
    return stripFieldLabel(value, [/^(?:国(?:度|家|别)|country|nation|location|place|地区|地点)[:：]?\s*/i]);
}

function normalizeCountryLabel(value) {
    const normalized = normalizeInputText(String(value || '').replace(/^\((.+)\)$/, '$1'));
    if (!normalized) return '';
    const slashParts = normalized.split(/\s*\/\s*/).filter(Boolean);
    return slashParts[slashParts.length - 1] || normalized;
}

function splitStructuredHints(input) {
    const normalized = normalizeInputText(input);
    if (!normalized) return null;

    const slashParts = normalized
        .split(/\s+(?:\/|／|\||｜)\s+/)
        .map(part => stripBookQuotes(part))
        .map(part => normalizeInputText(part))
        .filter(Boolean);

    if (slashParts.length < 2) return null;

    const [titleHint, authorPart, ...countryParts] = slashParts;
    return {
        titleHint,
        authorHint: cleanAuthorHint(authorPart),
        countryHint: cleanCountryHint(countryParts.join(' / ')),
    };
}

function normalizeCompareText(input) {
    return stripBookQuotes(normalizeInputText(input))
        .toLowerCase()
        .replace(/[\s.,/#!$%^&*;:{}=\-_`~()'"“”‘’·•:：，。！？、+|\\[\]]+/g, '');
}

function containsCJK(input) {
    return /[\u3400-\u9FFF]/.test(input || '');
}

function parseQueryInfo(input) {
    if (input && typeof input === 'object') {
        const title = normalizeInputText(input.title || input.query || '');
        const author = cleanAuthorHint(input.author || '');
        const country = cleanCountryHint(input.country || '');
        const raw = [title, author, country].filter(Boolean).join(' / ');

        return {
            raw,
            cleaned: title || raw,
            isbn: '',
            titleHint: title,
            authorHint: author,
            countryHint: country,
            compareTitle: normalizeCompareText(title || raw),
            compareAuthor: normalizeCompareText(author),
            compareCountry: normalizeCompareText(country),
            prefersChinese: containsCJK(title || raw),
        };
    }

    const cleaned = normalizeInputText(input);
    const isbnMatch = cleaned.match(/(?:isbn(?:-1[03])?[/:=\s-]*)?([0-9Xx-]{10,17})/i);
    const isbn = isbnMatch?.[1]?.replace(/-/g, '').toUpperCase() || '';
    const unwrapped = stripBookQuotes(cleaned);

    let titleHint = unwrapped;
    let authorHint = '';
    let countryHint = '';

    const structuredHints = splitStructuredHints(unwrapped);
    if (structuredHints) {
        titleHint = structuredHints.titleHint || titleHint;
        authorHint = structuredHints.authorHint || '';
        countryHint = structuredHints.countryHint || '';
    } else {
        const explicitAuthorMatch = unwrapped.match(/^(.*?)\s*(?: by | 作者[:：]?|——|--|-)\s*(.+)$/i);
        if (explicitAuthorMatch) {
            titleHint = stripBookQuotes(explicitAuthorMatch[1]);
            authorHint = cleanAuthorHint(explicitAuthorMatch[2]);
        }
    }

    return {
        raw: String(input || ''),
        cleaned,
        isbn,
        titleHint,
        authorHint,
        countryHint,
        compareTitle: normalizeCompareText(titleHint || cleaned),
        compareAuthor: normalizeCompareText(authorHint),
        compareCountry: normalizeCompareText(countryHint),
        prefersChinese: containsCJK(titleHint || cleaned),
    };
}

function tokenScore(left, right) {
    if (!left || !right) return 0;
    const leftTokens = normalizeInputText(left).toLowerCase().split(/\s+/).filter(Boolean);
    const rightTokens = normalizeInputText(right).toLowerCase().split(/\s+/).filter(Boolean);
    if (!leftTokens.length || !rightTokens.length) return 0;
    const rightSet = new Set(rightTokens);
    const overlap = leftTokens.filter(token => rightSet.has(token)).length;
    return (overlap / leftTokens.length) * 24;
}

function cjkCharacterOverlapScore(left, right, maxScore = 70) {
    const leftChars = [...normalizeInputText(left)].filter(char => containsCJK(char));
    const rightChars = [...normalizeInputText(right)].filter(char => containsCJK(char));
    if (!leftChars.length || !rightChars.length) return 0;

    const rightSet = new Set(rightChars);
    const overlap = leftChars.filter(char => rightSet.has(char)).length;
    return (overlap / leftChars.length) * maxScore;
}

function resolveLocalBookHint(queryInfo) {
    const titleNorm = normalizeCompareText(queryInfo?.titleHint || queryInfo?.cleaned || '');
    if (!titleNorm) return null;

    const matched = LOCAL_BOOK_HINTS.find((entry) => {
        const labels = [entry.title, ...(entry.aliases || [])];
        return labels.some(label => normalizeCompareText(label) === titleNorm);
    });

    if (!matched) return null;

    return {
        source: 'local_seed',
        key: `local_seed_${normalizeCompareText(matched.title).slice(0, 24)}`,
        title: matched.title,
        subtitle: '',
        author: matched.author || '',
        authorKey: '',
        coverRef: matched.coverRef || null,
        coverSource: matched.coverSource || null,
        isbn: '',
        geoQuery: matched.country || null,
        subjectPlaceHint: matched.country || null,
        firstPublishYear: matched.firstPublishYear || null,
        raw: matched,
    };
}

function mergeLocalSeedIntoCandidate(candidate, localSeedCandidate) {
    if (!candidate || !localSeedCandidate) return candidate;

    return {
        ...candidate,
        author: candidate.author || localSeedCandidate.author || '',
        coverRef: candidate.coverRef || localSeedCandidate.coverRef || null,
        coverSource: candidate.coverSource || localSeedCandidate.coverSource || null,
        geoQuery: candidate.geoQuery || localSeedCandidate.geoQuery || null,
        subjectPlaceHint: candidate.subjectPlaceHint || localSeedCandidate.subjectPlaceHint || null,
        firstPublishYear: candidate.firstPublishYear || localSeedCandidate.firstPublishYear || null,
        localSeed: localSeedCandidate.raw || null,
    };
}

function scoreCandidate(candidate, queryInfo) {
    const titleNorm = normalizeCompareText(candidate.title);
    const subtitleNorm = normalizeCompareText(candidate.subtitle);
    const authorNorm = normalizeCompareText(candidate.author);
    const geoNorm = normalizeCompareText(candidate.geoQuery);
    const compareTitle = queryInfo.compareTitle;

    if (!titleNorm) return -Infinity;

    let score = 0;

    if (queryInfo.isbn && candidate.isbn === queryInfo.isbn) {
        score += 200;
    }

    if (titleNorm === compareTitle) {
        score += 120;
    } else if (titleNorm.includes(compareTitle) || compareTitle.includes(titleNorm)) {
        score += 90;
    } else if (subtitleNorm && (subtitleNorm.includes(compareTitle) || compareTitle.includes(subtitleNorm))) {
        score += 54;
    } else {
        score += tokenScore(queryInfo.titleHint || queryInfo.cleaned, candidate.title);
    }

    if (queryInfo.compareAuthor && authorNorm) {
        if (authorNorm === queryInfo.compareAuthor) {
            score += 40;
        } else if (authorNorm.includes(queryInfo.compareAuthor) || queryInfo.compareAuthor.includes(authorNorm)) {
            score += 28;
        } else {
            score += tokenScore(queryInfo.authorHint, candidate.author);
        }
    }

    if (queryInfo.compareCountry && geoNorm) {
        if (geoNorm === queryInfo.compareCountry) {
            score += 20;
        } else if (geoNorm.includes(queryInfo.compareCountry) || queryInfo.compareCountry.includes(geoNorm)) {
            score += 12;
        }
    }

    if (queryInfo.prefersChinese && containsCJK(candidate.title || candidate.subtitle)) {
        score += 10;
    }
    if (candidate.source === 'google') score += 8;
    if (candidate.source === 'openlibrary') score += 4;
    if (candidate.source === 'wikidata_book') score += 6;
    if (candidate.source === 'local_seed') score += 18;
    if (candidate.coverRef) score += 4;
    if (candidate.firstPublishYear) score += 2;

    return score;
}

function pickBestCandidate(candidates, queryInfo) {
    if (!candidates.length) return null;
    const ranked = candidates
        .map(candidate => ({ ...candidate, score: scoreCandidate(candidate, queryInfo) }))
        .sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= MIN_MATCH_SCORE ? ranked[0] : null;
}

function dedupeCandidates(candidates) {
    const seen = new Set();
    return candidates.filter(candidate => {
        const key = [
            candidate.source,
            normalizeCompareText(candidate.title),
            normalizeCompareText(candidate.author),
            candidate.coverRef || ''
        ].join('::');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function pickBestCoverCandidate(candidates, queryInfo) {
    const withCover = candidates.filter(candidate => candidate?.coverRef);
    if (!withCover.length) return null;
    return pickBestCandidate(withCover, queryInfo) || withCover[0] || null;
}

async function fetchJson(url, label, timeoutOverride) {
    const timeoutMs = timeoutOverride || (/Wikidata|Wikipedia/i.test(label || '') ? ENTITY_TIMEOUT_MS : SEARCH_TIMEOUT_MS);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
        headers: label ? { 'User-Agent': `ReadingOdyssey/1.1 (${label})` } : undefined,
        signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
    if (!res.ok) throw new Error(`${label || '请求'}失败: HTTP ${res.status}`);
    return res.json();
}

function normalizeOpenLibraryDoc(doc, queryInfo) {
    const subjectPlaceHint = Array.isArray(doc.subject_places) ? doc.subject_places[0] : doc.subject_places || null;
    return {
        source: 'openlibrary',
        key: doc.key || '',
        title: doc.title || '',
        subtitle: doc.subtitle || '',
        author: Array.isArray(doc.author_name) ? doc.author_name[0] : doc.author_name || '',
        authorKey: Array.isArray(doc.author_key) ? doc.author_key[0] : doc.author_key || '',
        coverRef: doc.cover_i || null,
        isbn: queryInfo?.isbn || '',
        geoQuery: subjectPlaceHint,
        subjectPlaceHint,
        firstPublishYear: doc.first_publish_year || null,
        raw: doc,
    };
}

async function searchOpenLibraryCandidates(queryInfo, options = {}) {
    const urls = [];

    if (queryInfo.isbn) {
        urls.push(`https://openlibrary.org/search.json?isbn=${encodeURIComponent(queryInfo.isbn)}&fields=${encodeURIComponent(OPEN_LIBRARY_FIELDS)}&limit=${OPEN_LIBRARY_LIMIT}`);
    } else {
        const title = queryInfo.titleHint || queryInfo.cleaned;
        if (title) {
            urls.push(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&fields=${encodeURIComponent(OPEN_LIBRARY_FIELDS)}&limit=${OPEN_LIBRARY_LIMIT}`);
            if (queryInfo.prefersChinese) {
                urls.push(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&lang=zh&fields=${encodeURIComponent(OPEN_LIBRARY_FIELDS)}&limit=${OPEN_LIBRARY_LIMIT}`);
            }
        }
        if (title && queryInfo.authorHint) {
            urls.push(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(queryInfo.authorHint)}&fields=${encodeURIComponent(OPEN_LIBRARY_FIELDS)}&limit=${OPEN_LIBRARY_LIMIT}`);
        }
        urls.push(`https://openlibrary.org/search.json?q=${encodeURIComponent(queryInfo.cleaned)}&fields=${encodeURIComponent(OPEN_LIBRARY_FIELDS)}&limit=${OPEN_LIBRARY_LIMIT}`);
        if (queryInfo.prefersChinese) {
            urls.push(`https://openlibrary.org/search.json?q=${encodeURIComponent(title || queryInfo.cleaned)}&lang=zh&fields=${encodeURIComponent(OPEN_LIBRARY_FIELDS)}&limit=${OPEN_LIBRARY_LIMIT}`);
        }
    }

    const uniqueUrls = [...new Set(urls)];
    const settled = await Promise.allSettled(uniqueUrls.map(url => fetchJson(url, 'OpenLibrary', options.timeoutMs)));
    const docs = settled.flatMap(result => (result.status === 'fulfilled' ? result.value.docs || [] : []));
    return dedupeCandidates(docs.map(doc => normalizeOpenLibraryDoc(doc, queryInfo)));
}

function normalizeGoogleVolume(item, queryInfo) {
    const info = item.volumeInfo || {};
    const identifiers = info.industryIdentifiers || [];
    let coverUrl = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
    if (coverUrl?.startsWith('http://')) {
        coverUrl = `https://${coverUrl.slice(7)}`;
    }

    return {
        source: 'google',
        key: item.id || '',
        title: info.title || '',
        subtitle: info.subtitle || '',
        author: Array.isArray(info.authors) ? info.authors[0] : '',
        authorKey: '',
        coverRef: coverUrl,
        isbn: identifiers.find(id => id.type?.includes('ISBN'))?.identifier?.replace(/-/g, '').toUpperCase() || queryInfo.isbn || '',
        geoQuery: null,
        firstPublishYear: Number.parseInt(String(info.publishedDate || '').slice(0, 4), 10) || null,
        raw: item,
    };
}

async function searchGoogleBooksCandidates(queryInfo, options = {}) {
    const googleBooksApiKey = normalizeInputText(process.env.GOOGLE_BOOKS_API_KEY);
    const buildGoogleUrl = (query, extraParams = {}) => {
        const params = new URLSearchParams({
            q: query,
            maxResults: String(GOOGLE_BOOKS_LIMIT),
            printType: 'books',
        });
        Object.entries(extraParams).forEach(([key, value]) => {
            if (value) params.set(key, value);
        });
        if (googleBooksApiKey) {
            params.set('key', googleBooksApiKey);
        }
        return `https://www.googleapis.com/books/v1/volumes?${params.toString()}`;
    };

    const urls = [];

    if (queryInfo.isbn) {
        urls.push(buildGoogleUrl(`isbn:${queryInfo.isbn}`));
    } else {
        const title = queryInfo.titleHint || queryInfo.cleaned;
        if (title && queryInfo.authorHint) {
            urls.push(buildGoogleUrl(`intitle:${title} inauthor:${queryInfo.authorHint}`));
        }
        if (title) {
            urls.push(buildGoogleUrl(`intitle:${title}`));
        }
        urls.push(buildGoogleUrl(queryInfo.cleaned));
        if (queryInfo.prefersChinese) {
            urls.push(buildGoogleUrl(title || queryInfo.cleaned, { langRestrict: 'zh' }));
        }
    }

    const uniqueUrls = [...new Set(urls)];
    const settled = await Promise.allSettled(uniqueUrls.map(url => fetchJson(url, 'GoogleBooks', options.timeoutMs)));
    const items = settled.flatMap(result => (result.status === 'fulfilled' ? result.value.items || [] : []));
    return dedupeCandidates(items.map(item => normalizeGoogleVolume(item, queryInfo)));
}

async function resolveBookMatch(query) {
    const queryInfo = typeof query === 'string' || !query ? parseQueryInfo(query) : query;
    const localSeedCandidate = !queryInfo.isbn ? resolveLocalBookHint(queryInfo) : null;

    const [googleCandidates, openLibraryCandidates, wikidataBookCandidate] = await Promise.all([
        searchGoogleBooksCandidates(queryInfo),
        searchOpenLibraryCandidates(queryInfo),
        !queryInfo.isbn ? fetchWikidataBookCandidate(queryInfo) : Promise.resolve(null),
    ]);
    const googleBest = pickBestCandidate(googleCandidates, queryInfo);
    const openLibraryBest = pickBestCandidate(openLibraryCandidates, queryInfo);
    const wikidataCandidates = wikidataBookCandidate ? [wikidataBookCandidate] : [];

    if (googleBest && googleBest.score >= GOOGLE_BOOKS_CONFIDENT_SCORE) {
        if (googleBest.title) {
            const enrichQuery = parseQueryInfo(googleBest.author ? `${googleBest.title} / ${googleBest.author}` : googleBest.title);
            const enrichCandidates = await searchOpenLibraryCandidates(enrichQuery);
            const enrichBest = pickBestCandidate(enrichCandidates, enrichQuery);
            if (enrichBest && enrichBest.score >= OPEN_LIBRARY_CONFIDENT_SCORE) {
                return mergeLocalSeedIntoCandidate({
                    ...googleBest,
                    subjectPlaceHint: enrichBest.subjectPlaceHint || googleBest.subjectPlaceHint || null,
                    geoQuery: enrichBest.geoQuery || googleBest.geoQuery,
                    authorKey: enrichBest.authorKey || googleBest.authorKey,
                    coverRef: googleBest.coverRef || enrichBest.coverRef,
                }, localSeedCandidate);
            }
        }
        return mergeLocalSeedIntoCandidate(googleBest, localSeedCandidate);
    }

    if (openLibraryBest && openLibraryBest.score >= OPEN_LIBRARY_CONFIDENT_SCORE) {
        return mergeLocalSeedIntoCandidate(openLibraryBest, localSeedCandidate);
    }

    const mergedCandidates = dedupeCandidates([
        ...(localSeedCandidate ? [localSeedCandidate] : []),
        ...googleCandidates,
        ...openLibraryCandidates,
        ...wikidataCandidates,
    ]);

    const best = pickBestCandidate(mergedCandidates, queryInfo);
    if (!best) return null;

    if (best.source === 'google' && best.title) {
        const enrichQuery = parseQueryInfo(best.author ? `${best.title} / ${best.author}` : best.title);
        const enrichCandidates = await searchOpenLibraryCandidates(enrichQuery);
        const enrichBest = pickBestCandidate(enrichCandidates, enrichQuery);
        if (enrichBest && enrichBest.score >= OPEN_LIBRARY_CONFIDENT_SCORE) {
            return mergeLocalSeedIntoCandidate({
                ...best,
                geoQuery: enrichBest.geoQuery || best.geoQuery,
                authorKey: enrichBest.authorKey || best.authorKey,
                coverRef: best.coverRef || enrichBest.coverRef,
            }, localSeedCandidate);
        }
    }

    if (best.source === 'wikidata_book' && best.title) {
        const enrichQuery = parseQueryInfo(best.author ? `${best.title} / ${best.author}` : best.title);
        const [googleEnrichCandidates, openLibraryEnrichCandidates] = await Promise.all([
            searchGoogleBooksCandidates(enrichQuery),
            searchOpenLibraryCandidates(enrichQuery),
        ]);
        const googleEnrichBest = pickBestCandidate(googleEnrichCandidates, enrichQuery);
        const openLibraryEnrichBest = pickBestCandidate(openLibraryEnrichCandidates, enrichQuery);

        return mergeLocalSeedIntoCandidate({
            ...best,
            author: best.author || googleEnrichBest?.author || openLibraryEnrichBest?.author || '',
            authorKey: openLibraryEnrichBest?.authorKey || '',
            coverRef: googleEnrichBest?.coverRef || openLibraryEnrichBest?.coverRef || best.coverRef,
            subjectPlaceHint: openLibraryEnrichBest?.subjectPlaceHint || null,
            geoQuery: openLibraryEnrichBest?.geoQuery || best.geoQuery,
        }, localSeedCandidate);
    }

    if (!localSeedCandidate) {
        return best;
    }

    return mergeLocalSeedIntoCandidate(best, localSeedCandidate);
}

function buildCoverEnrichQueryInfos(selectedBook, queryInfo) {
    const variants = [];
    const seen = new Set();
    const author = normalizeInputText(selectedBook?.author || queryInfo?.authorHint || '');
    const rawSeed = selectedBook?.raw && typeof selectedBook.raw === 'object' ? selectedBook.raw : null;
    const titles = [
        selectedBook?.title,
        queryInfo?.titleHint,
        ...(Array.isArray(rawSeed?.aliases) ? rawSeed.aliases : []),
    ]
        .map(item => normalizeInputText(item))
        .filter(Boolean);

    titles.forEach((title) => {
        const composed = author ? `${title} / ${author}` : title;
        const info = parseQueryInfo(composed);
        const key = `${info.compareTitle}::${info.compareAuthor}`;
        if (!info.titleHint || seen.has(key)) return;
        seen.add(key);
        variants.push(info);
    });

    return variants.slice(0, 6);
}

async function enrichBookCover(selectedBook, queryInfo) {
    if (!selectedBook?.title || selectedBook.coverRef) {
        return selectedBook;
    }

    try {
        const enrichQueries = buildCoverEnrichQueryInfos(selectedBook, queryInfo);
        let bestCover = null;

        for (const enrichQuery of enrichQueries) {
            const [googleEnrichCandidates, openLibraryEnrichCandidates] = await Promise.all([
                searchGoogleBooksCandidates(enrichQuery, { timeoutMs: COVER_SEARCH_TIMEOUT_MS }),
                searchOpenLibraryCandidates(enrichQuery, { timeoutMs: COVER_SEARCH_TIMEOUT_MS }),
            ]);

            bestCover = pickBestCoverCandidate([
                ...googleEnrichCandidates,
                ...openLibraryEnrichCandidates,
            ], enrichQuery);

            if (bestCover?.coverRef) {
                break;
            }
        }

        if (!bestCover?.coverRef) {
            return selectedBook;
        }

        return {
            ...selectedBook,
            title: selectedBook.title || bestCover.title,
            subtitle: selectedBook.subtitle || bestCover.subtitle || '',
            author: selectedBook.author || bestCover.author || '',
            authorKey: selectedBook.authorKey || bestCover.authorKey || '',
            coverRef: bestCover.coverRef,
            coverSource: bestCover.source,
            subjectPlaceHint: selectedBook.subjectPlaceHint || bestCover.subjectPlaceHint || null,
            geoQuery: selectedBook.geoQuery || bestCover.geoQuery || null,
            firstPublishYear: selectedBook.firstPublishYear || bestCover.firstPublishYear || null,
        };
    } catch (error) {
        console.warn(`>>> [SCRAPE] Failed to enrich cover for ${selectedBook.title}:`, error.message);
        return selectedBook;
    }
}

async function fetchOpenLibraryAuthorGeoHint(authorKey) {
    const normalizedKey = normalizeInputText(authorKey)
        .replace(/^\/?authors\//i, '')
        .replace(/\.json$/i, '');

    if (!normalizedKey) return null;

    const cacheKey = normalizedKey.toLowerCase();
    const cached = authorGeoCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GEO_CACHE_TTL_MS) {
        return cached.value;
    }

    try {
        const author = await fetchJson(`https://openlibrary.org/authors/${encodeURIComponent(normalizedKey)}.json`, 'OpenLibraryAuthor');
        const candidates = [
            author.birth_place,
            author.death_place,
            Array.isArray(author.location) ? author.location[0] : author.location,
            author?.details?.birth_place,
            author?.details?.death_place,
        ]
            .map(item => normalizeInputText(item))
            .filter(Boolean);

        const value = candidates[0] || null;
        authorGeoCache.set(cacheKey, { value, ts: Date.now() });
        return value;
    } catch (error) {
        console.warn(`>>> [SCRAPE] Failed to load author geo for ${normalizedKey}:`, error.message);
        authorGeoCache.set(cacheKey, { value: null, ts: Date.now() });
        return null;
    }
}

function scoreWikidataAuthorResult(result, authorName) {
    const authorNorm = normalizeCompareText(authorName);
    const labelNorm = normalizeCompareText(result.label);
    const aliases = Array.isArray(result.aliases)
        ? result.aliases
        : result.alias
            ? [result.alias]
            : [];
    const aliasNorms = aliases.map(alias => normalizeCompareText(alias));
    const description = String(result.description || '').toLowerCase();
    const leftTokens = normalizeInputText(authorName).toLowerCase().split(/\s+/).filter(Boolean);
    const rightTokens = normalizeInputText(result.label).toLowerCase().split(/\s+/).filter(Boolean);
    const hasSameTokenSet = leftTokens.length > 1
        && leftTokens.length === rightTokens.length
        && leftTokens.every(token => rightTokens.includes(token));
    const isWriterLike = /(writer|author|novelist|poet|essayist|playwright|screenwriter|作家|小说家|诗人|编剧|散文家)/i.test(description);
    const isLikelyOtherProfession = /(researcher|scientist|professor|academic|engineer|politician|athlete|footballer|actor|actress|singer|chemist|physicist|mathematician|economist|lawyer|doctor|physician|journalist)/i.test(description);

    let score = 0;
    if (labelNorm === authorNorm) score += 120;
    else if (labelNorm.includes(authorNorm) || authorNorm.includes(labelNorm)) score += 90;

    if (hasSameTokenSet) score += 34;

    if (aliasNorms.includes(authorNorm)) score += 90;
    else if (aliasNorms.some(alias => alias && (alias.includes(authorNorm) || authorNorm.includes(alias)))) score += 24;

    if (isWriterLike) {
        score += 60;
    } else if (isLikelyOtherProfession) {
        score -= 38;
    }

    return score;
}

function scoreWikidataBookResult(result, title) {
    const titleNorm = normalizeCompareText(title);
    const labelNorm = normalizeCompareText(result.label);
    const aliases = Array.isArray(result.aliases)
        ? result.aliases
        : result.alias
            ? [result.alias]
            : [];
    const aliasNorms = aliases.map(alias => normalizeCompareText(alias));
    const description = String(result.description || '').toLowerCase();
    const isPrimaryBookWork = /(novel by|book by|written work by|literary work by|short story by|play by|memoir by|poetry collection by|essay collection by|children'?s novel by|children'?s book by|小说|长篇小说|文学作品|书籍)/i.test(description);
    const isBookEdition = /(edition of .* by|critical edition|annotated edition|norton .* edition|cambridge .* edition|oxford .* edition|penguin .* edition|harvill edition|translation of .* by|版|译本|校注本)/i.test(description);
    const isBookish = /(novel|book|literary work|fiction|written work|publication|play|short story|memoir|poetry collection|essay collection|children'?s novel|children'?s book|小说|长篇|书籍|作品|诗集|散文集|童话)/i.test(description);
    const isNonBookMedia = /(film|movie|television|tv series|episode|album|song|single|video game|board game|anime|character|comic strip|disease|medical condition|magazine|journal|newspaper|website|software|band|电视剧|电影|导演|演员|专辑|歌曲|游戏|疾病|杂志|网站)/i.test(description);

    let score = 0;
    if (labelNorm === titleNorm) score += 120;
    else if (labelNorm.includes(titleNorm) || titleNorm.includes(labelNorm)) score += 90;

    if (containsCJK(title) || containsCJK(result.label)) {
        score += cjkCharacterOverlapScore(title, result.label, 70);
    }

    if (aliasNorms.includes(titleNorm)) score += 45;
    else if (aliasNorms.some(alias => alias && (alias.includes(titleNorm) || titleNorm.includes(alias)))) score += 24;

    if (isPrimaryBookWork) score += 76;
    else if (isBookEdition) score += 56;
    else if (isBookish) score += 36;

    if (/\bby\s+[a-z]/i.test(description) || /作者|所著/.test(description)) {
        score += 10;
    }
    if (/\b\d{4}\b/.test(description)) {
        score += 4;
    }
    if (isNonBookMedia) {
        score -= 96;
    }

    return score;
}

function scoreWikipediaBookResult(result, title) {
    const titleNorm = normalizeCompareText(title);
    const resultTitleNorm = normalizeCompareText(result.title);
    const snippet = String(result.snippet || '').replace(/<[^>]+>/g, '').toLowerCase();

    let score = 0;
    if (resultTitleNorm === titleNorm) score += 120;
    else if (resultTitleNorm.includes(titleNorm) || titleNorm.includes(resultTitleNorm)) score += 90;

    if (containsCJK(title) || containsCJK(result.title)) {
        score += cjkCharacterOverlapScore(title, result.title, 70);
    }

    if (/(novel|book|written work|literary work|play|short story|memoir|poetry|essay|小说|书籍|作品|文学)/i.test(snippet)) {
        score += 34;
    }
    if (/(film|movie|television|tv series|episode|album|song|video game|disease|电视剧|电影|专辑|歌曲|游戏|疾病)/i.test(snippet)) {
        score -= 80;
    }

    return score;
}

function scoreWikipediaAuthorResult(result, authorName) {
    const authorNorm = normalizeCompareText(authorName);
    const titleNorm = normalizeCompareText(result.title);
    const snippet = String(result.snippet || '').replace(/<[^>]+>/g, '').toLowerCase();

    let score = 0;
    if (titleNorm === authorNorm) score += 120;
    else if (titleNorm.includes(authorNorm) || authorNorm.includes(titleNorm)) score += 90;

    if (containsCJK(authorName) || containsCJK(result.title)) {
        score += cjkCharacterOverlapScore(authorName, result.title, 70);
    }

    if (/(writer|author|novelist|poet|essayist|playwright|screenwriter|作家|小说家|诗人|散文家|编剧|文学)/i.test(snippet)) {
        score += 28;
    }

    return score;
}

function extractEntityIdsFromClaims(claims, propertyId) {
    return (claims?.[propertyId] || [])
        .map(claim => claim?.mainsnak?.datavalue?.value?.id)
        .filter(Boolean);
}

function pickEntityLabel(entity, prefersChinese = false) {
    const order = prefersChinese ? ['zh', 'zh-cn', 'en'] : ['en', 'zh', 'zh-cn'];
    for (const lang of order) {
        const label = entity?.labels?.[lang]?.value;
        if (label) return label;
    }
    return normalizeInputText(entity?.labels?.en?.value || Object.values(entity?.labels || {})[0]?.value || '');
}

async function fetchWikidataCountryLabels(ids, prefersChinese = false) {
    if (!ids.length) return [];
    const params = new URLSearchParams({
        action: 'wbgetentities',
        format: 'json',
        props: 'labels',
        ids: ids.join('|'),
        languages: prefersChinese ? 'zh|zh-cn|en' : 'en|zh|zh-cn',
    });
    const data = await fetchJson(`https://www.wikidata.org/w/api.php?${params.toString()}`, 'WikidataEntities');
    return ids
        .map(id => pickEntityLabel(data?.entities?.[id], prefersChinese))
        .map(normalizeCountryLabel)
        .filter(Boolean);
}

async function fetchWikidataEntityLabels(ids, prefersChinese = false) {
    if (!ids.length) return [];
    const params = new URLSearchParams({
        action: 'wbgetentities',
        format: 'json',
        props: 'labels',
        ids: ids.join('|'),
        languages: prefersChinese ? 'zh|zh-cn|en' : 'en|zh|zh-cn',
    });
    const data = await fetchJson(`https://www.wikidata.org/w/api.php?${params.toString()}`, 'WikidataEntities');
    return ids
        .map(id => pickEntityLabel(data?.entities?.[id], prefersChinese))
        .map(normalizeInputText)
        .filter(Boolean);
}

async function fetchWikipediaWikibaseItem(authorName, prefersChinese = false) {
    const searchLangs = prefersChinese ? ['zh', 'en'] : ['en', 'zh'];
    let bestMatch = null;

    for (const lang of searchLangs) {
        const params = new URLSearchParams({
            action: 'query',
            list: 'search',
            srsearch: authorName,
            format: 'json',
            srlimit: '5',
        });
        const searchData = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params.toString()}`, `WikipediaSearch:${lang}`);
        const top = (searchData?.query?.search || [])
            .map(result => ({ ...result, lang, score: scoreWikipediaAuthorResult(result, authorName) }))
            .sort((a, b) => b.score - a.score)[0];

        if (top && (!bestMatch || top.score > bestMatch.score)) {
            bestMatch = top;
        }
    }

    if (!bestMatch || bestMatch.score < 70) {
        return null;
    }

    const propsParams = new URLSearchParams({
        action: 'query',
        format: 'json',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
        titles: bestMatch.title,
    });
    const pageData = await fetchJson(`https://${bestMatch.lang}.wikipedia.org/w/api.php?${propsParams.toString()}`, `WikipediaPageProps:${bestMatch.lang}`);
    const pages = Object.values(pageData?.query?.pages || {});
    const wikibaseItem = pages.find(page => page?.pageprops?.wikibase_item)?.pageprops?.wikibase_item || '';

    return wikibaseItem || null;
}

async function fetchWikipediaBookWikibaseItem(title, prefersChinese = false) {
    const searchLangs = prefersChinese ? ['zh', 'en'] : ['en', 'zh'];
    let bestMatch = null;

    for (const lang of searchLangs) {
        const params = new URLSearchParams({
            action: 'query',
            list: 'search',
            srsearch: title,
            format: 'json',
            srlimit: '5',
        });
        const searchData = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params.toString()}`, `WikipediaBookSearch:${lang}`);
        const top = (searchData?.query?.search || [])
            .map(result => ({ ...result, lang, score: scoreWikipediaBookResult(result, title) }))
            .sort((a, b) => b.score - a.score)[0];

        if (top && (!bestMatch || top.score > bestMatch.score)) {
            bestMatch = top;
        }
    }

    if (!bestMatch || bestMatch.score < 70) {
        return null;
    }

    const propsParams = new URLSearchParams({
        action: 'query',
        format: 'json',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
        titles: bestMatch.title,
    });
    const pageData = await fetchJson(`https://${bestMatch.lang}.wikipedia.org/w/api.php?${propsParams.toString()}`, `WikipediaBookPageProps:${bestMatch.lang}`);
    const pages = Object.values(pageData?.query?.pages || {});
    const wikibaseItem = pages.find(page => page?.pageprops?.wikibase_item)?.pageprops?.wikibase_item || '';

    return wikibaseItem || null;
}

async function resolveWikidataBookAuthors(entityId, prefersChinese = false) {
    const entityData = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(entityId)}.json`, 'WikidataBookEntity');
    let entity = entityData?.entities?.[entityId];
    if (!entity) {
        return { entity: null, authorLabels: [] };
    }

    let authorIds = extractEntityIdsFromClaims(entity?.claims, 'P50');
    if (!authorIds.length) {
        const workIds = extractEntityIdsFromClaims(entity?.claims, 'P629');
        const workId = workIds[0];
        if (workId) {
            const workData = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(workId)}.json`, 'WikidataBookWorkEntity');
            const workEntity = workData?.entities?.[workId];
            if (workEntity) {
                entity = workEntity;
                authorIds = extractEntityIdsFromClaims(workEntity?.claims, 'P50');
            }
        }
    }

    const authorLabels = await fetchWikidataEntityLabels(authorIds.slice(0, 2), prefersChinese);
    return { entity, authorLabels };
}

async function fetchWikidataAuthorCountry(authorName, prefersChinese = false) {
    const normalizedAuthor = normalizeInputText(authorName);
    if (!normalizedAuthor) return null;

    const cacheKey = `${prefersChinese ? 'zh' : 'en'}::${normalizedAuthor.toLowerCase()}`;
    const cached = wikidataAuthorCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GEO_CACHE_TTL_MS) {
        return cached.value;
    }

    try {
        const searchLanguages = prefersChinese ? ['zh', 'en'] : ['en', 'zh'];
        const searchResults = [];

        for (const language of searchLanguages) {
            const params = new URLSearchParams({
                action: 'wbsearchentities',
                format: 'json',
                type: 'item',
                limit: String(WIKIDATA_SEARCH_LIMIT),
                language,
                uselang: language,
                search: normalizedAuthor,
            });
            const searchData = await fetchJson(`https://www.wikidata.org/w/api.php?${params.toString()}`, 'WikidataSearch');
            searchResults.push(...(searchData.search || []));
        }

        const top = dedupeCandidates(
            searchResults.map(result => ({
                source: 'wikidata',
                title: result.label || '',
                author: normalizedAuthor,
                coverRef: result.id || '',
                ...result,
            }))
        )
            .map(result => ({ ...result, score: scoreWikidataAuthorResult(result, normalizedAuthor) }))
            .sort((a, b) => b.score - a.score)[0];

        let entityId = '';
        if (top && top.score >= 70) {
            entityId = top.id;
        } else {
            entityId = await fetchWikipediaWikibaseItem(normalizedAuthor, prefersChinese);
        }

        if (!entityId) {
            wikidataAuthorCache.set(cacheKey, { value: null, ts: Date.now() });
            return null;
        }

        const entityData = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(entityId)}.json`, 'WikidataEntity');
        const entity = entityData?.entities?.[entityId];
        const countryIds = extractEntityIdsFromClaims(entity?.claims, 'P27');
        const labels = await fetchWikidataCountryLabels(countryIds, prefersChinese);
        const country = labels[0] || null;

        const value = country
            ? { country, entityId, source: 'wikidata_author' }
            : null;
        wikidataAuthorCache.set(cacheKey, { value, ts: Date.now() });
        return value;
    } catch (error) {
        console.warn(`>>> [SCRAPE] Failed to load Wikidata author country for ${normalizedAuthor}:`, error.message);
        wikidataAuthorCache.set(cacheKey, { value: null, ts: Date.now() });
        return null;
    }
}

async function fetchWikidataBookCandidate(queryInfo) {
    const title = normalizeInputText(queryInfo.titleHint || queryInfo.cleaned);
    if (!title) return null;

    try {
        const searchLanguages = queryInfo.prefersChinese ? ['zh', 'en'] : ['en', 'zh'];
        const searchResults = [];

        for (const language of searchLanguages) {
            const params = new URLSearchParams({
                action: 'wbsearchentities',
                format: 'json',
                type: 'item',
                limit: String(WIKIDATA_SEARCH_LIMIT),
                language,
                uselang: language,
                search: title,
            });
            const searchData = await fetchJson(`https://www.wikidata.org/w/api.php?${params.toString()}`, 'WikidataBookSearch');
            searchResults.push(...(searchData.search || []));
        }

        const top = dedupeCandidates(
            searchResults.map(result => ({
                source: 'wikidata_book',
                title: result.label || '',
                author: '',
                coverRef: result.id || '',
                ...result,
            }))
        )
            .map(result => ({ ...result, score: scoreWikidataBookResult(result, title) }))
            .sort((a, b) => b.score - a.score)[0];

        let entityId = top?.score >= 70 ? top.id : '';
        if (!entityId) {
            entityId = await fetchWikipediaBookWikibaseItem(title, queryInfo.prefersChinese);
        }

        if (!entityId) {
            return null;
        }

        const { entity, authorLabels } = await resolveWikidataBookAuthors(entityId, queryInfo.prefersChinese);
        if (!entity) {
            return null;
        }

        return {
            source: 'wikidata_book',
            key: entityId,
            title: pickEntityLabel(entity, queryInfo.prefersChinese) || top?.label || title,
            subtitle: '',
            author: authorLabels[0] || '',
            authorKey: '',
            coverRef: null,
            isbn: queryInfo.isbn || '',
            geoQuery: null,
            subjectPlaceHint: null,
            firstPublishYear: null,
            raw: entity,
        };
    } catch (error) {
        console.warn(`>>> [SCRAPE] Failed to load Wikidata book for ${title}:`, error.message);
        return null;
    }
}

function uniqNonEmpty(items) {
    const seen = new Set();
    return items.filter(item => {
        const normalized = normalizeInputText(item);
        if (!normalized) return false;
        const key = normalized.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function buildManualBookCandidate(queryInfo) {
    if (!queryInfo?.titleHint) return null;
    if (queryInfo.isbn) return null;

    const basis = `${queryInfo.titleHint}::${queryInfo.authorHint || ''}::${queryInfo.countryHint || ''}`;
    const manualId = `manual_${Buffer.from(basis).toString('base64url').slice(0, 18)}`;
    return {
        source: 'manual',
        key: manualId,
        title: queryInfo.titleHint,
        subtitle: '',
        author: queryInfo.authorHint || '',
        authorKey: '',
        coverRef: null,
        subjectPlaceHint: null,
        firstPublishYear: null,
        needsEnrichment: !queryInfo.authorHint && !queryInfo.countryHint,
    };
}

function resolveCountryName(geoResult, fallback) {
    return normalizeCountryLabel(geoResult?.displayName?.split(',').pop()?.trim() || fallback || '');
}

function resolveGeoMeta(geoResultMap, hint) {
    const normalizedHint = normalizeInputText(hint);
    if (!normalizedHint) {
        return { hint: '', geo: null, country: '', countryCode: '' };
    }
    const geo = geoResultMap.get(normalizedHint) || null;
    const localCountryMeta = !geo ? resolveLocalCountryMeta(normalizedHint) : null;
    return {
        hint: normalizedHint,
        geo: geo || (localCountryMeta ? {
            lat: localCountryMeta.lat,
            lon: localCountryMeta.lon,
            countryCode: localCountryMeta.code,
            displayName: localCountryMeta.country,
        } : null),
        country: geo
            ? resolveCountryName(geo, normalizedHint)
            : (localCountryMeta?.country || normalizeCountryLabel(normalizedHint)),
        countryCode: geo?.countryCode || localCountryMeta?.code || '',
    };
}

// ==========================================
// 工具：下载封面图并压缩为 Base64
// ==========================================
async function fetchCoverAsBase64(coverRef, source = 'openlibrary') {
    if (!coverRef) return null;
    const coverUrls = source === 'openlibrary'
        ? [
            `https://covers.openlibrary.org/b/id/${coverRef}-L.jpg`,
            `https://covers.openlibrary.org/b/id/${coverRef}-M.jpg`,
        ]
        : [String(coverRef)];

    for (const coverUrl of coverUrls) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), COVER_TIMEOUT_MS);
            const res = await fetch(coverUrl, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
            if (!res.ok) continue;

            const contentType = res.headers.get('content-type') || 'image/jpeg';
            const buffer = Buffer.from(await res.arrayBuffer());

            try {
                const sharp = (await import('sharp')).default;
                const compressed = await sharp(buffer)
                    .resize({ width: 150, withoutEnlargement: true })
                    .jpeg({ quality: 75 })
                    .toBuffer();

                return `data:image/jpeg;base64,${compressed.toString('base64')}`;
            } catch (compressError) {
                console.warn('[fetchCover] 压缩失败，回退原图:', compressError.message);
                return `data:${contentType};base64,${buffer.toString('base64')}`;
            }
        } catch (error) {
            console.warn('[fetchCover] 拉取失败:', error.message);
        }
    }

    return null;
}

function wrapCoverText(text, maxCharsPerLine = 14, maxLines = 4) {
    const value = normalizeInputText(text);
    if (!value) return [];

    if (containsCJK(value)) {
        const chars = [...value];
        const lines = [];
        for (let i = 0; i < chars.length && lines.length < maxLines; i += maxCharsPerLine) {
            lines.push(chars.slice(i, i + maxCharsPerLine).join(''));
        }
        return lines;
    }

    const words = value.split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';
    words.forEach((word) => {
        const next = current ? `${current} ${word}` : word;
        if (next.length > maxCharsPerLine && current) {
            if (lines.length < maxLines) lines.push(current);
            current = word;
        } else {
            current = next;
        }
    });
    if (current && lines.length < maxLines) lines.push(current);
    return lines.slice(0, maxLines);
}

function createGeneratedCoverDataUri(title, author = '') {
    const seed = normalizeCompareText(`${title} ${author}`) || 'book';
    let hue = 0;
    for (let i = 0; i < seed.length; i += 1) {
        hue = (hue + seed.charCodeAt(i) * 17) % 360;
    }

    const titleLines = wrapCoverText(title, containsCJK(title) ? 8 : 14, 4);
    const authorLines = wrapCoverText(author, containsCJK(author) ? 10 : 18, 2);
    const titleTspans = titleLines
        .map((line, index) => `<tspan x="28" dy="${index === 0 ? 0 : 26}">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</tspan>`)
        .join('');
    const authorTspans = authorLines
        .map((line, index) => `<tspan x="28" dy="${index === 0 ? 0 : 18}">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</tspan>`)
        .join('');

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="540" viewBox="0 0 360 540">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hue} 62% 28%)" />
      <stop offset="100%" stop-color="hsl(${(hue + 42) % 360} 56% 16%)" />
    </linearGradient>
  </defs>
  <rect width="360" height="540" fill="url(#bg)" rx="28" />
  <rect x="18" y="18" width="324" height="504" rx="22" fill="none" stroke="rgba(255,255,255,0.18)" />
  <circle cx="302" cy="62" r="34" fill="rgba(255,255,255,0.08)" />
  <circle cx="58" cy="468" r="52" fill="rgba(255,255,255,0.06)" />
  <text x="28" y="110" fill="#f7f2e8" font-size="34" font-family="Georgia, 'Times New Roman', serif" font-weight="700">
    ${titleTspans}
  </text>
  <text x="28" y="420" fill="rgba(247,242,232,0.88)" font-size="22" font-family="Georgia, 'Times New Roman', serif">
    ${authorTspans}
  </text>
</svg>`.trim();

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ==========================================
// POST /api/reading/scrape
// Body: { books: ["书名1", "书名2", ...] }
// ==========================================
export async function POST(request) {
    const { books: queries } = await request.json();
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
        return NextResponse.json({ error: '请提供书名列表' }, { status: 400 });
    }
    if (queries.length > 20) {
        return NextResponse.json({ error: '单次最多导入 20 本书' }, { status: 400 });
    }

    console.log(`>>> [SCRAPE] Starting batch scrape for ${queries.length} queries`);

    // Step 1: 先并行执行 OpenLibrary 搜索
    const searchTasks = queries.map(async (query) => {
        const queryInfo = parseQueryInfo(query);
        const queryLabel = queryInfo.raw || queryInfo.titleHint || queryInfo.cleaned;
        if (!queryLabel) return { query: '', error: '输入为空' };
        try {
            const best = await resolveBookMatch(queryInfo);
            const fallbackCandidate = !best ? buildManualBookCandidate(queryInfo) : null;
            const selectedBook = await enrichBookCover(best || fallbackCandidate, queryInfo);

            if (!selectedBook) {
                const errorMessage = queryInfo.isbn
                    ? 'ISBN 未匹配到书籍，请换一个 ISBN 或改用“书名 / 作者 / 国度”'
                    : '未找到匹配书籍，可尝试补充作者名或国度';
                return { query: queryLabel, error: errorMessage };
            }

            let coverBase64 = await fetchCoverAsBase64(selectedBook.coverRef, selectedBook.coverSource || selectedBook.source);
            if (!coverBase64 && selectedBook.localSeed?.coverRef && selectedBook.localSeed.coverRef !== selectedBook.coverRef) {
                coverBase64 = await fetchCoverAsBase64(
                    selectedBook.localSeed.coverRef,
                    selectedBook.localSeed.coverSource || 'openlibrary'
                );
            }
            if (!coverBase64) {
                coverBase64 = createGeneratedCoverDataUri(
                    selectedBook.title || queryInfo.titleHint || queryLabel,
                    selectedBook.author || queryInfo.authorHint || ''
                );
            }
            const authorNameForCountry = selectedBook.author || queryInfo.authorHint;
            const wikidataAuthorCountry = !queryInfo.countryHint && authorNameForCountry
                ? await fetchWikidataAuthorCountry(authorNameForCountry, containsCJK(authorNameForCountry) ? true : queryInfo.prefersChinese)
                : null;
            const authorGeoHint = !queryInfo.countryHint && !wikidataAuthorCountry?.country && !selectedBook.subjectPlaceHint && selectedBook.authorKey
                ? await fetchOpenLibraryAuthorGeoHint(selectedBook.authorKey)
                : null;
            const geoHints = uniqNonEmpty([
                queryInfo.countryHint,
                wikidataAuthorCountry?.country,
                selectedBook.subjectPlaceHint,
                authorGeoHint,
            ]);

            return { 
                query: queryLabel,
                queryInfo,
                book: { 
                    ...selectedBook,
                    coverBase64, 
                    wikidataAuthorCountry,
                    authorGeoHint,
                    geoHints,
                } 
            };
        } catch (err) {
            return { query: queryLabel, error: err.message };
        }
    });

    const searchResults = await Promise.all(searchTasks);
    
    // Step 2: 对唯一地点做顺序地理编码，避免重复请求拖慢整批导入
    const geoResultMap = new Map();
    const uniqueGeoQueries = [...new Set(
        searchResults
            .flatMap(item => item.book?.geoHints || [])
    )];

    for (const geoQuery of uniqueGeoQueries) {
        console.log(`>>> [SCRAPE] Fetching geo for: ${geoQuery}`);
        geoResultMap.set(geoQuery, await geocode(geoQuery));
    }

    const finalResults = [];

    for (const item of searchResults) {
        if (item.error) {
            finalResults.push(item);
            continue;
        }

        const { book, query, queryInfo } = item;
        const authorCountryMeta = resolveGeoMeta(geoResultMap, book.wikidataAuthorCountry?.country);
        const placeCountryMeta = resolveGeoMeta(geoResultMap, book.subjectPlaceHint || book.authorGeoHint);
        const userCountryMeta = resolveGeoMeta(geoResultMap, queryInfo?.countryHint);

        const mapCountryMeta = userCountryMeta.country
            ? { ...userCountryMeta, source: 'user_input' }
            : authorCountryMeta.country
                ? { ...authorCountryMeta, source: 'wikidata_author' }
                : placeCountryMeta.country
                    ? { ...placeCountryMeta, source: book.subjectPlaceHint ? 'openlibrary_subject_place' : 'openlibrary_author' }
                    : { hint: '', geo: null, country: '未知', countryCode: '', source: 'unknown' };

        const bookData = {
            id: book.key?.replace('/works/', '') || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            title: book.title || queryInfo?.titleHint || query,
            author: book.author || queryInfo?.authorHint || '未知作者',
            coverUrl: book.coverBase64 || null,
            authorCountry: authorCountryMeta.country || '',
            authorCountryCode: authorCountryMeta.countryCode || '',
            placeCountry: placeCountryMeta.country || '',
            placeCountryCode: placeCountryMeta.countryCode || '',
            mapCountry: mapCountryMeta.country,
            mapCountryCode: mapCountryMeta.countryCode || '',
            countrySource: mapCountryMeta.source,
            country: mapCountryMeta.country,
            countryCode: mapCountryMeta.countryCode || '',
            lat: mapCountryMeta.geo?.lat || 0,
            lon: mapCountryMeta.geo?.lon || 0,
            quote: '',
            mood: 'default',
            addedAt: new Date().toISOString(),
        };

        console.log(`>>> [SCRAPE] Success: ${bookData.title} (${bookData.countryCode || 'No Geo'})`);
        finalResults.push({ query, book: bookData });
    }

    return NextResponse.json({ results: finalResults });
}
