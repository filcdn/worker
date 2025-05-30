#/bin/bash -e

PATH=./node_modules/.bin:$PATH

if ! wrangler d1 list | grep -q filcdn-db; then
  wrangler d1 create filcdn-db --env production
fi
wrangler d1 migrations apply filcdn-db --remote --env production
