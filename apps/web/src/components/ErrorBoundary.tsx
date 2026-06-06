'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <h2 className="mb-2 text-xl font-bold text-danger">Something went wrong</h2>
          <p className="mb-6 max-w-md text-sm text-slate-400">
            An unexpected error occurred in the UI. The team has been notified.
          </p>
          {this.state.error && (
            <pre className="mb-6 max-w-lg overflow-auto rounded-lg border border-edge bg-ink p-4 text-xs text-slate-500">
              {this.state.error.message}
            </pre>
          )}
          <button
            className="btn"
            onClick={() => {
              this.setState({ hasError: false });
              window.location.reload();
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
