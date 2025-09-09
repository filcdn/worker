#/bin/bash -e

# Change the working directory to `db`
cd "$(dirname "$(readlink -f "$0")")"

# Add monorepo's node_modules to the PATH
PATH=../node_modules/.bin:$PATH

ENV=mainnet
DB=filcdn-$ENV-db

if ! wrangler d1 list | grep -q "$DB"; then
  wrangler d1 create "$DB" --env "$ENV"
fi
wrangler d1 migrations apply "$DB" --remote --env "$ENV"
