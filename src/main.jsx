import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext";
import { DocenteProvider } from "./context/DocenteContext";   // ✅ IMPORTANTE
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <DocenteProvider>    {/* ✅ ENVOLVER TODO */}
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </DocenteProvider>
    </AuthProvider>
  </React.StrictMode>
);
