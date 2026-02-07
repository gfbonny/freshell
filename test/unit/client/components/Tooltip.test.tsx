import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows content on hover', () => {
    render(
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button">Hover me</button>
        </TooltipTrigger>
        <TooltipContent>Tip content</TooltipContent>
      </Tooltip>,
    )

    const button = screen.getByRole('button', { name: 'Hover me' })
    fireEvent.mouseEnter(button)
    expect(screen.getByText('Tip content')).toBeInTheDocument()

    fireEvent.mouseLeave(button)
    expect(screen.queryByText('Tip content')).not.toBeInTheDocument()
  })
})
