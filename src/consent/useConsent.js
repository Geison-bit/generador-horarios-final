// src/consent/useConsent.js
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";

export const CONSENT_VERSION = "v1";

export default function useConsent() {
  const [needsConsent, setNeedsConsent] = useState(false);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) {
      setNeedsConsent(false);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("consent_accepted, consent_version")
      .eq("id", user.id)
      .single();

    // Si no hay error y NO aceptó (o la versión cambió), pedimos consentimiento
    if (!error && data) {
      const must = data.consent_accepted !== true || data.consent_version !== CONSENT_VERSION;
      setNeedsConsent(must);
    } else {
      // Si profiles tiene RLS mal configurado, evita romper UI:
      setNeedsConsent(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => { check(); }, [check]);

  return { needsConsent, loading, refetchConsent: check };
}

