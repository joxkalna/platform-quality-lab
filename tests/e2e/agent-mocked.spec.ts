import { expect, test } from '@playwright/test'

test.describe('Agent — Mocked Backend Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('sends message and receives agent response', async ({ page }) => {
    await page.route('**/api/agent', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'service-a',
          agent: {
            response: 'I can help you track your order. What is your order number?',
            intent: 'order_tracking',
            confidence: 0.91,
          },
        }),
      }),
    )

    const input = page.getByLabel('Message input')
    await input.fill('where is my order')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText('track your order')).toBeVisible()
    await expect(page.getByText('order_tracking')).toBeVisible()
  })

  test('shows error when agent service is down', async ({ page }) => {
    await page.route('**/api/agent', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to reach agent service' }),
      }),
    )

    const input = page.getByLabel('Message input')
    await input.fill('help me')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText(/Agent request failed: 502/)).toBeVisible()
  })

  test('shows error on network failure', async ({ page }) => {
    await page.route('**/api/agent', (route) => route.abort('connectionrefused'))

    const input = page.getByLabel('Message input')
    await input.fill('hello')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText(/Agent request failed/)).toBeVisible()
  })

  test('shows thinking state during slow LLM response', async ({ page }) => {
    await page.route('**/api/agent', async (route) => {
      await new Promise((r) => setTimeout(r, 3000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'service-a',
          agent: { response: 'Here is your answer.', intent: 'general_help', confidence: 0.88 },
        }),
      })
    })

    const input = page.getByLabel('Message input')
    await input.fill('help')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText(/thinking/i)).toBeVisible()
    await expect(page.getByText('Here is your answer.')).toBeVisible({ timeout: 10_000 })
  })

  test('handles multi-turn conversation', async ({ page }) => {
    let callCount = 0
    await page.route('**/api/agent', (route) => {
      callCount++
      const responses = [
        { response: 'What is your order number?', intent: 'order_tracking', confidence: 0.9 },
        { response: 'Order #123 is out for delivery.', intent: 'order_status', confidence: 0.95 },
      ]
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ source: 'service-a', agent: responses[callCount - 1] }),
      })
    })

    const input = page.getByLabel('Message input')

    await input.fill('track my order')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('What is your order number?')).toBeVisible()

    await input.fill('123')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('out for delivery')).toBeVisible()
  })

  test('handles malformed response from LLM', async ({ page }) => {
    await page.route('**/api/agent', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"broken json',
      }),
    )

    const input = page.getByLabel('Message input')
    await input.fill('test')
    await page.getByRole('button', { name: 'Send' }).click()

    await expect(page.getByText(/Agent request failed/)).toBeVisible()
  })
})
