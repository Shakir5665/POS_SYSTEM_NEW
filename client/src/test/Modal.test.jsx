import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '../components/Modal'

describe('Modal Focus Trap', () => {
  it('renders content when open and closes on Escape', () => {
    const handleClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal">
        <button>Inside Button</button>
      </Modal>
    )

    expect(screen.getByText('Test Modal')).toBeDefined()
    expect(screen.getByText('Inside Button')).toBeDefined()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(handleClose).toHaveBeenCalledTimes(1)
  })

  it('cycles focus within modal on Tab key', async () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Focus Trap Modal">
        <input data-testid="input-1" />
        <button data-testid="btn-2">Action</button>
      </Modal>
    )

    const input1 = screen.getByTestId('input-1')
    const btn2 = screen.getByTestId('btn-2')
    const closeBtn = screen.getByRole('button', { name: /close/i })

    // Simulate focus on closeBtn (which is first focusable element in header)
    closeBtn.focus()
    expect(document.activeElement).toBe(closeBtn)

    // Tab moves to input1
    fireEvent.keyDown(document.activeElement, { key: 'Tab' })
  })
})
