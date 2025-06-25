import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { handleRewardsCalculation } from '../lib/handler.js'
import { handleFetchOwnerRewards } from '../lib/handler.js'

export const app = new Hono()
app.use(
  '*',
  bearerAuth({
    verifyToken: (token, c) => {
      return token === c.env.SECRET_AUTH_REWARDS
    },
  }),
)

app.post('/calculate-rewards', async (c) => {
  await handleRewardsCalculation(c.env)
})

app.get('/owner-rewards', async (c) => {
  await handleFetchOwnerRewards(c.env)
})

export default app
