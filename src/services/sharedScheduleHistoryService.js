import { supabase } from "../supabaseClient";

export const MAX_SHARED_SCHEDULES = 5;
const TABLE_NAME = "horario_generaciones";

const isValidSchedule = (schedule) => Array.isArray(schedule);
const normalizeEntry = (entry) => {
  if (Array.isArray(entry)) {
    return { horario: entry, createdAt: null };
  }
  if (entry && isValidSchedule(entry.horario)) {
    return {
      horario: entry.horario,
      createdAt: entry.createdAt || entry.created_at || null,
    };
  }
  return null;
};

export async function listSharedScheduleGenerations(nivel, versionNum) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("generation_index, horario, created_at")
    .eq("nivel", nivel)
    .eq("version_num", versionNum)
    .order("generation_index", { ascending: true });

  if (error) throw error;

  return (data || [])
    .map((row) => normalizeEntry({ horario: row.horario, created_at: row.created_at }))
    .filter(Boolean);
}

export async function saveSharedScheduleGenerations(nivel, versionNum, schedules) {
  const sanitized = (schedules || [])
    .map(normalizeEntry)
    .filter(Boolean)
    .slice(-MAX_SHARED_SCHEDULES);

  const { error: deleteError } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq("nivel", nivel)
    .eq("version_num", versionNum);

  if (deleteError) throw deleteError;

  if (sanitized.length === 0) return [];

  const rows = sanitized.map((entry, index) => ({
    nivel,
    version_num: versionNum,
    generation_index: index + 1,
    horario: entry.horario,
    created_at: entry.createdAt || new Date().toISOString(),
  }));

  const { error: insertError } = await supabase
    .from(TABLE_NAME)
    .insert(rows);

  if (insertError) throw insertError;

  return sanitized;
}
