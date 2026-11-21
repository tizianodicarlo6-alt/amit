import { Component, useEffect, useState } from 'react';

// Se una parte dell'app va in errore, mostra il messaggio invece dello schermo nero.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Errore Amit:', error, info?.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <h2>Ops, qualcosa è andato storto</h2>
        <p className="muted small">I tuoi dati salvati sono al sicuro. Se succede di nuovo, fai uno screenshot di questo messaggio e mandalo a chi ti aiuta con l'app.</p>
        <pre className="crash-msg">{String(error?.name || 'Errore')}: {String(error?.message || error)}</pre>
        <button className="btn primary big" onClick={this.reset}>
          {this.props.onReset ? 'Chiudi' : 'Riprova'}
        </button>
        <button className="btn" onClick={() => location.reload()}>
          Ricarica l'app
        </button>
      </div>
    );
  }
}

// Mostra in basso gli errori "nascosti" (promesse fallite), così non passano inosservati.
export function ErrorToast() {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const show = (e) => {
      const err = e.reason || e.error;
      if (!err) return;
      setMsg(`${err.name || 'Errore'}: ${err.message || err}`);
    };
    window.addEventListener('unhandledrejection', show);
    window.addEventListener('error', show);
    return () => {
      window.removeEventListener('unhandledrejection', show);
      window.removeEventListener('error', show);
    };
  }, []);
  if (!msg) return null;
  return (
    <div className="toast" role="alert" onClick={() => setMsg('')}>
      <span>{msg}</span>
      <span className="muted small">Tocca per chiudere</span>
    </div>
  );
}
