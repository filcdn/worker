#/bin/bash -e

PATH=./node_modules/.bin:$PATH

envsubst < wrangler.toml > wrangler.toml.tmp && mv wrangler.toml.tmp wrangler.toml
if ! wrangler d1 list | grep -q filcdn-db; then
  wrangler d1 create filcdn-db
fi
wrangler d1 migrations apply filcdn-db
