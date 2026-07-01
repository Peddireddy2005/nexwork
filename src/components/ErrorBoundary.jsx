import React, { Component } from "react";
import { logError } from "@/lib/errorLogger";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logError({
      error_message: error.message,
      stack_trace: error.stack,
      action: "react_error_boundary",
      component: errorInfo.componentStack?.slice(0, 500) || undefined,
      severity: "critical",
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md space-y-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">An unexpected error occurred. Our team has been notified. Please try refreshing.</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={this.handleRetry} variant="outline" size="sm">
                <RefreshCw className="mr-2 h-4 w-4" /> Try Again
              </Button>
              <Button onClick={() => window.location.reload()} size="sm">
                Refresh Page
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
