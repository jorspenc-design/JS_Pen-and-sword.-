import { Component, type ReactNode } from 'react';

/** Shows what went wrong instead of leaving a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="page narrow" style={{ paddingTop: '4rem' }}>
        <h1 style={{ marginBottom: '1rem' }}>Something stopped Pen and Sword</h1>
        <p className="muted">Your saved work is safe. Reloading usually fixes this. If it keeps happening, send this message to whoever helps you with the app:</p>
        <pre className="card" style={{ whiteSpace: 'pre-wrap', fontSize: '.85rem', margin: '1.5rem 0' }}>{error.message}</pre>
        <div className="row">
          <button className="btn primary" onClick={() => location.reload()}>Reload</button>
          <a className="btn ghost" href="#/" onClick={() => this.setState({ error: null })}>Back to your library</a>
        </div>
      </main>
    );
  }
}
