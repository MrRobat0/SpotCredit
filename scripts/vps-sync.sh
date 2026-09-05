#!/usr/bin/env bash
# ╔════════════════════════════════════════════════════════════════════════╗
# ║  vps-sync.sh — corre NO VPS, por cron. Fecha o ciclo automático:       ║
# ║  o GitHub Actions faz commit da Euribor nova, isto puxa e publica.     ║
# ║                                                                        ║
# ║  Só lê do GitHub (repo público, HTTPS) — não precisa de chave nenhuma. ║
# ║  Não faz nada se não houver commits novos.                             ║
# ║                                                                        ║
# ║  Instalação (uma vez, como root no VPS):                               ║
# ║    git clone https://github.com/MrRobat0/SpotCredit.git /srv/spotcredit ║
# ║    install -m 0755 /srv/spotcredit/scripts/vps-sync.sh /usr/local/bin/ ║
# ║    ( crontab -l 2>/dev/null; \                                         ║
# ║      echo '*/30 * * * * /usr/local/bin/vps-sync.sh' ) | crontab -      ║
# ╚════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

REPO_DIR="${REPO_DIR:-/srv/spotcredit}"
WEB_DIR="${WEB_DIR:-/var/www/spotcredit}"
BRANCH="${BRANCH:-main}"

log() { logger -t spotcredit-sync "$*"; echo "$*"; }

[ -d "$REPO_DIR/.git" ] || { log "ERRO: $REPO_DIR não é um clone git"; exit 1; }
[ -d "$WEB_DIR" ]       || { log "ERRO: $WEB_DIR não existe"; exit 1; }

git -C "$REPO_DIR" fetch --quiet origin "$BRANCH"

local_sha=$(git -C "$REPO_DIR" rev-parse HEAD)
remote_sha=$(git -C "$REPO_DIR" rev-parse "origin/$BRANCH")

[ "$local_sha" = "$remote_sha" ] || git -C "$REPO_DIR" reset --hard --quiet "origin/$BRANCH"

# A decisão de publicar é pelo CONTEÚDO, não pelo SHA: no primeiro arranque o
# clone já vem com o HEAD certo, mas o webroot ainda tem a versão antiga. Comparar
# ficheiros cobre esse caso e também um deploy manual que tenha divergido.
if cmp -s "$REPO_DIR/index.html" "$WEB_DIR/index.html" \
   && diff -rq "$REPO_DIR/favicon" "$WEB_DIR/favicon" >/dev/null 2>&1; then
  exit 0   # webroot já em dia, sai em silêncio
fi

# Publica só o que o site serve — nunca a árvore inteira do repo.
install -m 0644 "$REPO_DIR/index.html" "$WEB_DIR/index.html"
rsync -a --delete "$REPO_DIR/favicon/" "$WEB_DIR/favicon/"

log "publicado $(git -C "$REPO_DIR" rev-parse --short HEAD)"
