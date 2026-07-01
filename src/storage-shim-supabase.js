import { supabase } from './supabase-client.js';

// Same window.storage.get/set/delete API the app was built against — just
// backed by real Supabase tables instead of localStorage, so App.jsx didn't
// need to change at all. Each key maps to either a single row (profile) or
// a full table synced against a JSON array (assignments, tests).

function toCamelAssignment(row) {
  return {
    id: row.id,
    classId: row.class_id,
    subject: row.subject,
    title: row.title,
    turnin: row.turnin,
    due: row.due,
    notes: row.notes,
    done: row.done,
    createdAt: row.created_at,
  };
}

function toSnakeAssignment(item, userId) {
  return {
    id: item.id,
    user_id: userId,
    class_id: item.classId || null,
    subject: item.subject || '',
    title: item.title,
    turnin: item.turnin || 'person',
    due: item.due,
    notes: item.notes || '',
    done: !!item.done,
    created_at: item.createdAt,
  };
}

function toCamelTest(row) {
  return {
    id: row.id,
    classId: row.class_id,
    subject: row.subject,
    title: row.title,
    due: row.due,
    notes: row.notes,
    done: row.done,
    createdAt: row.created_at,
  };
}

function toSnakeTest(item, userId) {
  return {
    id: item.id,
    user_id: userId,
    class_id: item.classId || null,
    subject: item.subject || '',
    title: item.title,
    due: item.due,
    notes: item.notes || '',
    done: !!item.done,
    created_at: item.createdAt,
  };
}

// Syncs a full array against a table: upserts everything currently in the
// array, then deletes any row that belongs to this user but is no longer
// present in the array (covers deletions).
async function syncTable(table, userId, rows) {
  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from(table).upsert(rows);
    if (upsertError) throw upsertError;
  }
  const currentIds = rows.map((r) => r.id);
  let deleteQuery = supabase.from(table).delete().eq('user_id', userId);
  if (currentIds.length > 0) {
    deleteQuery = deleteQuery.not('id', 'in', `(${currentIds.map((id) => `"${id}"`).join(',')})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;
}

export function installSupabaseStorage(userId) {
  window.storage = {
    async get(key) {
      if (key === 'assignments-v1') {
        const { data, error } = await supabase.from('assignments').select('*').eq('user_id', userId);
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Key not found');
        return { key, value: JSON.stringify(data.map(toCamelAssignment)) };
      }
      if (key === 'tests-v1') {
        const { data, error } = await supabase.from('tests').select('*').eq('user_id', userId);
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Key not found');
        return { key, value: JSON.stringify(data.map(toCamelTest)) };
      }
      if (key === 'profile-v1') {
        const { data, error } = await supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Key not found');
        return {
          key,
          value: JSON.stringify({
            name: data.name || '',
            school: data.school || '',
            customReminderTime: data.custom_reminder_time || '',
            classes: data.classes || [],
          }),
        };
      }
      throw new Error(`Unknown key: ${key}`);
    },

    async set(key, value) {
      if (key === 'assignments-v1') {
        const items = JSON.parse(value);
        await syncTable('assignments', userId, items.map((i) => toSnakeAssignment(i, userId)));
        return { key, value };
      }
      if (key === 'tests-v1') {
        const items = JSON.parse(value);
        await syncTable('tests', userId, items.map((i) => toSnakeTest(i, userId)));
        return { key, value };
      }
      if (key === 'profile-v1') {
        const profile = JSON.parse(value);
        const { error } = await supabase.from('profiles').upsert({
          user_id: userId,
          name: profile.name || '',
          school: profile.school || '',
          custom_reminder_time: profile.customReminderTime || '',
          classes: profile.classes || [],
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        return { key, value };
      }
      throw new Error(`Unknown key: ${key}`);
    },

    async delete(key) {
      return { key, deleted: false };
    },

    async list() {
      return { keys: [] };
    },
  };
}
