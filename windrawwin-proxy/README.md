# WinDrawWin proxy for SimuladorFutebol

This is a small Cloudflare Worker that fetches ordinary, publicly accessible HTML pages from WinDrawWin and relays them to the simulator. It does not bypass login, CAPTCHA, bot challenges, rate limits, or access controls. It does not rotate IPs or forge browser fingerprints.

## Endpoints

- `GET /health` — service health.
- `GET /page?path=/predictions/today` — fetch an allowed public WinDrawWin HTML page.

The first version deliberately returns the upstream HTML unchanged. The next integration step is to inspect the actual public page markup and build narrowly-scoped parsers for the statistics that are visibly published. Missing fields must remain null, never zero.

## Deploy

The repository includes a GitHub Actions workflow. In GitHub, open **Settings → Secrets and variables → Actions** and add:

- `CLOUDFLARE_API_TOKEN` — an API token with Cloudflare Workers Scripts edit permission for the target account.
- `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID.

Pushing a change under `windrawwin-proxy/` runs the deployment workflow. The Worker name is `simuladorfutebol-windrawwin-proxy`; its URL will be `https://simuladorfutebol-windrawwin-proxy.<your-workers-subdomain>.workers.dev` when Workers Dev is enabled.

After the first successful deployment, put that exact URL in `config.js` as `windrawwinProxyUrl`. Do not paste the API token into the source code or into ChatGPT.

The Worker currently allows browser requests from `https://simuladorfutebol.onrender.com`. If the production domain changes, update `ALLOWED_ORIGINS` in `src/index.js`.

## Notes

- Upstream requests use ordinary GET requests with no session cookies or authentication.
- Responses are cached for 15 minutes to reduce repeated upstream traffic.
- The upstream page may change or refuse requests. In that case the proxy returns an explicit error; it does not try to evade the refusal.
- WinDrawWin's disclaimer asks parties wishing to reproduce original material to contact them. Confirm permission before storing or republishing substantial datasets.
