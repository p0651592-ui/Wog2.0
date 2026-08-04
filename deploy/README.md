# Server deployment for WOG Casino

## Environment file
Create `/root/Wog2.0/.env` on the server using the values below:

```env
APP_TITLE=WOG Casino Core Engine
PORT=10000
NODE_ENV=production
OWNER_ID=6682822292
BOT_TOKEN=YOUR_NEW_BOT_TOKEN
TELEGRAM_BOT_TOKEN=YOUR_NEW_BOT_TOKEN
TELEGRAM_CHAT_ID=-1004438070296
CORS_ORIGINS=https://wogcasino.tw1.su,https://www.wogcasino.tw1.su
```

## Start backend
```bash
cd /root/Wog2.0
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 10000
```

## Systemd
Copy `deploy/systemd/wog-casino.service` to `/etc/systemd/system/wog-casino.service` and run:
```bash
systemctl daemon-reload
systemctl enable --now wog-casino
systemctl status wog-casino --no-pager -l
```

## Nginx
Copy `deploy/nginx/wogcasino.tw1.su.conf` to `/etc/nginx/sites-available/wogcasino.tw1.su.conf`, create the symlink in `sites-enabled`, then run:
```bash
nginx -t
systemctl reload nginx
```

## Quick checks
```bash
curl -I http://127.0.0.1:10000/
curl -I https://wogcasino.tw1.su/
```
