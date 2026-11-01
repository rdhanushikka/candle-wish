// Every call to the database goes through here.
const { supabaseUrl, supabaseAnonKey } = window.CANDLE_CONFIG;
const client = supabaseUrl
  ? window.supabase.createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

async function rpc(name, args) {
  if (!client) throw new Error("This site isn't connected to its database yet.");
  const { data, error } = await client.rpc(name, args);
  if (error) {
    // P0001 is a message written for people in schema.sql. Anything else is a connection problem.
    throw new Error(error.code === "P0001" ? error.message : "Couldn't reach the server. Try again.");
  }
  return data;
}

export const api = {
  createParty: (body) => rpc("create_party", { body }),
  readPlan: (party, key) => rpc("read_plan", { party, key }),
  updateParty: (party, key, body) => rpc("update_party", { party, key, body }),
  readParty: (party, starToken) => rpc("read_party", { party, star_token: starToken }),
  unlock: (party, entered) => rpc("unlock_party", { party, entered }),
  setState: (party, starToken, newState) => rpc("set_party_state", { party, star_token: starToken, new_state: newState }),
  addMessage: (party, candle, from, text) => rpc("add_candle_message", { party, candle_number: candle, sender_name: from, message: text }),
  readMessages: (party, starToken) => rpc("read_candle_messages", { party, star_token: starToken }),

  // Calls onChange with each update, and onConnect whenever the live connection (re)opens.
  watch(liveKey, onChange, onConnect) {
    client
      .channel(`party-${liveKey}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "party_live", filter: `live_key=eq.${liveKey}` }, (payload) => onChange(payload.new))
      .subscribe((status) => { if (status === "SUBSCRIBED") onConnect(); });
  },
};
