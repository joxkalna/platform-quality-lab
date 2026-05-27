import { expect, test } from '@playwright/test'

import { ClassifyPage } from './pages/classify.page'

test.describe('Classify — Mocked Backend Scenarios', () => {
  let classifyPage: ClassifyPage

  test.beforeEach(async ({ page }) => {
    classifyPage = new ClassifyPage(page)
  })

  test('shows result when backend responds successfully', async ({ page }) => {
    await page.route('**/api/classify', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'service-a',
          classification: { category: 'critical', confidence: 0.95, model: 'llama3.2:1b' },
        }),
      }),
    )

    await classifyPage.goto()
    await classifyPage.classify('server is completely down')

    const result = await classifyPage.getResult()
    expect(result.category).toBe('critical')
    expect(result.confidence).toContain('95')
  })

  test('shows error when backend returns 502', async ({ page }) => {
    await page.route('**/api/classify', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Failed to reach service-c' }),
      }),
    )

    await classifyPage.goto()
    await classifyPage.classify('some text to classify')

    const error = await classifyPage.getError()
    expect(error).toContain('502')
  })

  test('shows error on network failure (service unreachable)', async ({ page }) => {
    await page.route('**/api/classify', (route) => route.abort('connectionrefused'))

    await classifyPage.goto()
    await classifyPage.classify('test input')

    const error = await classifyPage.getError()
    expect(error).toBeTruthy()
  })

  test('handles slow backend response without hanging', async ({ page }) => {
    await page.route('**/api/classify', async (route) => {
      await new Promise((r) => setTimeout(r, 3000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          source: 'service-a',
          classification: { category: 'warning', confidence: 0.7, model: 'llama3.2:1b' },
        }),
      })
    })

    await classifyPage.goto()
    await classifyPage.classify('response times degraded')

    // Should show loading state
    expect(await classifyPage.isLoading()).toBe(true)

    // Should eventually show result
    const result = await classifyPage.getResult()
    expect(result.category).toBe('warning')
  })

  test('shows error when backend returns malformed JSON', async ({ page }) => {
    await page.route('**/api/classify', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'not valid json{{{',
      }),
    )

    await classifyPage.goto()
    await classifyPage.classify('some text')

    const error = await classifyPage.getError()
    expect(error).toBeTruthy()
  })
})
