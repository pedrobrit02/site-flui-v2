import './cloudflare-api.js';
import './Style.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import ProjectCard from './card.jsx';
import PeopleApp from './PeopleApp.jsx';

function ServicesCarousel() {
  const [services, setServices] = React.useState([]);

  React.useEffect(() => {
    async function loadServices() {
      try {
        const data = await window.api.getServices();
        setServices(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erro ao carregar serviços:", err);
      }
    }
    if (window.api) loadServices();
  }, []);

  // UseEffect que monitora se os serviços carregaram para só então rodar o carrossel
  React.useEffect(() => {
    if (services.length > 0 && window.initCarousel) {
      window.initCarousel();
    }
  }, [services]);

  if (services.length === 0) {
    return <p style={{ padding: "24px", color: "var(--muted)" }}>Carregando tecnologias do laboratório...</p>;
  }

  return (
    <div className="cards">
      {services.map((service) => (
        <article key={service.id} className="card card--image">
          <label className="card-toggle">
            <input type="checkbox" className="card-toggle__input" />
            <img src={window.getImageUrl(service.image_path)} alt={service.title} className="card__image" />
            <div className="card__overlay">
              <h3>{service.title}</h3>
              <p>{service.description}</p>
            </div>
          </label>
        </article>
      ))}
    </div>
  );
}
function ProjectsSection() {
  const [projects, setProjects] = React.useState([]);

  React.useEffect(() => {
    async function loadProjects() {
      try {
        const data = await window.api.getProjects();
        setProjects(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erro ao carregar projetos:", err);
        setProjects([]);
      }
    }
    if (window.api) loadProjects();
  }, []);

  return (
    <div className="projects" aria-label="Projetos do FLUI">
      <h3 className="projects__title">Projetos em desenvolvimento</h3>
      <div className="projects__grid">
        {projects.map((proj) => {
          const body = proj.body || {};
          const dynamicSections = [];

          if (body.partners_text) dynamicSections.push({ heading: "Parceiros Estratégicos", text: body.partners_text });
          if (body.ai) {
            dynamicSections.push({
              heading: "Inteligência Artificial",
              items: [body.ai.semantic_standardization || "", body.ai.natural_language_search || ""].filter(Boolean),
            });
          }
          if (body.computer_vision) dynamicSections.push({ heading: "Visão Computacional", text: body.computer_vision });
          if (body.stack) dynamicSections.push({ heading: "Stack Tecnológica", items: body.stack });
          if (body.methodology) {
            dynamicSections.push({
              heading: "Metodologia",
              items: body.methodology.map((m) => `Fase ${m.phase}: ${m.text}`),
            });
          }
          if (body.expected_results) dynamicSections.push({ heading: "Resultados Esperados", items: body.expected_results });

          return (
            <ProjectCard
              key={proj.id}
              title={proj.title}
              intro={body.intro || proj.subtitle}
              sections={dynamicSections}
            />
          );
        })}
      </div>
    </div>
  );
}
if (!window.api) {
  console.error("Erro CRÍTICO: window.api não foi encontrado!");
} else {
  const servicesElement = document.getElementById("services-carousel-root");
  if (servicesElement) ReactDOM.createRoot(servicesElement).render(<ServicesCarousel />);

  const projectsElement = document.getElementById("projects-root");
  if (projectsElement) ReactDOM.createRoot(projectsElement).render(<ProjectsSection />);

  // Usamos o PeopleApp importado. 
  // Nota: certifique-se de que no PeopleApp.jsx você exportou a função corretamente.
  const docentesElement = document.getElementById("docentes-root");
  if (docentesElement) ReactDOM.createRoot(docentesElement).render(<PeopleApp type="docente" />);

  const alunosElement = document.getElementById("alunos-root");
  if (alunosElement) ReactDOM.createRoot(alunosElement).render(<PeopleApp type="bolsista" />);
}