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

## Deploy — Hetzner VPS

### 1. Firewall (ufw)

```bash
ufw allow 22/tcp   # SSH
ufw allow 80/tcp   # HTTP (redirect para HTTPS)
ufw allow 443/tcp  # HTTPS
ufw enable
```

### 2. Instalar nginx + certbot

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
```

### 3. Copiar o site

```bash
mkdir -p /var/www/spotcredit
cp index.html /var/www/spotcredit/
chmod 755 /var/www/spotcredit
chmod 644 /var/www/spotcredit/index.html
```

### 4. Configurar nginx

```bash
cp nginx/spotcredit.conf /etc/nginx/sites-available/spotcredit.org
ln -s /etc/nginx/sites-available/spotcredit.org /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default       # remover default
nginx -t                                      # validar config
```

### 5. Obter certificado SSL (Let's Encrypt)

```bash
certbot --nginx -d spotcredit.org -d www.spotcredit.org
```

Certbot edita o bloco HTTP temporariamente para o ACME challenge, depois deixa os certs em `/etc/letsencrypt/live/spotcredit.org/`.

### 6. Activar

```bash
systemctl reload nginx
```

### Renovação automática (certbot)

O certbot instala um timer systemd ou cron automaticamente. Para verificar:

```bash
systemctl status certbot.timer
# ou
crontab -l | grep certbot
```

### Actualizar o site

```bash
cp index.html /var/www/spotcredit/index.html
```

Não é necessário reiniciar o nginx — o ficheiro é servido directamente do disco.

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
