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

**O deploy normal é `git push`.** O VPS puxa do `main` de 30 em 30 minutos e
publica (ver *Actualizar taxas Euribor* mais abaixo):

```bash
git add index.html && git commit -m "taxas: actualização <data>" && git push
```

Para não esperar pelo cron, força a corrida no servidor:

```bash
ssh -t vps 'sudo /usr/local/bin/vps-sync.sh'
```

Mudanças só de conteúdo **não** precisam de reload do nginx — o ficheiro estático
é relido a cada request.

`deploy.sh` continua a existir como via de emergência (envia a árvore local por
rsync, sem passar pelo git). Usa um alias `vps` definido no teu `~/.ssh/config` e
o acesso SSH só funciona a partir do teu IP de casa (regra da firewall, ver
abaixo). **Atenção**: o que ele publicar é revertido na corrida seguinte do cron,
porque a fonte de verdade passou a ser o `main`.

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
# do portátil: scp nginx/spotcredit.conf vps:/tmp/
sudo cp /tmp/spotcredit.conf /etc/nginx/sites-available/spotcredit.org
sudo ln -sf /etc/nginx/sites-available/spotcredit.org /etc/nginx/sites-enabled/spotcredit.org
sudo nginx -t                  # validar SEMPRE antes do reload
sudo systemctl reload nginx    # graceful, sem ligações perdidas
```

O runbook completo de servidor (provisioning de raiz, Origin cert, rollback) é
mantido em notas de deploy internas (não versionadas).

---

## Manutenção

### Actualizar taxas Euribor — automático

**Não é preciso fazer nada.** A Euribor actualiza-se sozinha:

```
GitHub Actions (dias úteis, 08:15 UTC)
  └─ scripts/update-euribor.mjs
       ├─ GET bpstat.bportugal.pt/api/observations/  (Banco de Portugal, sem chave)
       ├─ reescreve o bloco AUTO-EURIBOR do index.html
       └─ commit "taxas: Euribor média mensal de <mês> (BPstat, automático)"
                                    │
VPS (cron */30)                     ▼
  └─ scripts/vps-sync.sh — git pull + publica index.html e favicon/
```

O indexante é a **média mensal** publicada pelo Banco de Portugal (séries BPstat
13168436 / 13168438 / 13168437), que é o valor pelo qual os contratos portugueses
são revistos e o mesmo que os bancos citam nos exemplos representativos. O BPstat
publica-a nos primeiros dias úteis do mês seguinte; o job corre todos os dias úteis
e só faz commit quando há mês novo.

Guardas do script: recusa escrever se a API falhar, se os três prazos não
referirem o mesmo mês, se algum valor estiver fora de `[-2, 20]`, ou se o mês do
ficheiro já for igual ou mais recente. Nunca escreve dados parciais.

O bloco entre `/* AUTO-EURIBOR:START */` e `/* AUTO-EURIBOR:END */` em
`index.html` é gerado — **editar à mão não serve de nada**, a próxima corrida
sobrepõe-se. O campo `bce` fica fora do bloco porque continua editorial e manual.

Para forçar uma corrida: Actions → *Actualizar Euribor* → *Run workflow*.
Localmente: `node scripts/update-euribor.mjs --check` mostra o que faria sem escrever.

Se o painel deixar de ser actualizado, o próprio site denuncia-se: passados 45 dias
sem `updatedAt` novo, o ponto do painel fica vermelho e a linha de proveniência
avisa que os dados podem estar desactualizados.

#### Instalação do lado do VPS (uma vez)

```bash
sudo git clone https://github.com/MrRobat0/SpotCredit.git /srv/spotcredit
sudo install -m 0755 /srv/spotcredit/scripts/vps-sync.sh /usr/local/bin/vps-sync.sh
sudo /usr/local/bin/vps-sync.sh                      # primeira publicação, à mão
echo '*/30 * * * * root /usr/local/bin/vps-sync.sh' | sudo tee /etc/cron.d/spotcredit-sync
```

O script corre como root (escreve em `/srv` e no webroot); instala-se a partir de
qualquer conta com sudo.

> ⚠️ O cron corre a **cópia** em `/usr/local/bin/vps-sync.sh`, congelada no momento
> da instalação. O `git pull` actualiza `/srv/spotcredit` mas **não** o que corre.
> Depois de mexeres em `scripts/vps-sync.sh`, repete o `sudo install`. O corte é
> deliberado: assim um push para o GitHub nunca muda código que corre como root —
> só o conteúdo servido (`index.html` e `favicon/`). O agendamento vive em `/etc/cron.d/spotcredit-sync` em vez
do crontab do root — um ficheiro só, fácil de inspeccionar e de remover.

**Depois disto, `deploy.sh` deixa de ser a via normal de deploy**: o que está no
`main` é o que fica publicado, e um `scp`/`rsync` manual é revertido na corrida
seguinte. O deploy passa a ser `git push`.

O clone é por HTTPS de um repo público: o servidor só lê, não precisa de chave
nem de credenciais, e não há segredos guardados no GitHub.

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
