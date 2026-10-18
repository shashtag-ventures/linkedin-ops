/**
 * actions/search.mjs — Read-only LinkedIn people search
 *
 * Finds people currently at a company (e.g. its recruiters) and returns one
 * structured row per result card. Never clicks Connect / Message / Follow.
 *
 * Company scoping, best first:
 *   1. currentCompany facet — numeric company ID resolved from the company page
 *   2. keyword fallback — "<keywords> <company>" with no facet, rows kept only
 *      when the card text names the company (flagged `scope: "keyword"`)
 */

import { delay } from '../cdp.mjs';

const SEARCH_BASE = 'https://www.linkedin.com/search/results/people/';

/** Resolve a company name or /company/ URL to { id, slug, name } (id may be null). */
export async function resolveCompany(cdp, company) {
  let slug = null;
  const m = String(company).match(/linkedin\.com\/company\/([^/?#]+)/i);
  if (m) {
    slug = m[1];
  } else {
    const url = `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(company)}`;
    await cdp.navigate(url, 4000);
    slug = await cdp.evaluate(`() => {
      const a = Array.from(document.querySelectorAll('main a[href*="/company/"]'))
        .map(x => x.href.match(/\\/company\\/([^/?#]+)/))
        .find(Boolean);
      return a ? a[1] : null;
    }`);
  }
  if (!slug) return { id: null, slug: null, name: company };

  await cdp.navigate(`https://www.linkedin.com/company/${slug}/`, 4000);
  const info = await cdp.evaluate(`() => {
    // The company page links to its own "see all employees" search, which
    // carries the numeric id: /search/results/people/?currentCompany=["1441"]
    const html = document.documentElement.innerHTML;
    const id = (html.match(/currentCompany=%5B%22(\\d+)/) || html.match(/urn:li:fsd_company:(\\d+)/) || [])[1] || null;
    const name = (document.querySelector('h1')?.innerText || '').trim();
    return { id, name };
  }`);
  return { id: info?.id || null, slug, name: info?.name || company };
}

/**
 * Pull result cards off the current search page.
 *
 * Parsed from the visible text, not the DOM tree: LinkedIn reshuffles card
 * markup often, but a card always reads
 *   Name / • 2nd / headline / location / [Connect|Pending|Follow|Message] / Current: … / mutual …
 * The profile URL is the first /in/ link whose own text starts with that name.
 */
async function readCards(cdp) {
  return cdp.evaluate(`() => {
    const main = document.querySelector('main') || document.body;
    const lines = (main.innerText || '').split('\\n').map(s => s.trim()).filter(Boolean);
    const links = Array.from(main.querySelectorAll('a[href*="/in/"]'))
      .map(a => ({ text: (a.innerText || '').trim(), href: a.href.split('?')[0] }))
      .filter(l => /\\/in\\/[^/]+\\/?$/.test(l.href));
    const isDeg = s => /^•\\s*(1st|2nd|3rd\\+?)$/.test(s);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!isDeg(lines[i])) continue;
      const name = lines[i - 1];
      let j = i + 1;
      const block = [];
      while (j < lines.length && !isDeg(lines[j])) block.push(lines[j++]);
      const link = links.find(l => l.text.startsWith(name));
      if (!link) continue;
      rows.push({
        name,
        degree: lines[i].replace(/^•\\s*/, ''),
        headline: block[0] || '',
        location: block[1] || '',
        action: block.find(s => /^(Connect|Pending|Follow|Message)$/.test(s)) || '',
        current: (block.find(s => /^Current:/.test(s)) || '').replace(/^Current:\\s*/, ''),
        profileUrl: link.href.endsWith('/') ? link.href : link.href + '/',
      });
    }
    return rows;
  }`);
}

export async function searchPeople(cdp, { company, keywords = 'recruiter', geoUrn = null, limit = 25, maxPages = 3 }) {
  if (!company) throw new Error('Missing required parameter: company');
  const co = await resolveCompany(cdp, company);
  const scope = co.id ? 'company' : 'keyword';
  console.error(`[Search] 🏢 ${co.name} → ${co.id ? `company id ${co.id}` : 'no id, keyword fallback'}`);

  const params = new URLSearchParams();
  params.set('keywords', scope === 'company' ? keywords : `${keywords} ${co.name}`);
  if (co.id) params.set('currentCompany', JSON.stringify([co.id]));
  if (geoUrn) params.set('geoUrn', JSON.stringify([String(geoUrn)]));

  const results = [];
  const seen = new Set();
  for (let page = 1; page <= maxPages && results.length < limit; page++) {
    if (page > 1) params.set('page', String(page));
    await cdp.navigate(`${SEARCH_BASE}?${params}`, 4500);
    await cdp.evaluate(`() => window.scrollTo(0, document.body.scrollHeight)`);
    await delay(1500);
    const cards = (await readCards(cdp)) || [];
    if (cards.length === 0) break;
    const needle = co.name.toLowerCase();
    for (const c of cards) {
      if (seen.has(c.profileUrl)) continue;
      // Keyword fallback: keep only people whose *current* role is at the company
      // ("Ex-Google" in a headline must not count).
      if (scope === 'keyword') {
        const cur = (c.current || c.headline).toLowerCase();
        if (!cur.includes(needle) || /\bex[-\s]*\S*\s*/.test(cur.split(needle)[0].slice(-6))) continue;
      }
      seen.add(c.profileUrl);
      results.push({ ...c, scope });
      if (results.length >= limit) break;
    }
  }
  return { success: true, status: 'OK', company: co, scope, results };
}
