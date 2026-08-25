// Substitui supabase.js: os dados de conteúdo do site (equipe, serviços,
// projetos) agora vêm de um Cloudflare Worker + banco D1, em vez do Supabase.
//
const WORKER_URL = "https://flui-api.pedro-brito-flui.workers.dev";

// As fotos (equipe, projetos, serviços) agora são servidas pelo próprio
// Worker, que lê do bucket R2 "flui-assets" (rota /assets/*). Antes vinham
// do Supabase Storage, que fica indisponível junto com o banco quando o
// projeto Supabase pausa.
window.getImageUrl = (path) => {
  if (!path) return "";
  const cleanPath = String(path).replace(/^assets\//, "");
  return `${WORKER_URL}/assets/${cleanPath}`;
};

async function fetchSafe(path, label) {
  try {
    const res = await fetch(`${WORKER_URL}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error(`Erro em ${label}:`, error);
    return [];
  }
}

window.api = {
  async getSiteMeta() {
    return await fetchSafe("/api/site_meta", "site_meta");
  },

  async getServices() {
    return await fetchSafe("/api/services", "services");
  },

  async getProjects() {
    return await fetchSafe("/api/projects", "projects");
  },

  async getPeople(type = null) {
    const qs = type ? `?type=${encodeURIComponent(type)}` : "";
    return await fetchSafe(`/api/people${qs}`, "people");
  },

  async getDocentes() {
    return await this.getPeople("docente");
  },

  async getBolsistas() {
    return await this.getPeople("bolsista");
  },

  async getTeamMembers() {
    return await fetchSafe("/api/team_members", "team_members");
  },

  async getTeam(type) {
    if (type === "docente") return this.getDocentes();
    if (type === "bolsista") return this.getBolsistas();
    return this.getTeamMembers();
  },
};
