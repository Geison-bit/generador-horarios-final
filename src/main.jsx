import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { DocenteProvider } from "./context(CONTROLLER)/DocenteContext";
import { AuthProvider } from "./auth/AuthContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <DocenteProvider>
        <App />
      </DocenteProvider>
    </AuthProvider>
  </React.StrictMode>
);
