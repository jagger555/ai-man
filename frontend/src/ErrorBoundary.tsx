import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-shell">
          <section className="guide-layout">
            <div className="digital-human-panel" aria-label="AI 数字人">
              <div className="avatar">
                <div className="avatar-face">
                  <span />
                  <span />
                </div>
              </div>
              <p className="eyebrow">AI GUIDE</p>
              <h1>灵山胜境数字人导览</h1>
            </div>
            <section className="chat-panel">
              <div className="error-message">
                <strong>页面加载异常</strong>
                <p>{this.state.message || "发生了未知错误，请刷新页面重试。"}</p>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => window.location.reload()}
                  style={{ marginTop: 16 }}
                >
                  刷新页面
                </button>
              </div>
            </section>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
