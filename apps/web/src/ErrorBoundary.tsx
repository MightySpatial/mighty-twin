/** Top-level error boundary — catches render-tree exceptions in the
 *  Twin shell so a single broken page doesn't blank the whole app.
 *  Phase J. Pairs with the Vite proxy timeout + dev_mock auth fallback
 *  in apps/web/vite.config.ts and viewer/hooks/useAuth.tsx.
 */

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f0f14',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 520 }}>
          <h2 style={{ margin: '0 0 12px' }}>Something broke.</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
            {error.message}
          </p>
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 11,
              overflow: 'auto',
              maxHeight: 240,
            }}
          >
            {error.stack}
          </pre>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              onClick={this.reset}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              onClick={() => location.reload()}
              style={{
                padding: '8px 14px',
                borderRadius: 8,
                background: 'transparent',
                color: 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
