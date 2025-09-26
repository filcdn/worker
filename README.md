# FilBeam Cloudflare Worker

[Cloudflare worker](https://developers.cloudflare.com/workers/) used to retrieve
and cache from the Filecoin PDP Service Providers.

## Development

### Initial setup

Create `indexer/.dev.vars` file with the following content:

```
SECRET_HEADER_KEY=X-SECRET-KEY
SECRET_HEADER_VALUE=SecretToken
```

### Workflow

1. Install dependencies

   ```
   npm install
   ```

2. Run tests

   ```
   npm test
   ```

3. Fix linting and formatting issues:

   ```
   npm run lint:fix
   ```

### Update auto-generated TypeScript definitions

After you make any change affecting the content of the `env` object, run the following command to update the auto-generated TypeScript definitions:

```
npm run build:types
```

### Run the Retriever worker locally

1. Choose a wallet address you will use for the requests, e.g. `0x123`.

2. Edit your `/etc/hosts` file and add an entry for `0x123.localhost`:

   ```
   127.0.0.1»foo.localhost
   ```

3. Start the retriever worker locally

   ```
   npm start -w retriever
   ```

### Run the Indexer worker locally

```
npm start -w indexer
```

### Reset the local database

Run the following command to reset the wrangler local environment, including the local database:

```sh
rm -rf  db/.wrangler
```

## Deployment (Github Actions)

In order to deploy your worker via Github Actions, you need to have a
[Cloudflare API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/).

Add generated API token to Github secrets as `CLOUDFLARE_API_TOKEN`.

After setting up secrets, you can push your code to Github and worker will be
deployed to production environment automatically.
