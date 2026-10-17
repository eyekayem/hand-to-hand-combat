import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  fallback?: ReactNode;
  /** Label used in the console when something is caught. */
  name?: string;
  children: ReactNode;
}

/**
 * Contains a failing subtree. Works in both React DOM and the R3F scene
 * graph, so a failed 3D asset (e.g. a font that can't load) doesn't take
 * down the page around it.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`[${this.props.name ?? 'ErrorBoundary'}] contained error:`, error.message, info.componentStack?.split('\n')[1]?.trim());
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
