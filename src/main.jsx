import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <main
        style={{
          padding: 40,
          color: "#eee",
          background: "#171925",
          minHeight: "100vh",
        }}
      >
        <h1>工作台加载失败</h1>
        <p>{this.state.error.message}</p>
        <button
          onClick={() => {
            localStorage.removeItem("novelai-studio-v1");
            location.reload();
          }}
        >
          重置本地界面设置
        </button>
        <p>已生成图像和历史记录不会删除。</p>
      </main>
    ) : (
      this.props.children
    );
  }
}
if(new URLSearchParams(location.search).has("fx_bootstrap"))history.replaceState(null,"","/");
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
