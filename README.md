# CréditoPT

> Simulador de crédito habitação para Portugal — taxas reais, Euribor actualizada, medidas jovem 2026.

**[creditopt.io](https://creditopt.io)**

---

## O que é

CréditoPT é uma página estática, sem dependências de servidor, que permite simular a prestação mensal de um crédito habitação com base nas taxas e condições reais publicadas pelos principais bancos portugueses.

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
- [Google Fonts](https://fonts.google.com/) — Lora + DM Sans

Nenhum framework, nenhum bundler, nenhum processo de build.

---

## Deploy

### Opção A — GitHub Pages (recomendado)

```bash
git init
git add .
git commit -m "init: CréditoPT"
git branch -M main
git remote add origin https://github.com/teu-user/creditopt.git
git push -u origin main
```

Activa GitHub Pages em **Settings → Pages → Source: main / root**.  
Em seguida, aponta o domínio `creditopt.io` nas definições de DNS do teu registar:

```
A     @    185.199.108.153
A     @    185.199.109.153
A     @    185.199.110.153
A     @    185.199.111.153
CNAME www  teu-user.github.io
```

Adiciona um ficheiro `CNAME` na raiz do repositório com:
```
creditopt.io
```

### Opção B — Netlify / Vercel

Arrasta o ficheiro `index.html` para o painel do Netlify (drop zone) ou usa o CLI:

```bash
# Netlify
npx netlify-cli deploy --prod --dir .

# Vercel
npx vercel --prod
```

---

## Manutenção

### Actualizar taxas Euribor

Edita as três constantes no topo do bloco `<script>` em `index.html`:

```js
const EUR = { 3: 2.109, 6: 2.322, 12: 2.565 };
```

E os chips no hero e ticker:

```html
<span class="tag">Euribor 6m: 2,462%</span>
<span class="ticker-rate-val">2,462%</span>
```

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
