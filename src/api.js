import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
const client = configured
  ? createClient(url, key, {
      auth: {
        storage: sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
const requireClient = () => {
  if (!client)
    throw new Error(
      "Acesso ainda não configurado. Aguarde a liberação dos usuários.",
    );
  return client;
};
function check(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}
async function memberSession() {
  if (!client) return null;
  const {
    data: { session },
    error,
  } = await client.auth.getSession();
  if (error) throw error;
  if (!session) return null;
  const member = await client
    .from("kanbam_members")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (member.error || !member.data) {
    await client.auth.signOut();
    throw new Error("Esta conta não está autorizada a acessar o painel.");
  }
  return session;
}
const fields = [
  "id",
  "title",
  "description",
  "status",
  "priority",
  "progress",
  "due_date",
  "assignee",
  "tags",
  "subtasks",
  "dependencies",
  "links",
  "comments",
  "recurrence",
];
async function save(table, record, allowed) {
  const c = requireClient(),
    clean = Object.fromEntries(
      allowed.filter((k) => record[k] !== undefined).map((k) => [k, record[k]]),
    );
  if (record.updated_at) {
    const result = check(
      await c
        .from(table)
        .update(clean)
        .eq("id", record.id)
        .eq("updated_at", record.updated_at)
        .select()
        .maybeSingle(),
    );
    if (!result)
      throw new Error(
        "Este registro foi alterado por outra pessoa. Atualize o painel e abra novamente antes de salvar.",
      );
    return result;
  }
  return check(await c.from(table).insert(clean).select().single());
}
export const api = {
  configured,
  getSession: memberSession,
  async login(email, password) {
    check(
      await requireClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      }),
    );
    return memberSession();
  },
  async logout() {
    if (client) check(await client.auth.signOut());
  },
  onAuthStateChange(callback) {
    if (!client) return () => {};
    const { data } = client.auth.onAuthStateChange((event, session) =>
      callback(session, event),
    );
    return () => data.subscription.unsubscribe();
  },
  async resetPassword(email) {
    check(
      await requireClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      }),
    );
  },
  async updatePassword(password) {
    const tokenHash = new URLSearchParams(location.hash.slice(1)).get(
      "activate",
    );
    if (tokenHash) {
      check(
        await requireClient().auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        }),
      );
      history.replaceState(null, "", location.pathname + "#type=recovery");
    }
    check(await requireClient().auth.updateUser({ password }));
  },
  async getTasks() {
    return check(
      await requireClient()
        .from("kanbam_tasks")
        .select("*")
        .order("created_at"),
    );
  },
  async saveTask(task) {
    return save("kanbam_tasks", task, fields);
  },
  async deleteTask(task) {
    const id = typeof task === "string" ? task : task.id;
    check(await requireClient().from("kanbam_tasks").delete().eq("id", id));
  },
  async getEvents() {
    return check(
      await requireClient()
        .from("kanbam_events")
        .select("*")
        .order("start_date"),
    );
  },
  async saveEvent(event) {
    return save("kanbam_events", event, [
      "id",
      "title",
      "start_date",
      "end_date",
      "kind",
      "description",
    ]);
  },
  async deleteEvent(event) {
    check(
      await requireClient()
        .from("kanbam_events")
        .delete()
        .eq("id", typeof event === "string" ? event : event.id),
    );
  },
  async getActivity() {
    return check(
      await requireClient()
        .from("kanbam_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
    );
  },
};
let lastActivity = Date.now();
for (const event of ["pointerdown", "keydown", "touchstart"])
  window.addEventListener(
    event,
    () => {
      lastActivity = Date.now();
    },
    { passive: true },
  );
setInterval(() => {
  if (client && Date.now() - lastActivity > 30 * 60 * 1000) {
    lastActivity = Date.now();
    client.auth.signOut();
  }
}, 60 * 1000);
