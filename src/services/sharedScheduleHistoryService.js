import { supabase } from "../supabaseClient";

export const MAX_SHARED_SCHEDULES = 5;
const TABLE_NAME = "horario_generaciones";

const isValidSchedule = (schedule) => Array.isArray(schedule);

export async function listSharedScheduleGenerations(nivel, versionNum) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("generation_index, horario")
    .eq("nivel", nivel)
    .eq("version_num", versionNum)
    .order("generation_index", { ascending: true });

  if (error) throw error;

  return (data || [])
    .map((row) => row.horario)
    .filter(isValidSchedule);
}

export async function saveSharedScheduleGenerations(nivel, versionNum, schedules) {
  const sanitized = (schedules || [])
    .filter(isValidSchedule)
    .slice(-MAX_SHARED_SCHEDULES);

  const { error: deleteError } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq("nivel", nivel)
    .eq("version_num", versionNum);

  if (deleteError) throw deleteError;

  if (sanitized.length === 0) return [];

  const rows = sanitized.map((horario, index) => ({
    nivel,
    version_num: versionNum,
    generation_index: index + 1,
    horario,
  }));

  const { error: insertError } = await supabase
    .from(TABLE_NAME)
    .insert(rows);

  if (insertError) throw insertError;

  return sanitized;
}
