# VPS Cron Setup — Netlify Function Runner

Purpose: run Netlify handlers on VPS via `scripts/run-netlify-function.mjs` using `/root/NovaCiv/.env`.

## Log Directory

- Logs go to `/var/log/novaciv_cron/*.log`

## Cron Schedule (Intended)

Use `crontab -e` on the VPS and add:

```bash
# News pipeline
30 * * * * cd /root/NovaCiv && ENV_PATH=/root/NovaCiv/.env node scripts/run-netlify-function.mjs fetch-news >> /var/log/novaciv_cron/fetch-news.log 2>&1
0 * * * * cd /root/NovaCiv && ENV_PATH=/root/NovaCiv/.env node scripts/run-netlify-function.mjs news-cron >> /var/log/novaciv_cron/news-cron.log 2>&1

# Domovoy pipeline
0 0 * * * cd /root/NovaCiv && ENV_PATH=/root/NovaCiv/.env node scripts/run-netlify-function.mjs domovoy-auto-post >> /var/log/novaciv_cron/domovoy-auto-post.log 2>&1
0 */3 * * * cd /root/NovaCiv && ENV_PATH=/root/NovaCiv/.env node scripts/run-netlify-function.mjs domovoy-every-3h >> /var/log/novaciv_cron/domovoy-every-3h.log 2>&1
*/10 * * * * cd /root/NovaCiv && ENV_PATH=/root/NovaCiv/.env node scripts/run-netlify-function.mjs domovoy-auto-reply >> /var/log/novaciv_cron/domovoy-auto-reply.log 2>&1
```

## Optional Manual Trigger

```bash
cd /root/NovaCiv
ENV_PATH=/root/NovaCiv/.env node scripts/run-netlify-function.mjs ops-run-now >> /var/log/novaciv_cron/ops-run-now.log 2>&1
```
