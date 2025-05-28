# FilCDN Cloudflare Worker

[Cloudflare worker](https://developers.cloudflare.com/workers/) used to retrieve
and cache from the Filecoin PDP Storage Providers.

## Development

1. Install dependencies

```
npm install
```

2. Edit environment variables inside `wrangler.toml` files

3. Run your worker

```
npm run dev
```

5. Run tests

```
npm test
```

## Deployment (Github Actions)

In order to deploy your worker via Github Actions, you need to have a
[Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).

Add generated API token to Github secrets as `CLOUDFLARE_API_TOKEN`.

After setting up secrets, you can push your code to Github and worker will be
deployed to production environment automatically.
