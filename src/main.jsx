import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { DocenteProvider } from "./context(CONTROLLER)/DocenteContext";


ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <DocenteProvider> {/* ✅ envuelve tu app */}
      <App />
    </DocenteProvider>
  </React.StrictMode>
);
