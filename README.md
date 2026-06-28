# SpotCredit

> Simulador de crédito habitação para Portugal — taxas reais, Euribor actualizada, medidas jovem 2026.

**[spotcredit.org](https://spotcredit.org)**

---

## O que é

SpotCredit é uma página estática, sem dependências de servidor, que permite simular a prestação mensal de um crédito habitação com base nas taxas e condições reais publicadas pelos principais bancos portugueses.

Não recolhe dados. Não requer registo. Tudo corre no browser.

---

## Funcionalidades

- **Simulador interactivo** com CGD, Millennium BCP, Bankinter e ABANCA
- **Taxas reais** (spreads e TAEG publicados pelos bancos)
- **Euribor actualizada** — 3m, 6m e 12m (taxa diária + média mensal para contratos)
- **Taxa de esforço** calculada em tempo real (regra do Banco de Portugal: ≤ 35–40%)
- **Três modalidades**: taxa variável, mista e fixa
- **Painel jovem ≤ 35 anos** com:
  - IMT Jovem + Imposto do Selo + Emolumentos (OE2026: isenção até 330.539 €)
  - Garantia Pública do Estado (financiamento 100%, contratos até 31 dez 2026)
  - IRS Jovem
- **Gráfico comparativo** de prestações por banco

---

## Stack

```
index.html     — página completa (HTML + CSS + JS, ficheiro único)
```

Dependências externas (CDN):
- [Chart.js 4.4.1](https://www.chartjs.org/) — gráfico de barras
- [Google Fonts](https://fonts.google.com/) — Cormorant Garamond + DM Sans + Space Grotesk

Nenhum framework, nenhum bundler, nenhum processo de build.

---

## Deploy

A produção corre num **VPS Hetzner** — nginx a servir o `index.html` estático de
`/var/www/spotcredit/` — **atrás da Cloudflare**, que faz o TLS público de
`https://spotcredit.org`. Não há build step: "ir para produção" = pôr o novo
`index.html` (e/ou a config nginx) no VPS.

> ⚠️ **SSL:** o certificado público é da **Cloudflare**, não Let's Encrypt na
> origem. A firewall só aceita as gamas de IP da Cloudflare, por isso os desafios
> HTTP-01 do Let's Encrypt nem sequer chegam à origem. O modo TLS entre a
> Cloudflare e a origem (e o plano de hardening para Full strict + Origin cert)
> é mantido em notas de deploy internas (não versionadas).

### Deploy de conteúdo (caso normal — ex. actualização de taxas)

A partir do portátil, depois de editar `index.html`:

```bash
# uma vez: cria .env.local com o IP do servidor (gitignored, nunca commitar)
echo 'VPS_IP=o.teu.ip' > .env.local

git add index.html && git commit -m "taxas: actualização <data>"
./deploy.sh        # scp index.html → root@$VPS_IP:/var/www/spotcredit/index.html
```

Mudanças só de conteúdo **não** precisam de reload do nginx — o ficheiro estático
é relido a cada request. O `scp`/SSH só funciona a partir do teu IP de casa
(regra da firewall, ver abaixo).

### Firewall (Hetzner Cloud Firewall, não `ufw`)

A Cloud Firewall da Hetzner tranca a origem para que nada lhe chegue
directamente:

- **SSH (22)** ← só o teu IP de casa
- **HTTP (80) + HTTPS (443)** ← só as gamas de IP da Cloudflare
- Acesso directo ao IP da Hetzner → ligação recusada (tudo passa pela Cloudflare)

Re-verificar as gamas da Cloudflare periodicamente (`cloudflare.com/ips-v4`);
actualizar o IP de casa na consola web da Hetzner se mudar.

### Mudar a config do nginx

```bash
# do portátil: scp nginx/spotcredit.conf root@$VPS_IP:/tmp/
cp /tmp/spotcredit.conf /etc/nginx/sites-available/spotcredit.org
ln -sf /etc/nginx/sites-available/spotcredit.org /etc/nginx/sites-enabled/spotcredit.org
nginx -t                  # validar SEMPRE antes do reload
systemctl reload nginx    # graceful, sem ligações perdidas
```

O runbook completo de servidor (provisioning de raiz, Origin cert, rollback) é
mantido em notas de deploy internas (não versionadas).

---

## Manutenção

### Actualizar taxas Euribor

Edita o objecto `LIVE_DATA` no bloco `<script>` em `index.html`. O `const EUR`
deriva daqui automaticamente — não há valores Euribor hardcoded noutro sítio:

```js
const LIVE_DATA = {
  date:   '29 Abr 2026',   // string mostrada no painel
  eur3:   2.149,
  eur6:   2.462,
  eur12:  2.769,
  // ...deltas (delta3/6/12, deltaLabel…) e nota do BCE
};
```

Actualiza também a data no disclaimer perto do fim do HTML
(`Taxas Euribor de 29 Abril 2026 · OE2026 em vigor`). Faz commit dedicado por
data — ex. `taxas: actualização 21 Jun 2026`.

### Actualizar spreads dos bancos

Array `BANKS` dentro do `<script>`. Cada entrada tem:

```js
{
  nome: 'CGD — com bonificação',
  idx: 6,          // indexante Euribor (3, 6 ou 12)
  spread: 0.85,    // spread do banco
  taeg: 3.8,       // TAEG publicada
  bonus: 'descrição das vendas associadas'
}
```

Para taxa mista ou fixa, substituir `spread` por `tan_fixa`.

### Actualizar limites IMT 2026

Tabela `IMT_HPP` — actualizar escalões e parcelas conforme publicação da AT no início de cada ano.

---

## Avisos legais

Os valores apresentados são meramente indicativos e baseados em informação pública. Não constituem aconselhamento financeiro nem proposta de crédito. A concessão de crédito está sempre sujeita a análise de risco pela instituição financeira.

---

## Licença

MIT — podes usar, modificar e redistribuir livremente com atribuição.
