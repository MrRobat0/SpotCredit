#!/usr/bin/env bash
set -e

if [ ! -f .env.local ]; then
  echo "Error: .env.local not found. Create it with: echo 'VPS_IP=your.server.ip' > .env.local"
  exit 1
fi

source .env.local

if [ -z "$VPS_IP" ]; then
  echo "Error: VPS_IP not set in .env.local"
  exit 1
fi

echo "Deploying index.html → root@$VPS_IP"
scp index.html "root@$VPS_IP:/var/www/spotcredit/index.html"

echo "Deploying favicon/ → root@$VPS_IP"
scp -r favicon "root@$VPS_IP:/var/www/spotcredit/favicon"

echo "Done."
