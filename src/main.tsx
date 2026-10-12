import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./styles/app.css";

/** Penangkap error terakhir: tampilkan pesan ramah, bukan layar putih. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="notice error" style={{ margin: 12 }}>
          <strong>Aplikasi mengalami kesalahan.</strong>
          <p>Muat ulang panel (tutup lalu buka lagi add-in). Jika berulang, catat detail di bawah.</p>
          <details>
            <summary>Detail teknis</summary>
            <p className="mono small">{String(this.state.error)}</p>
          </details>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
