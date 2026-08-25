import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://mvpumfqkjaybssiffkqb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_6aVOghFz7fQWVDxg2k5AqQ_2gpJ1F1d";

// 1. Inicializa o banco na hora, sem esperar 'load' do navegador
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.getImageUrl = (path) => {
  if (!path) return "";
  const cleanPath = String(path).replace(/^assets\//, "");
  return `${SUPABASE_URL}/storage/v1/object/public/assets/${cleanPath}`;
};

async function fetchSafe(queryBuilder, label) {
  const { data, error } = await queryBuilder;
  if (error) {
    console.error(`Erro em ${label}:`, error);
    return [];
  }
  return data || [];
}

// 2. Cria a API imediatamente e deixa disponível para o React
window.api = {
  async getSiteMeta() {
    return await fetchSafe(
      db.from("site_meta").select("key, value, inserted_at").order("inserted_at", { ascending: true }),
      "site_meta"
    );
  },
  
  async getServices() {
    return await fetchSafe(
      db.from("services").select("*").order("position", { ascending: true }),
      "services"
    );
  },
  
  async getProjects() {
    return await fetchSafe(
      db.from("projects").select("*").order("inserted_at", { ascending: true }),
      "projects"
    );
  },
  
  async getPeople(type = null) {
    let q = db.from("people").select("*").order("inserted_at", { ascending: true });
    if (type) q = q.eq("type", type);
    
    const data = await fetchSafe(q, "people");
    // Envelopa os dados em { people: ... } para casar com o React
    return data.map(person => ({ people: person }));
  },
  
  async getDocentes() {
    return await this.getPeople("docente");
  },
  
  async getBolsistas() {
    return await this.getPeople("bolsista");
  },
  
  async getTeamMembers() {
    // Esse já traz o formato { people: ... } naturalmente por causa do join
    return await fetchSafe(
      db.from("team_members").select(`
          id, visible, order_index,
          people ( id, full_name, role, summary, details, image_path, type, inserted_at )
        `).eq("visible", true).order("order_index", { ascending: true }),
      "team_members"
    );
  },
  
  async getTeam(type) {
    if (type === 'docente') return this.getDocentes();
    if (type === 'bolsista') return this.getBolsistas();
    return this.getTeamMembers();
  }
};