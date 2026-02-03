import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import Pane from '@/components/panes/Pane'

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  X: ({ className }: { className?: string }) => (
    <svg data-testid="x-icon" className={className} />
  ),
  Circle: ({ className }: { className?: string }) => (
    <svg data-testid="circle-icon" className={className} />
  ),
}))

describe('Pane', () => {
  afterEach(() => {
    cleanup()
  })

  describe('rendering', () => {
    it('renders children content', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      render(
        <Pane
          isActive={false}
          isOnlyPane={false}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div data-testid="child-content">Terminal Content</div>
        </Pane>
      )

      expect(screen.getByTestId('child-content')).toBeInTheDocument()
      expect(screen.getByText('Terminal Content')).toBeInTheDocument()
    })

    it('renders close button when not the only pane', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      render(
        <Pane
          isActive={false}
          isOnlyPane={false}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div>Content</div>
        </Pane>
      )

      const closeButton = screen.getByTitle('Close pane')
      expect(closeButton).toBeInTheDocument()
    })

    it('hides close button when it is the only pane', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      render(
        <Pane
          isActive={false}
          isOnlyPane={true}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div>Content</div>
        </Pane>
      )

      const closeButton = screen.queryByTitle('Close pane')
      expect(closeButton).not.toBeInTheDocument()
    })
  })

  describe('active state styling', () => {
    it('does not apply opacity when active', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      const { container } = render(
        <Pane
          isActive={true}
          isOnlyPane={false}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div>Content</div>
        </Pane>
      )

      const paneDiv = container.firstChild as HTMLElement
      expect(paneDiv.className).not.toContain('opacity-')
    })

    it('applies reduced opacity when inactive', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      const { container } = render(
        <Pane
          isActive={false}
          isOnlyPane={false}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div>Content</div>
        </Pane>
      )

      const paneDiv = container.firstChild as HTMLElement
      expect(paneDiv.className).toContain('relative')
      expect(paneDiv.className).toContain('opacity-[0.85]')
    })
  })

  describe('interactions', () => {
    it('calls onFocus when pane is clicked', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      const { container } = render(
        <Pane
          isActive={false}
          isOnlyPane={false}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div>Content</div>
        </Pane>
      )

      const paneDiv = container.firstChild as HTMLElement
      fireEvent.mouseDown(paneDiv)

      expect(onFocus).toHaveBeenCalledTimes(1)
    })

    it('calls onClose when close button is clicked', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      render(
        <Pane
          isActive={false}
          isOnlyPane={false}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div>Content</div>
        </Pane>
      )

      const closeButton = screen.getByTitle('Close pane')
      fireEvent.click(closeButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('stops propagation when close button is clicked (does not trigger onFocus)', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      render(
        <Pane
          isActive={false}
          isOnlyPane={false}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div>Content</div>
        </Pane>
      )

      const closeButton = screen.getByTitle('Close pane')
      fireEvent.click(closeButton)

      // onClose should be called, but onFocus should NOT be called
      // because the click event is stopped from propagating
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(onFocus).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('handles multiple rapid clicks on pane', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      const { container } = render(
        <Pane
          isActive={false}
          isOnlyPane={false}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div>Content</div>
        </Pane>
      )

      const paneDiv = container.firstChild as HTMLElement
      fireEvent.mouseDown(paneDiv)
      fireEvent.mouseDown(paneDiv)
      fireEvent.mouseDown(paneDiv)

      expect(onFocus).toHaveBeenCalledTimes(3)
    })

    it('handles multiple rapid clicks on close button', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      render(
        <Pane
          isActive={false}
          isOnlyPane={false}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div>Content</div>
        </Pane>
      )

      const closeButton = screen.getByTitle('Close pane')
      fireEvent.click(closeButton)
      fireEvent.click(closeButton)
      fireEvent.click(closeButton)

      expect(onClose).toHaveBeenCalledTimes(3)
      expect(onFocus).not.toHaveBeenCalled()
    })

    it('renders with any children content', () => {
      const onClose = vi.fn()
      const onFocus = vi.fn()

      render(
        <Pane
          isActive={false}
          isOnlyPane={false}
          onClose={onClose}
          onFocus={onFocus}
        >
          <div data-testid="browser-content">Browser Content</div>
        </Pane>
      )

      expect(screen.getByTestId('browser-content')).toBeInTheDocument()
    })
  })

  describe('header rendering', () => {
    it('renders PaneHeader when not the only pane and title is provided', () => {
      render(
        <Pane
          isActive={true}
          isOnlyPane={false}
          title="My Terminal"
          status="running"
          onClose={vi.fn()}
          onFocus={vi.fn()}
        >
          <div>Content</div>
        </Pane>
      )

      expect(screen.getByText('My Terminal')).toBeInTheDocument()
    })

    it('does not render PaneHeader when only pane', () => {
      render(
        <Pane
          isActive={true}
          isOnlyPane={true}
          title="My Terminal"
          status="running"
          onClose={vi.fn()}
          onFocus={vi.fn()}
        >
          <div>Content</div>
        </Pane>
      )

      expect(screen.queryByText('My Terminal')).not.toBeInTheDocument()
    })

    it('renders fallback close button when no title provided but multiple panes', () => {
      render(
        <Pane
          isActive={true}
          isOnlyPane={false}
          onClose={vi.fn()}
          onFocus={vi.fn()}
        >
          <div>Content</div>
        </Pane>
      )

      expect(screen.getByTitle('Close pane')).toBeInTheDocument()
    })

    it('header close button triggers onClose', () => {
      const onClose = vi.fn()
      render(
        <Pane
          isActive={true}
          isOnlyPane={false}
          title="My Terminal"
          status="running"
          onClose={onClose}
          onFocus={vi.fn()}
        >
          <div>Content</div>
        </Pane>
      )

      fireEvent.click(screen.getByTitle('Close pane'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })
})
