#/bin/bash -e

# Change the working directory to `db`
cd "$(dirname "$(readlink -f "$0")")"

# Add monorepo's node_modules to the PATH
PATH=../node_modules/.bin:$PATH

DB=filcdn-mainnet-db
ENV=mainnet

if ! wrangler d1 list | grep -q "$DB"; then
  wrangler d1 create "$DB" --env "$ENV"
fi
wrangler d1 migrations apply "$DB" --remote --env "$ENV"
