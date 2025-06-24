import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'

export const app = new Hono()
app.use(
  '*',
  bearerAuth({
    verifyToken: (token, c) => {
      return token === c.env.SECRET_AUTH_REWARDS
    }
  })
)

app.post('/calculate-rewards', async (c) => {
  handleRewardsCalculation(c.env)
})

export default app