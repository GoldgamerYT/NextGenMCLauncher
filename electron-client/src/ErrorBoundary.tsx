import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="h-screen w-full bg-black text-white p-10 flex flex-col items-center justify-center font-mono">
                    <div className="bg-red-900/20 border border-red-500 rounded p-6 max-w-2xl w-full">
                        <div className="flex items-center gap-3 text-red-400 mb-4">
                            <AlertTriangle size={32} />
                            <h1 className="text-2xl font-bold">Application Crashed</h1>
                        </div>
                        <p className="mb-4">Something went wrong while rendering the application.</p>

                        <div className="bg-black/50 p-4 rounded text-sm overflow-auto max-h-64 whitespace-pre-wrap border border-white/10">
                            {this.state.error?.toString()}
                            <br />
                            {this.state.errorInfo?.componentStack}
                        </div>

                        <button
                            className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-500 rounded font-bold text-white transition-colors"
                            onClick={() => window.location.reload()}
                        >
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
