# SpotCredit — Live News + Euribor Tracker

## Context

O SpotCredit é hoje um simulador 100% estático: o `index.html` tem todas as taxas e datas hardcoded em `LIVE_DATA`, actualizadas só por commit + `scp`. O utilizador quer transformar a página numa **referência viva de crédito habitação em Portugal**, com notícias actualizadas e Euribor verdadeiramente live, sem comprometer a simplicidade single-file nem expor visitantes a tracking.

A primeira motivação concreta é a actual onda mediática sobre **"Apoios para jovens até 35 anos"** — o utilizador quer um tracker que apanhe essa e futuras novidades automaticamente.

**Outcome desejado**: secção full-width "Notícias de crédito em Portugal" entre o hero e o simulador, com 3 itens visíveis + expand para mais, filtros por categoria (Jovem / Euribor / OE / Regulação / Bancos), refresh a cada 6h. Em paralelo, o painel "Taxas ao vivo" passa a puxar Euribor real do BPstat com fallback gracioso.

**Decisões já confirmadas com o utilizador:**
- Arquitectura: **Cloudflare Worker para news + Euribor** em `data.spotcredit.org`
- Moderation: **gate editorial via commits** (pinned.json + blocked.json no repo)
- Cadência: **6h para Euribor e news**

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser (spotcredit.org)                                        │
│                                                                  │
│  index.html                                                     │
│  ├─ LIVE_DATA              ← fallback Euribor hardcoded         │
│  ├─ NEWS_FALLBACK          ← fallback notícias hardcoded         │
│  ├─ LIVE_INTEGRATION flag  ← kill-switch instantâneo            │
│  ├─ cacheGet/cacheSet      ← localStorage com TTL 6h            │
│  └─ fetchLive()            ← stale-while-revalidate              │
│       │                                                           │
└───────┼──────────────────────────────────────────────────────────┘
        │ HTTPS (same-origin policy violada via CORS allowlist)
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Cloudflare Worker (data.spotcredit.org)                         │
│                                                                  │
│  /euribor   → BPstat (Euribor 3/6/12m + delta) — edge cache 6h  │
│  /news      → RSS aggregator + filtro + moderação — cache 6h    │
│  /health    → status report (interno)                            │
│                                                                  │
│  Moderation reads (cada batch):                                  │
│   ├─ pinned.json   ← raw.githubusercontent.com/.../pinned.json  │
│   └─ blocked.json  ← raw.githubusercontent.com/.../blocked.json │
│                                                                  │
│  Per-request: AbortController 5s, fallback silencioso            │
│  CORS: Access-Control-Allow-Origin: https://spotcredit.org      │
└─────────────────────────────────────────────────────────────────┘
        │
        ├──▶ BPstat / Banco de Portugal (Euribor)
        └──▶ RSS feeds (a confirmar URLs): ECO, Negócios, Idealista, BdP, Google News
```

### Defesa em 3 camadas para rate limits

1. **localStorage do browser** (TTL 6h): cada visitor faz no máx 4 requests/dia, dois por endpoint.
2. **Edge cache Cloudflare** (TTL 6h via `Cache-Control: public, max-age=21600`): mesmo que 10k browsers cheguem simultaneamente, o Worker faz 1 request à origem por janela.
3. **Generous per-IP throttle** (600 req/h via Workers + CF WAF rule): protege contra scripting abusivo sem partir corporate NAT. KV evitado (limite 1k writes/dia é apertado).

### Fallback strategy (4 niveis)

1. localStorage cache fresco (< 6h) → usa
2. localStorage cache stale (6h–48h) → mostra com `data-stale="true"` (visual subtil), dispara revalidate em background
3. localStorage cache muito stale (> 48h) ou ausente → mostra `NEWS_FALLBACK` / `LIVE_DATA` hardcoded
4. Em qualquer erro do fetch (CORS, 5xx, parse, timeout) → degrade silencioso para o nível anterior. **Nunca** mostra UI de erro.

---

## Ficheiros a modificar / criar

### Modificar
- **`/Users/nunocoelho/Projects/SpotCredit/index.html`**
  - HTML: nova secção `<section id="noticias">` entre hero (linha 749) e simulador
  - CSS: estilos `.news-*` no `<style>` (reutiliza `--bg`, `--surf`, `--deep`, `--mid` etc.)
  - JS: `NEWS_FALLBACK` array, helpers `cacheGet/cacheSet`, `fetchLive()`, `renderNews()`, `setupNewsFilters()`, `relativeTime()`. Integração na `toggleLang()` para PT/EN.
  - Feature flag `const LIVE_INTEGRATION = { euribor: true, news: true };` no topo do `<script>`
  - Mobile breakpoint @ `max-width: 880px` (alinhado com o existente nas linhas 661–674): grid news 3-col → 1-col, chips wrap.
  - Footer disclaimer: nova linha sobre Worker e privacidade.

- **`/Users/nunocoelho/Projects/SpotCredit/nginx/spotcredit.conf`**
  - `Content-Security-Policy`: `connect-src 'none'` → `connect-src https://data.spotcredit.org`
  - Manter a linha antiga em comentário para rollback rápido.

- **`/Users/nunocoelho/Projects/SpotCredit/CLAUDE.md`**
  - Actualizar a secção "Regras absolutas → Dados de taxas: manuais, nunca scraped" para reflectir nova política:
    - Bank rates: **continuam** manuais (proibição mantida)
    - Euribor: agora live via Worker, fallback hardcoded
    - News: live via Worker, com moderation gate editorial (commits ao repo)
    - Privacidade: revisada — Worker vê IPs, simulador continua a não enviar PII.

- **`/Users/nunocoelho/Projects/SpotCredit/deploy.sh`**
  - Adicionar deploy de `pinned.json` e `blocked.json` (são lidos pelo Worker via `raw.githubusercontent.com`, mas também servidos pelo nginx como backup).

### Criar (nova subpasta `worker/`)
- **`worker/wrangler.toml`** — config do Worker (account_id, route `data.spotcredit.org/*`, env vars).
- **`worker/src/index.js`** — handlers `/euribor`, `/news`, `/health`. Parse XML RSS (regex hand-rolled, sem deps externas). Filtro de keywords. Leitura de `pinned.json` / `blocked.json`.
- **`worker/README.md`** — instruções deploy (`wrangler login`, `wrangler deploy`), test local (`wrangler dev`).

### Criar (raiz do repo, moderation)
- **`pinned.json`** — array de items VIP sempre no topo. Schema:
  ```json
  [{ "url": "...", "title": "...", "source": "...", "date": "2026-05-08", "tag": "JOVEM" }]
  ```
- **`blocked.json`** — array de URLs ou domínios a excluir mesmo que passem o filtro.
- **`.github/workflows/news-preview.yml`** (opcional, fase posterior) — Action que diariamente abre um PR com o snapshot do que o Worker está a servir, para tu poderes ver o que está live e ajustar `pinned`/`blocked`.

---

## Estrutura de dados

### `NEWS_FALLBACK` (hardcoded em index.html)
```js
const NEWS_FALLBACK = [
  {
    date: '2026-05-08',           // ISO, sort fácil
    tag: 'JOVEM',                  // JOVEM | EURIBOR | OE | REGULACAO | BANCOS
    title: '...',
    summary: '...',                // ≤ 140 chars
    source: 'ECO',                 // só nome, atribuição
    url: 'https://...'             // opcional, target=_blank rel=noopener
  }
];
```

### Worker response `/news`
```json
{
  "updated": "2026-05-10T14:00:00Z",
  "source_count": 4,
  "items": [/* mesma shape de NEWS_FALLBACK */]
}
```

### Worker response `/euribor`
```json
{
  "updated": "2026-05-10T14:00:00Z",
  "date_label": "10 Mai 2026",
  "eur3":  { "val": 2.149, "delta": "down", "delta_label": "−0.06 pp" },
  "eur6":  { "val": 2.462, "delta": "down", "delta_label": "−0.09 pp" },
  "eur12": { "val": 2.769, "delta": "flat", "delta_label": "—" },
  "bce":   "BCE manteve taxas na reunião de 30 Abr 2026."
}
```

---

## Mudanças no `<script>` do index.html

Helpers novos (todos isolados, testáveis):

```js
const LIVE_INTEGRATION = { euribor: true, news: true };
const DEBUG = new URLSearchParams(location.search).get('debug') === '1';

function cacheGet(key, maxAgeMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > maxAgeMs) return { data, stale: true };
    return { data, stale: false };
  } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); }
  catch (e) { if (DEBUG) console.warn('cache write failed', e); }
}

async function fetchLive(url, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

function relativeTime(isoDate) {
  // 'há 2 dias' / '2 days ago' baseado em currentLang
}
```

Render flow para news:
1. `loadNews()` no init: cacheGet → render imediato se fresh
2. Se cache stale/missing: render `NEWS_FALLBACK` → dispara `fetchLive('/news')` em background
3. Quando o fetch resolver: cacheSet + re-render se mudou (subtle fade, sem flash)
4. Filtros: client-side, sem refetch (a lista já vem completa)

Render flow para Euribor (modifica `renderPanel()` existente, linhas 1023-1048):
- Mesma lógica: usa `LIVE_DATA` como fallback, fetch override em background.

---

## Mudanças no Worker

Estrutura do `worker/src/index.js` (~150 linhas):

```js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': 'https://spotcredit.org',
                   'Cache-Control': 'public, max-age=21600' };

    if (url.pathname === '/euribor') return handleEuribor(env, ctx, cors);
    if (url.pathname === '/news')    return handleNews(env, ctx, cors);
    if (url.pathname === '/health')  return new Response('ok');
    return new Response('not found', { status: 404 });
  }
};

async function handleNews(env, ctx, cors) {
  const cache = caches.default;
  const cacheKey = new Request('https://data.spotcredit.org/news-v1');
  let resp = await cache.match(cacheKey);
  if (resp) return resp;

  const [pinned, blocked, feedItems] = await Promise.all([
    fetchJsonSafe('https://raw.githubusercontent.com/NCyberDev/SpotCredit/main/pinned.json', []),
    fetchJsonSafe('https://raw.githubusercontent.com/NCyberDev/SpotCredit/main/blocked.json', []),
    fetchAllFeeds(env.FEEDS)
  ]);

  const filtered = applyFilter(feedItems, blocked);
  const ranked = [...pinned, ...filtered].slice(0, 12);
  const body = JSON.stringify({ updated: new Date().toISOString(), source_count: env.FEEDS.length, items: ranked });

  resp = new Response(body, { headers: { ...cors, 'Content-Type': 'application/json' } });
  ctx.waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}
```

Detalhes:
- `fetchJsonSafe(url, fallback)` retorna fallback em qualquer erro (timeout, 404, parse).
- `fetchAllFeeds(feeds)` mapeia `feeds` (array de URLs em env var) com `Promise.allSettled` — feeds individuais podem falhar sem afundar o batch.
- `applyFilter` aplica:
  1. Required-term match (qualquer de: `crédito habitação`, `Euribor`, `habitação jovem`, `IRS jovem`, `Banco de Portugal`, `OE2026`, `IMT jovem`, `Garantia Pública`)
  2. Blocklist (skip se contém: `crédito ao consumo`, `crédito pessoal`, `automóvel`, `patrocinado`)
  3. URL não em `blocked.json`
  4. Title-only matching (descriptions são noisier)
- Parse RSS: regex hand-rolled para `<item>...<title>...</title>...<link>...</link>...<pubDate>...</pubDate>...</item>`. Sem deps externas (supply-chain risk minimizado).
- Detecção de tag automática via keywords no title: `jovem` → JOVEM, `Euribor|BCE` → EURIBOR, `OE2026|orçamento` → OE, `Banco de Portugal|BdP` → REGULACAO.

---

## Steps de implementação (ordem deploy-independent)

Cada step é deployable e revertible sozinho.

1. **Step 1 — UI hardcoded** *(zero infra)*
   - Adicionar HTML/CSS/JS para secção news com `NEWS_FALLBACK` array (5-7 items semente, marcados como exemplos)
   - Mobile responsive ao breakpoint 880px existente
   - Filtros client-side
   - PT/EN translation hooks
   - Sem fetch, sem CSP change
   - Deploy: `scp index.html`. Ship value imediato.

2. **Step 2 — Scaffolding localStorage + flag** *(zero infra)*
   - Adicionar `LIVE_INTEGRATION = { euribor: false, news: false }`
   - Implementar `cacheGet/cacheSet/fetchLive/relativeTime`
   - Flag continua off — nada muda visualmente.

3. **Step 3 — Worker MVP `/euribor`** *(infra Cloudflare)*
   - Setup `worker/` folder, `wrangler.toml`, conta CF, DNS `data.spotcredit.org`
   - Implementar só `/euribor` e `/health`
   - Test local com `wrangler dev`
   - Deploy `wrangler deploy`
   - Test em produção via `curl https://data.spotcredit.org/health`
   - Frontend ainda não fetcha (flag off + CSP bloqueia).

4. **Step 4 — Relax nginx CSP**
   - Editar `nginx/spotcredit.conf`: `connect-src https://data.spotcredit.org`
   - Manter linha antiga comentada para rollback
   - Deploy nginx, `nginx -t && systemctl reload nginx`
   - Test: page carrega normal, console limpo.

5. **Step 5 — Wire Euribor live**
   - `LIVE_INTEGRATION.euribor = true`
   - Modificar `renderPanel()` para usar cacheGet → fetchLive → fallback
   - Adicionar atributo `data-stale` quando cache > 6h
   - Deploy index.html
   - Monitor 48h: que % de loads tem fetch successful? Verificar logs Worker.

6. **Step 6 — Worker `/news` + moderation files**
   - Criar `pinned.json` e `blocked.json` (vazios ou semente)
   - Implementar `handleNews` no Worker
   - Lista inicial de feeds via env var (validar manualmente que cada URL responde com XML válido)
   - Deploy worker + commit moderation files
   - Test via `curl https://data.spotcredit.org/news`

7. **Step 7 — Dark launch news**
   - `LIVE_INTEGRATION.news = true` MAS `renderNews` continua a usar `NEWS_FALLBACK` (fetch em background, dados em localStorage mas não renderizados)
   - Monitor 48h: que items vêm dos feeds? Há junk? Há false positives?
   - Ajustar keywords / blocked via commits.

8. **Step 8 — Flip news live**
   - `renderNews` passa a preferir o cache fresh
   - Update footer disclaimer (Worker, IPs, privacy)
   - Update CLAUDE.md secção privacy

9. **Step 9 — Observability** *(opcional)*
   - GitHub Action que corre `curl /health` a cada 6h, abre issue se falhar 3× seguidas
   - Action diária que abre PR com snapshot de `/news` para audit trail manual

---

## CSS / Mobile — detalhes

### Desktop (≥ 881px)
- Grid `repeat(auto-fit, minmax(280px, 1fr))` com max 3 colunas
- Filter chips horizontais, gap 8px
- Card: padding 24px, title font-serif italic 18px (match `.medida-card-title`)

### Mobile (≤ 880px)
- Grid colapsa a 1 coluna
- Filter chips: `flex-wrap: wrap`, podem ocupar 2 linhas
- Card padding 18px
- Filter row scroll horizontal se preferível (decidir no Step 1)
- Botão "ver todas" full-width

### Tokens reutilizados (zero novas variáveis CSS)
- Background card: `var(--surf)`
- Border: `var(--border)`
- Tag colour: `var(--mid)` em `rgba(196,114,74,0.12)` (mesmo padrão `.mq-tag` linha 255)
- Title: `var(--serif)` italic + `var(--deep)`
- Date relative: `var(--soft)` font-size 10px letter-spacing 0.08em

---

## Error handling matrix

| Cenário | Detecção | Resposta |
|---|---|---|
| Worker 5xx / network error | fetch rejeita ou `r.ok === false` | usa stale cache; se ausente, `NEWS_FALLBACK`. Console.warn em debug. |
| Worker 429 (rate limited) | status 429 | usa cache; não retenta < 15min. |
| BPstat upstream 503 | Worker serve edge cache, client não vê | — |
| RSS feed schema change | Worker filtra esse feed, outros mantêm | lista mais curta, sem erro. |
| JSON malformado vindo do Worker | `try/catch JSON.parse` | fallback. |
| Timeout fetch (> 5s) | `AbortController` | fallback. |
| CORS rejeitado | fetch throws | fallback. Console.error (bug de deploy). |
| `localStorage` unavailable (Safari private mode, quota) | `try/catch setItem` | skip cache, fetch directo. |
| Shape inválido (typeof check fail) | validação client | fallback. |
| Cloudflare-wide outage | fetch falha | fallback. |
| Network offline | navigator.onLine === false | fallback imediato, sem fetch. |

**Regras invariantes:**
- Nunca substituir dados bons por dados maus (parse fail mantém cache).
- Live-dot vira static dot quando data > 24h.
- Nenhuma mensagem de erro visível ao utilizador final. Tudo silencioso.

---

## Testing checklist

### Smoke tests manuais (pre-deploy)

- [ ] **Network offline (DevTools)**: page renderiza fallback, console limpo aos olhos do user
- [ ] **Slow 3G throttle**: fallback aparece primeiro, dados frescos chegam depois sem flash
- [ ] **`localStorage.clear()` + reload**: first-paint não bloqueia em network
- [ ] **localStorage corrompido**: `localStorage.setItem('spotcredit:news', 'lixo{')` → reload não crasha
- [ ] **Quota exceeded**: encher localStorage até 5MB → page funciona, fetch graceful
- [ ] **Safari private mode (iOS Simulator + real device)**: writes lançam, try/catch absorve
- [ ] **CSP regressão**: reverter `connect-src 'none'` em staging → page funciona com fallback apenas
- [ ] **Lang toggle**: PT↔EN com dados frescos E com fallback — ambos os estados traduzem
- [ ] **Mobile 375px (iPhone SE)**: filter chips wrap, cards stack, "ver todas" full-width
- [ ] **Mobile 414px, 768px, 1024px, 1440px**: visual coerente
- [ ] **Lighthouse perf**: garantir que CLS não dispara (fallback render imediato, swap suave)
- [ ] **Debug mode `?debug=1`**: console mostra cache hit/miss e source-of-truth por endpoint

### Worker-specific

- [ ] **wrangler dev local**: `/euribor` retorna JSON válido com fallback se BPstat down
- [ ] **wrangler tail prod**: monitorizar 1h após deploy, sem erros não tratados
- [ ] **`curl https://data.spotcredit.org/health` → 200 ok**
- [ ] **`curl /euribor`**: shape correcto, headers CORS, Cache-Control 21600
- [ ] **`curl /news`**: items respeitam keyword filter, blocked.json excluído, pinned no topo
- [ ] **Stress test (artilleryjs ou ab)**: 1000 req em 60s → edge cache absorve, Worker invocations < 5

### Privacy / security

- [ ] **DevTools Network**: confirmar que apenas requests para `spotcredit.org` e `data.spotcredit.org` saem. Nada de Google Analytics, etc.
- [ ] **Inputs do simulador (rendimento, valor) nunca aparecem em request body**
- [ ] **Worker logs**: confirmar que não estamos a `console.log(request.headers)` (IPs)
- [ ] **CORS**: tentar fetch de outro domínio (curl com Origin diferente) → bloqueado

### Regression

- [ ] **Simulador continua a calcular igual** (LIVE_DATA fallback dá os mesmos números que hoje)
- [ ] **`./deploy.sh` continua a funcionar** sem alterações forçadas
- [ ] **Disclaimer no footer continua visível e cobre os novos fluxos**

---

## Rollback plan (ordem de blast radius)

1. **Client kill-switch instantâneo**: `LIVE_INTEGRATION = { euribor: false, news: false }` → `scp index.html` → 30s. Volta ao comportamento estático original.
2. **Worker rollback**: Cloudflare dashboard → Workers → Deployments → Rollback to previous. 1 click.
3. **CSP rollback**: descomentar linha antiga `connect-src 'none'`, comentar a nova → `nginx -t && systemctl reload nginx`.
4. **Full revert**: `git revert <commit>` + redeploy.

Cada step deploy é independente — podes desligar só news, só euribor, ou os dois mantendo a infra intacta.

---

## Privacidade — comunicação honesta

Update à secção "Privacidade" do CLAUDE.md e ao footer disclaimer:

> *O carregamento de Euribor e notícias passa por um endpoint próprio (Cloudflare Worker em data.spotcredit.org). Esse endpoint pode ver o endereço IP do visitante mas **não recebe qualquer dado do simulador** (rendimento, valor do imóvel, ou qualquer input). Os IPs ficam apenas nos logs operacionais da Cloudflare (≤ 24h) e nunca são guardados pelo SpotCredit. Os inputs do simulador continuam 100% no browser do utilizador.*

Mitigações no Worker:
- Não ler `request.headers.get('cf-connecting-ip')` em código próprio (não logar).
- Sem cookies, sem fingerprinting, sem analytics.
- CORS estrito (só `https://spotcredit.org`).

---

## Riscos identificados

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| RSS feed URLs assumidas não existirem | Alta | Médio | Verificar cada URL manualmente no Step 6. Fallback feeds. |
| Junk no filtro keywords | Média | Baixo | Layered filter + blocked.json editável via commit. PR de auditoria diário. |
| Cloudflare outage | Baixa | Médio | Fallback hardcoded sempre presente. Page funciona offline. |
| Custos CF excedidos free tier | Muito baixa | Baixo | Edge cache 6h reduz invocations dramaticamente. Alertas no dashboard. |
| Keyword false negatives perdem notícias importantes | Média | Médio | `pinned.json` para manual override. |
| BPstat schema change | Baixa | Médio | Worker valida shape, devolve fallback se inválido. |
| Performance regressão | Baixa | Baixo | First paint usa fallback síncrono, fetch é background. |
| Privacidade percebida como diluída | Média | Médio | Disclaimer honesto no footer + CLAUDE.md update. |

---

## Open questions / decisões para o utilizador antes de começar Step 3

1. **Repo público?** O Worker vai ler `pinned.json` / `blocked.json` via `raw.githubusercontent.com`. Isto requer o repo ser público (ou usar um token CF KV em vez disso). Confirmar se SpotCredit é público no GitHub.
2. **Conta Cloudflare separada?** A free tier dá 100k invocations/dia — chega. Tens conta CF ligada ao domínio (Flexible SSL confirma que sim). Precisamos só do account_id para o wrangler.toml.
3. **Subdomínio `data.spotcredit.org`** confirmado ou preferes outro (`api.`, `live.`)? Eu prefiro `data.` por ser mais honesto sobre escopo (não é uma API pública para terceiros).
4. **Lista inicial de RSS feeds**: confirmas que verificas as URLs antes do Step 6, ou queres que eu corra um script de teste em planning posterior?
5. **Seed news items**: queres que eu invente 5-7 items semente para o `NEWS_FALLBACK` baseados em factos OE2026 que já estão no projecto, ou preferes meter tu items reais que conheces?

---

## Verification end-to-end

Depois do Step 8 (news live), validação completa:

1. Abre `https://spotcredit.org` em browser limpo (limpa localStorage primeiro)
2. **Primeira visita**: secção news deve aparecer com fallback em ≤ 200ms, swap para dados frescos em ≤ 2s sem layout shift
3. **Segunda visita** (refresh em 5 minutos): cache hit, render instantâneo (0 network)
4. **Visita após 7h**: cache stale → render imediato com indicador subtil → revalidate → swap
5. **Filtros**: cada chip filtra correctamente, "Todas" reset, contagem visível por chip
6. **Mobile** (iPhone Safari): tudo legível, touchable, sem overflow horizontal
7. **PT↔EN toggle**: títulos das secções, labels dos chips, "há X dias" → "X days ago"
8. **Worker `/health`**: monitor manual semanal nas primeiras 4 semanas
9. **Audit log** (se Action criada no Step 9): PR diário aberto com snapshot, merge ou ajuste de pinned/blocked

Pass criteria: zero erros no console em curso normal, page render fallback em ≤ 200ms mesmo offline, fetch successful rate > 95% sobre 7 dias.

---

## Critical files reference

- `/Users/nunocoelho/Projects/SpotCredit/index.html` — todo o frontend (1439 linhas)
- `/Users/nunocoelho/Projects/SpotCredit/nginx/spotcredit.conf` — CSP relax
- `/Users/nunocoelho/Projects/SpotCredit/deploy.sh` — adicionar `pinned.json` + `blocked.json` ao scp
- `/Users/nunocoelho/Projects/SpotCredit/CLAUDE.md` — actualizar regras (Dados / Privacidade)
- `/Users/nunocoelho/Projects/SpotCredit/.github/workflows/` — criar `news-preview.yml` (opcional)
- `/Users/nunocoelho/Projects/SpotCredit/worker/` (novo) — código + config do Cloudflare Worker
- `/Users/nunocoelho/Projects/SpotCredit/pinned.json` (novo) — moderation
- `/Users/nunocoelho/Projects/SpotCredit/blocked.json` (novo) — moderation

**Funções existentes a reutilizar** (não criar novas):
- `toggleLang()` no index.html linha 1311 — extender para traduzir labels novas
- `renderPanel()` linha 1024 — modificar para usar fallback + fetch
- `.data-panel-live-dot` CSS linha 194 — reutilizar o componente "live dot" na header da news section
- Design tokens `--bg`, `--surf`, `--deep`, `--mid`, `--soft`, `--ink2`, `--border`, `--fine`, `--serif`, `--sans`, `--grotesk` linhas 15-35
