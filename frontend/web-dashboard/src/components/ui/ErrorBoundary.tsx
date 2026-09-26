import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isChunkLoadError } from '@/utils/lazyWithRetry';
import { errorConsoleService } from '@/services/errorConsoleService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  resetKey?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);

    // Stale-deploy chunk failures aren't a code bug worth an error-console
    // entry — they resolve with a reload (see the fallback UI above).
    if (!isChunkLoadError(error)) {
      errorConsoleService
        .reportClientError({ message: error.message, stack: error.stack, route: window.location.pathname })
        .catch(() => {});
    }
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.props.resetKey !== prevProps.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isChunkError = isChunkLoadError(this.state.error);

      return (
        <div className="min-h-[400px] h-full flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto animate-fade-in">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border shadow-sm mb-4 ${
            isChunkError 
              ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-500 border-rose-200 dark:border-rose-900/50'
          }`}>
            {isChunkError ? (
              <RefreshCw className="w-8 h-8 stroke-[2.2]" />
            ) : (
              <AlertTriangle className="w-8 h-8 stroke-[2.2]" />
            )}
          </div>

          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight mb-2">
            {isChunkError ? 'New Version Available' : 'Something went wrong'}
          </h2>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            {isChunkError
              ? 'A new update of MERCON has been published or your connection was temporarily lost. Please refresh to load the latest version.'
              : 'An unexpected error occurred while loading this view. You can reload this section or navigate back to the overview.'}
          </p>

          {import.meta.env.DEV && this.state.error?.message && (
            <div className="w-full mb-6 p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-left border border-slate-200 dark:border-slate-700">
              <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400 break-words font-semibold">
                {this.state.error.message}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={isChunkError ? this.handleReload : this.handleReset}
              size="sm"
              className="bg-brand hover:bg-brand-hover text-white text-xs font-bold px-4 py-2 rounded-xl shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              {isChunkError ? <RefreshCw className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
              <span>{isChunkError ? 'Reload Application' : 'Try Again'}</span>
            </Button>

            <Button
              onClick={this.handleGoHome}
              variant="outline"
              size="sm"
              className="text-xs font-bold px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Go to Dashboard</span>
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
