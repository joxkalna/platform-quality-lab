import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  classifyErrorHandler,
  classifyNetworkErrorHandler,
  classifySlowHandler,
} from '../../mocks/handlers/classify'
import { server } from '../../mocks/server'
import Classify from './Classify'

describe('Classify', () => {
  it('disables button when input is empty', () => {
    render(<Classify />)
    expect(screen.getByRole('button', { name: /classify/i })).toBeDisabled()
  })

  it('enables button when text is entered', async () => {
    render(<Classify />)
    await userEvent.type(screen.getByRole('textbox'), 'some text')
    expect(screen.getByRole('button', { name: /classify/i })).toBeEnabled()
  })

  it('displays result on successful classification', async () => {
    render(<Classify />)

    await userEvent.type(screen.getByRole('textbox'), 'server is down')
    await userEvent.click(screen.getByRole('button', { name: /classify/i }))

    await waitFor(() => {
      expect(screen.getByText('critical')).toBeInTheDocument()
      expect(screen.getByText('92.0%')).toBeInTheDocument()
      expect(screen.getByText('llama3.2:1b')).toBeInTheDocument()
    })
  })

  it('shows loading state during classification', async () => {
    server.use(classifySlowHandler)
    render(<Classify />)

    await userEvent.type(screen.getByRole('textbox'), 'test input')
    await userEvent.click(screen.getByRole('button', { name: /classify/i }))

    expect(screen.getByRole('button', { name: /classifying/i })).toBeDisabled()
  })

  it('displays error when backend returns 502', async () => {
    server.use(classifyErrorHandler)
    render(<Classify />)

    await userEvent.type(screen.getByRole('textbox'), 'some text')
    await userEvent.click(screen.getByRole('button', { name: /classify/i }))

    await waitFor(() => {
      expect(screen.getByText(/Classification failed: 502/)).toBeInTheDocument()
    })
  })

  it('displays error on network failure', async () => {
    server.use(classifyNetworkErrorHandler)
    render(<Classify />)

    await userEvent.type(screen.getByRole('textbox'), 'some text')
    await userEvent.click(screen.getByRole('button', { name: /classify/i }))

    await waitFor(() => {
      expect(screen.getByText(/Classification failed/)).toBeInTheDocument()
    })
  })

  it('populates input when example chip is clicked', async () => {
    render(<Classify />)
    const chip = screen.getAllByRole('button').find((b) => b.classList.contains('example-chip'))!
    await userEvent.click(chip)

    expect(screen.getByRole('textbox')).not.toHaveValue('')
  })

  it('clears result when input is emptied', async () => {
    render(<Classify />)

    await userEvent.type(screen.getByRole('textbox'), 'text')
    await userEvent.click(screen.getByRole('button', { name: /classify/i }))
    await waitFor(() => expect(screen.getByText('critical')).toBeInTheDocument())

    await userEvent.clear(screen.getByRole('textbox'))
    expect(screen.queryByText('critical')).not.toBeInTheDocument()
  })
})
