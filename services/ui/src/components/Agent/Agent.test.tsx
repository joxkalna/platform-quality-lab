import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'

import {
  agentErrorHandler,
  agentNetworkErrorHandler,
  agentSlowHandler,
} from '../../mocks/handlers/agent'
import { server } from '../../mocks/server'
import { Agent } from './Agent'

describe('Agent', () => {
  it('shows empty state message initially', () => {
    render(<Agent />)
    expect(screen.getByText(/ask me anything/i)).toBeInTheDocument()
  })

  it('disables send button when input is empty', () => {
    render(<Agent />)
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled()
  })

  it('sends message and displays agent response', async () => {
    render(<Agent />)

    await userEvent.type(screen.getByLabelText(/message input/i), 'check order status')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(screen.getByText(/track your order/i)).toBeInTheDocument()
      expect(screen.getByText(/order_tracking/i)).toBeInTheDocument()
    })
  })

  it('displays user message in chat history', async () => {
    render(<Agent />)

    await userEvent.type(screen.getByLabelText(/message input/i), 'hello')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('clears input after sending', async () => {
    render(<Agent />)

    const input = screen.getByLabelText(/message input/i)
    await userEvent.type(input, 'test message')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    expect(input).toHaveValue('')
  })

  it('shows thinking state while waiting for response', async () => {
    server.use(agentSlowHandler)
    render(<Agent />)

    await userEvent.type(screen.getByLabelText(/message input/i), 'help')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    expect(screen.getByText(/thinking/i)).toBeInTheDocument()
  })

  it('displays error when agent returns 502', async () => {
    server.use(agentErrorHandler)
    render(<Agent />)

    await userEvent.type(screen.getByLabelText(/message input/i), 'help me')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(screen.getByText(/Agent request failed: 502/)).toBeInTheDocument()
    })
  })

  it('displays error on network failure', async () => {
    server.use(
      http.post('/api/agent', () => HttpResponse.json(null, { status: 500 }))
    )
    render(<Agent />)

    await userEvent.type(screen.getByLabelText(/message input/i), 'hello')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('sends message on Enter key', async () => {
    render(<Agent />)

    const input = screen.getByLabelText(/message input/i)
    await userEvent.type(input, 'status{enter}')

    await waitFor(() => {
      expect(screen.getByText(/All services are currently operational/)).toBeInTheDocument()
    })
  })

  it('handles unknown intent gracefully', async () => {
    render(<Agent />)

    await userEvent.type(screen.getByLabelText(/message input/i), 'xyzzy nonsense')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(screen.getByText(/not sure I understand/i)).toBeInTheDocument()
      expect(screen.getByText(/unknown/)).toBeInTheDocument()
    })
  })

  it('supports multi-turn conversation', async () => {
    render(<Agent />)

    const input = screen.getByLabelText(/message input/i)

    await userEvent.type(input, 'help')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(screen.getByText(/general_help/)).toBeInTheDocument())

    await userEvent.type(input, 'check order')
    await userEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(screen.getByText(/order_tracking/)).toBeInTheDocument())

    expect(screen.getByText('help')).toBeInTheDocument()
    expect(screen.getByText('check order')).toBeInTheDocument()
  })
})
