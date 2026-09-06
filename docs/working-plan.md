# SpotCredit — Working Plan (living doc)

> Carry-forward notes across Claude Code sessions. Update the **Status** boxes and
> the **Update log** at the bottom whenever something changes. Source of truth for
> the three workstreams below: (1) honest daily rates + countdown, (2) credit
> breakdown section, (3) VPS/security hardening.

Last touched: **2026-06-21** · Branch: `main`

---

## 0. Decisions locked (2026-06-21)

| Topic | Decision |
|-------|----------|
| Rate cadence | **Once daily** (Euribor fixes once per business day, ~11:00 CET, published by EMMI). A 2nd daily slot would show identical numbers — rejected. |
| Countdown target | Next **business-day** update slot. Weekends/holidays roll to next business day. |
| "Live" language | Drop all "tempo real" / "ao vivo" / "real-time" wording. Reframe as **daily** rates + "última actualização" timestamp. |
| Breakdown selection | **Click a bank row** in the results table to select; defaults to the "melhor taxa" (best) row. |
| Security this session | **Document only.** No nginx/server drafts. (Phases tracked in §3.) |

---

## 1. Honest daily rates + countdown timer

### Why
The rates are **not live**. `LIVE_DATA` (`index.html:1012`) is a hardcoded object edited
by hand on commit. The nginx CSP sets `connect-src 'none'` (`nginx/spotcredit.conf:52`),
so the page physically cannot fetch anything. CLAUDE.md also forbids scraping bank sites
(only Euribor may come from an official source) and forbids advertising real-time when it
isn't. So the current copy is both inaccurate and against our own rules.

### Misleading strings to fix (with line refs)
- `index.html:730` — `Taxas ao vivo` → `Taxas diárias`
- `index.html:760` — `...ABANCA — taxas em tempo real` → `...— actualização diária`
- `index.html:935-936` — "Euribor actualizada / Actualizamos regularmente" → tighten to "diária"
- `index.html:1337` — JS string `taxas em tempo real` → `actualização diária`
- `index.html:1370` — JS string `Taxas ao vivo` / `Live rates` → `Taxas diárias` / `Daily rates`
- `index.html:1383-1387` — "Taxas diárias... Actualizamos regularmente" → keep "diária", drop "regularmente"
- Keep the green `data-panel-live-dot` but it now signals "daily", not "live".

### Data model change (`LIVE_DATA`)
Add explicit update metadata so the countdown is computed, not faked:
```js
const LIVE_DATA = {
  // ...existing eur3/6/12, deltas, bce...
  date:        '29 Abr 2026',          // human display (keep)
  updatedAt:   '2026-04-29T09:00:00',  // NEW: ISO, last real update (Europe/Lisbon)
  updateHour:  9,                       // NEW: daily scheduled slot, local hour (09:00)
  // tz is implicitly Europe/Lisbon
};
```

### Countdown logic (vanilla JS, no deps)
- Compute next slot = today at `updateHour:00` local; if already past, roll to tomorrow.
- If the resulting day is Sat/Sun, roll forward to Monday. (Optional: PT bank-holiday
  list — defer; weekend roll covers most cases.)
- Render `Próxima actualização prevista em HH:MM:SS`, `setInterval` 1s tick.
- **Honesty guard:** label it **"prevista"** (expected/scheduled), and always show
  `Actualizado <updatedAt>` next to it. The timestamp is the truth; the countdown is a
  promise we must keep by committing the update at `updateHour`. If we miss a day, the
  timestamp visibly goes stale — acceptable, and better than implying real-time.

### Operational responsibility
Once-daily countdown only stays honest if rates are actually refreshed each business day.
Update flow = edit `LIVE_DATA` (eur3/6/12, deltas, `date`, `updatedAt`) → dedicated commit
per CLAUDE.md (`"taxas: actualização <data>"`) → deploy via `deploy.sh`.

### Status
- [ ] Strings de-"live"d
- [ ] `LIVE_DATA` gains `updatedAt` / `updateHour`
- [ ] Countdown component built + rendered in panel header
- [ ] Tested across the day boundary + weekend roll

---

## 2. Credit breakdown section (under the calculator)

### Goal
Below the bank comparison table, a panel that breaks down the **one option the user
selected** so they understand the full cost — not just the monthly payment.

### Selection UX
- Bank rows (`index.html:1222-1235`, `.bank-row`) become clickable.
- Default selection = row `i === 0` (the "melhor taxa" / `.best` row).
- Clicking a row sets `selectedBankIndex`, re-renders the breakdown, and visually marks
  the active row. Re-running the simulation resets to best.

### Fields to show (reuse existing engine where possible)
| Field | Source / formula |
|-------|------------------|
| Produto escolhido | `b.nome` + `b.bonus` |
| Capital a financiar | `capital` (already computed) |
| Entrada | `vimovel - capital` |
| LTV | `ltv` (already computed) |
| TAN | `b.tan_fixa ?? EUR[ep] + b.spread` (see `index.html:1209`) |
| TAEG | `b.taeg` |
| Prestação mensal | `calcP(capital, tan, meses)` |
| Nº prestações | `meses` |
| **Total pago** (capital+juros) | `prest * meses` |
| **Juros totais** | `prest * meses - capital` |
| **MTIC** (Montante Total Imputado ao Consumidor) | `capital + juros totais + custos` |
| Custos iniciais | `calcPoupanca(vimovel, hpp)` → IMT, IS (0,8%), emolumentos (`index.html:1069-1078`) |
| Comissão amort. antecipada | variável 0,5% / fixa 2% (from `TAB_INFO`) |
| Seguros (nota) | vida + multirriscos — não quantificado, nota informativa |
| Taxa mista nota | prestação refere-se ao período fixo (`prazo_fixa`) |

### Notes / caveats
- For **mista**, the shown payment is the fixed-period payment; total-paid is an
  approximation (post-fixed phase depends on future Euribor). Label clearly as
  "estimativa do período fixo".
- Keep the standing disclaimer visible; breakdown is indicative.
- This **touches the calc engine** → per CLAUDE.md, get plan sign-off before the diff and
  test with 3 income profiles (1.000 / 2.500 / 5.000 €) × residente vs não-residente.

### Status
- [ ] Plan approved for engine-touching change
- [ ] Rows clickable + `selectedBankIndex` state
- [ ] Breakdown panel HTML/CSS (matches design tokens: Lora/DM Sans, `#1F3A2E`)
- [ ] Total pago / juros totais / MTIC wired
- [ ] PT + EN strings
- [ ] Tested across 3 profiles × residency × variável/mista/fixa

---

## 3. VPS / security hardening (Hetzner + Cloudflare)

As notas de infraestrutura e segurança vivem **fora do git**, em
`docs/security.local.md` (gitignored), e na memória pessoal
`project_hetzner_hardening.md`. Um repositório público não é sítio para o
inventário do que está e do que não está aplicado num servidor.

Estado resumido: origem atrás da Cloudflare, com Hetzner Cloud Firewall à frente.
As fases de hardening e o respectivo estado estão no ficheiro local.

---

## 4. Suggested build order (when we proceed)
1. **Honest-rates strings** (§1) — zero risk, no engine touch. Do first.
2. **Countdown timer** (§1) — additive, no engine touch.
3. **Breakdown section** (§2) — engine-adjacent; plan sign-off + 3-profile test.
4. **Security Phase 2** (§3) — separate session/commit; needs server access + reload.

---

## 5. Deployment runbook (go-live)

The site is a single static `index.html` served by nginx from `/var/www/spotcredit/`.
There is **no build step**. "Going live" = get the new `index.html` (and/or nginx config)
onto the VPS and reload nginx.

### A. Normal content deploy (rates / index.html) — from your LAPTOP
This is the everyday path (e.g. daily rate update). Uses `deploy.sh` (scp):
```bash
# one-time: create .env.local with the server IP (gitignored, never commit)
# (obsoleto) o deploy passou a ser git push — ver README, secção Deploy

# after editing index.html:
git add index.html && git commit -m "taxas: actualização 21 Jun 2026"
git push           # o VPS puxa do main e publica (cron */30)
```
No nginx reload needed for content-only changes (static file is re-read each request).
> Note: `deploy.sh` connects to the IP. Because of the Phase 1 firewall, SSH/scp only
> works from your home IP. If your home IP changed, fix Firewall Rule 1 in the Hetzner
> web console first (see §3 / memory).

### B. When SSH'd INTO the Hetzner server — on-server commands
SSH in (only works from your whitelisted home IP):
```bash
ssh root@your.server.ip
```

**B1. Update the site content directly on the server (manual):**
```bash
cd /var/www/spotcredit
# pull from git if the server has a clone, OR receive via scp from laptop (path A).
# If editing in place (not recommended — bypasses git):
nano index.html
```

**B2. Change / deploy the nginx config (e.g. applying Phase 2 real_ip):**
```bash
# copy the new config into place (from laptop: scp nginx/spotcredit.conf root@IP:/tmp/)
cp /tmp/spotcredit.conf /etc/nginx/sites-available/spotcredit.org

# ensure it's enabled (symlink — usually already exists)
ln -sf /etc/nginx/sites-available/spotcredit.org /etc/nginx/sites-enabled/spotcredit.org

# TEST the config BEFORE reloading — never skip this
nginx -t

# if "syntax is ok / test is successful":
systemctl reload nginx     # graceful, no dropped connections

# verify it's serving + healthy
systemctl status nginx --no-pager
curl -I http://localhost/                       # expect 200, server: nginx (tokens off)
tail -f /var/log/nginx/spotcredit.access.log    # confirm real client IPs after Phase 2
tail -f /var/log/nginx/spotcredit.error.log
```

**B3. Phase 3 SSL (Origin Certificate) on-server — when you get there:**
```bash
mkdir -p /etc/ssl/spotcredit
# paste CF Origin cert + key (from CF dash → SSL/TLS → Origin Server):
nano /etc/ssl/spotcredit/origin.pem        # certificate
nano /etc/ssl/spotcredit/origin.key        # private key
chmod 600 /etc/ssl/spotcredit/origin.key
# then add `listen 443 ssl http2;` + cert paths + HTTP→HTTPS redirect to the config,
# nginx -t, systemctl reload nginx, and switch CF SSL mode to Full (strict).
```

### C. First-time / from-scratch provisioning (reference)
If the server is ever rebuilt:
```bash
apt update && apt install -y nginx
mkdir -p /var/www/spotcredit
# place index.html (scp or git clone) into /var/www/spotcredit/
cp /tmp/spotcredit.conf /etc/nginx/sites-available/spotcredit.org
ln -sf /etc/nginx/sites-available/spotcredit.org /etc/nginx/sites-enabled/spotcredit.org
rm -f /etc/nginx/sites-enabled/default     # drop the default server block
nginx -t && systemctl enable --now nginx
# re-apply Hetzner Cloud Firewall (Phase 1) + Cloudflare DNS (orange cloud) + SSL mode.
```

### Rollback
```bash
# config rollback:
cp /etc/nginx/sites-available/spotcredit.org.bak /etc/nginx/sites-available/spotcredit.org
nginx -t && systemctl reload nginx
# content rollback: re-deploy a previous index.html from git (git checkout <sha> -- index.html)
```
> Tip: before editing the live config, snapshot it:
> `cp /etc/nginx/sites-available/spotcredit.org{,.bak}`

### Quick verification checklist after any deploy
- [ ] `nginx -t` passed (config changes only)
- [ ] `systemctl reload nginx` ran clean
- [ ] `https://spotcredit.org` returns 200 in a browser (via Cloudflare)
- [ ] Direct hit to the Hetzner IP is refused (firewall still up)
- [ ] Access log shows **real** visitor IPs (confirms Phase 2 if applied)

---

## Update log
- **2026-06-21** — Doc created. Locked decisions (§0). Found "live" rate strings are
  inaccurate (rates are manual; CSP blocks fetch). Security scoped to document-only this
  session. Phases 2 & 3 still pending; flagged uncommitted nginx SSL-strip diff.
- **2026-06-21** — Added §5 deployment runbook (laptop `deploy.sh` path + on-server
  nginx commands: `nginx -t` / `systemctl reload nginx`, logs, SSL, rollback, provisioning).
