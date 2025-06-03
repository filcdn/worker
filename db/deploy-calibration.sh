#/bin/bash -e

# Change the working directory to `db`
cd "$(dirname "$(readlink -f "$0")")"

# Add monorepo's node_modules to the PATH
PATH=../node_modules/.bin:$PATH

if ! wrangler d1 list | grep -q filcdn-db; then
  wrangler d1 create filcdn-db --env calibration
fi
wrangler d1 migrations apply filcdn-db --remote --env calibration
