// Personal Hub: authenticated sync for work shifts and salary payments.
// The publishable key is safe for a public client; RLS protects user records.
const SUPABASE_URL = "https://hdkxhjvkvycvrjhroect.supabase.co";
const SUPABASE_KEY = "sb_publishable_-11F5qAp0hxOmMNC2I4aaw_CgNIV5rz";
const LIB_URL = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm";
const TABLE = "personal_hub_records";
const SOURCES = {
  work_shifts: "personal-hub:work-shifts:v1",
  salary_payments: "personal-hub:salary-payments:v1"
};
const OP_QUEUE = "personal-hub:pending-cloud-ops:v1";
let client, user, busy = false, importing = false, hasStarted = false;
let interval, onRecordsChanged;
let statusCallback = () => {};
const read = (key, fallback = []) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
  catch { return fallback; }
};
const set = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const status = (label) => statusCallback(label);
const identity = (collection, id) => collection + ":" + id;
const normalized = (collection) => {
  const values = read(SOURCES[collection]);
  return Array.isArray(values) ? values.filter((entry) => entry && typeof entry.id === "string") : [];
};
function pending() { const rows = read(OP_QUEUE); return Array.isArray(rows) ? rows : []; }

export function queueCloudDiff(storageKey, before, after) {
  const collection = Object.keys(SOURCES).find((name) => SOURCES[name] === storageKey);
  if (!collection) return;
  const previous = new Map(before.map((record) => [record.id, record]));
  const next = new Map(after.map((record) => [record.id, record]));
  const additions = [];
  for (const [id, payload] of next) {
    if (JSON.stringify(previous.get(id)) !== JSON.stringify(payload)) {
      additions.push({ collection, record_id: id, payload });
    }
  }
  for (const id of previous.keys()) {
    if (!next.has(id)) additions.push({ collection, record_id: id, payload: { deleted: true } });
  }
  if (!additions.length) return;
  const queue = new Map(pending().map((entry) => [identity(entry.collection, entry.record_id), entry]));
  for (const record of additions) queue.set(identity(record.collection, record.record_id), record);
  set(OP_QUEUE, [...queue.values()]);
  if (user) void synchronize();
  else status("Local only");
}
async function flushPending() {
  if (!user) return false;
  const ops = pending();
  if (!ops.length) return true;
  for (const entry of ops) {
    const { error } = await client.from(TABLE).upsert({
      user_id: user.id,
      collection: entry.collection,
      record_id: entry.record_id,
      payload: entry.payload,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,collection,record_id" });
    if (error) { status("Sync error: " + error.message); return false; }
    // Preserve newer edits queued during the request.
    const left = pending().filter((item) =>
      identity(item.collection, item.record_id) !== identity(entry.collection, entry.record_id) ||
      JSON.stringify(item.payload) !== JSON.stringify(entry.payload));
    set(OP_QUEUE, left);
  }
  return true;
}
async function reconcile() {
  const { data, error } = await client.from(TABLE).select("collection,record_id,payload").eq("user_id", user.id);
  if (error) { status("Sync error: " + error.message); return; }
  const remote = new Map(data.map((r) => [identity(r.collection, r.record_id), r]));
  // Older entries saved before connecting are imported, but never overwrite cloud records.
  const uploads = [];
  const merged = {};
  for (const collection of Object.keys(SOURCES)) {
    const local = normalized(collection);
    const map = new Map();
    for (const row of data.filter((r) => r.collection === collection && !r.payload.deleted)) {
      map.set(row.record_id, row.payload);
    }
    for (const item of local) {
      if (remote.has(identity(collection, item.id))) continue; // includes delete tombstones
      uploads.push({ collection, record_id: item.id, payload: item });
      map.set(item.id, item);
    }
    merged[collection] = [...map.values()];
  }
  if (uploads.length) {
    const { error: importError } = await client.from(TABLE).upsert(
      uploads.map((r) => ({ user_id: user.id, ...r })),
      { onConflict: "user_id,collection,record_id", ignoreDuplicates: true }
    );
    if (importError) { status("Import failed: " + importError.message); return; }
  }
  // Don't discard local changes in case another edit was queued mid-fetch.
  if (pending().length) return;
  for (const collection of Object.keys(SOURCES)) set(SOURCES[collection], merged[collection]);
  onRecordsChanged();
  status("Synced");
}
export async function synchronize() {
  if (busy || !user) return;
  busy = true;
  status("Syncing…");
  try {
    if (await flushPending()) await reconcile();
  } catch (error) { status("Offline — changes kept locally"); }
  finally { busy = false; }
}
export async function initializeCloud({ onChange, onStatus, onUser }) {
  if (hasStarted) return;
  hasStarted = true;
  onRecordsChanged = onChange;
  statusCallback = onStatus;
  status("Connecting…");
  try {
    const { createClient } = await import(LIB_URL);
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    user = data.session?.user || null;
    onUser(user);
    status(user ? "Connecting…" : "Local only");
    if (user) void synchronize();
    client.auth.onAuthStateChange((_event, session) => {
      const changed = user?.id !== session?.user?.id;
      user = session?.user || null;
      onUser(user);
      if (user && changed) queueMicrotask(() => void synchronize());
      if (!user) status("Local only");
    });
    window.addEventListener("online", () => void synchronize());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void synchronize();
    });
    interval = window.setInterval(() => {
      if (user && !document.hidden) void synchronize();
    }, 12000);
  } catch (error) { status("Cloud unavailable — local mode"); }
}
export async function signIn(email, password) {
  if (!client) throw new Error("Cloud connection is not available.");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}
export async function signUp(email, password) {
  if (!client) throw new Error("Cloud connection is not available.");
  const { data, error } = await client.auth.signUp({
    email, password,
    options: { emailRedirectTo: window.location.origin + window.location.pathname }
  });
  if (error) throw error;
  return data.session ? "Signed in" : "Account created. Check your email to confirm.";
}
export async function signOut() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
