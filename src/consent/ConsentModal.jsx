// src/consent/ConsentModal.jsx
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { CONSENT_VERSION } from "./useConsent";

export default function ConsentModal({ open, onClose }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      setEmail(userRes?.user?.email || "");
    })();
  }, []);

  if (!open) return null;

  const accept = async () => {
    setBusy(true);
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) return;

    await supabase
      .from("profiles")
      .update({
        consent_accepted: true,
        consent_version: CONSENT_VERSION,
        consent_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    try {
      await supabase.from("consent_logs").insert({
        user_id: user.id,
        accepted: true,
        version: CONSENT_VERSION,
      });
    } catch {}

    setBusy(false);
    onClose?.();
  };

  const decline = async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (user) {
      try {
        await supabase.from("consent_logs").insert({
          user_id: user.id,
          accepted: false,
          version: CONSENT_VERSION,
        });
      } catch {}
    }
    // Política: si no acepta => cerrar sesión
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-lg p-5">
        <h2 className="text-lg font-semibold text-slate-800">
          Consentimiento para tratamiento de datos (v{CONSENT_VERSION})
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          Cuenta: <span className="font-medium">{email}</span>
        </p>

        <div className="mt-3 text-sm text-slate-700 space-y-2">
          <p>
            Para continuar, autoriza el tratamiento de tus datos personales
            (nombre, correo, disponibilidad, etc.) con fines de gestión de horarios.
          </p>
          <ul className="list-disc ml-5">
            <li>Finalidad: generación y administración de horarios.</li>
            <li>Seguridad: TLS/HTTPS y controles de acceso por roles.</li>
            <li>Retención: mínimo necesario para fines académicos.</li>
            <li>Derechos ARCO: acceso, rectificación, cancelación y oposición.</li>
          </ul>
        </div>

        <label className="mt-4 flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span className="text-sm text-slate-700">
            He leído y acepto el tratamiento de mis datos conforme a la Política de Privacidad.
          </span>
        </label>

        <div className="mt-5 flex gap-2">
          <button
            disabled={!checked || busy}
            onClick={accept}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50"
          >
            {busy ? "Guardando…" : "Aceptar"}
          </button>
          <button
            onClick={decline}
            className="px-4 py-2 rounded-lg border border-slate-300"
          >
            No aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
