import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '../components/Badge'

describe('Badge component', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText('Active')).toBeDefined()
  })

  it('applies default variant class when no variant given', () => {
    render(<Badge>Default</Badge>)
    const badge = screen.getByText('Default')
    expect(badge.className).toContain('bg-gray-100')
    expect(badge.className).toContain('text-gray-700')
  })

  it('applies success variant class', () => {
    render(<Badge variant="success">Active</Badge>)
    const badge = screen.getByText('Active')
    expect(badge.className).toContain('bg-success-100')
    expect(badge.className).toContain('text-success-700')
  })

  it('applies danger variant class', () => {
    render(<Badge variant="danger">Error</Badge>)
    const badge = screen.getByText('Error')
    expect(badge.className).toContain('bg-danger-100')
  })

  it('applies warning variant class', () => {
    render(<Badge variant="warning">Warning</Badge>)
    const badge = screen.getByText('Warning')
    expect(badge.className).toContain('bg-warning-100')
  })

  it('applies primary variant class', () => {
    render(<Badge variant="primary">Info</Badge>)
    const badge = screen.getByText('Info')
    expect(badge.className).toContain('bg-primary-100')
  })

  it('renders as a span element', () => {
    render(<Badge>Tag</Badge>)
    const el = screen.getByText('Tag')
    expect(el.tagName.toLowerCase()).toBe('span')
  })
})
