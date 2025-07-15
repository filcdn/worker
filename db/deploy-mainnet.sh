#/bin/bash -e

# Change the working directory to `db`
cd "$(dirname "$(readlink -f "$0")")"

# Add monorepo's node_modules to the PATH
PATH=../node_modules/.bin:$PATH

if ! wrangler d1 list --env mainnet | grep -q filcdn-mainnet-db; then
  wrangler d1 create filcdn-mainnet-db --env mainnet
fi
wrangler d1 migrations apply filcdn-mainnet-db --remote --env mainnet
