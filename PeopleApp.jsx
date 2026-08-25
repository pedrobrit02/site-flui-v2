import React, { useState, useEffect } from 'react';

const fieldLabels = {
  about: 'Sobre',
  experience: 'Experiência',
  competencies: 'Competências',
  education: 'Formação',
  certifications: 'Certificações',
  languages: 'Idiomas',
  recognitions: 'Reconhecimentos',
  events: 'Eventos',
  expanded_tech_skills: 'Habilidades Técnicas'
};

function PeopleList({ members, onOpen }) {
  if (!members || members.length === 0) {
    return <p style={{ padding: '24px', color: 'var(--muted)' }}>Carregando equipe...</p>;
  }

  return (
    <div className="peopleGrid" role="list">
      {members.map((member) => {
        const person = member.people;
        if (!person) return null;

        return (
          <article
            key={person.id}
            className="person"
            tabIndex="0"
            role="listitem"
            onClick={() => onOpen(person)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(person); }}
          >
            <div className={person.image_path ? 'avatar avatar--photo' : 'avatar'} aria-hidden="true">
              {person.image_path ? (
                <img 
                  src={window.getImageUrl(person.image_path)} 
                  alt={`Foto de ${person.full_name}`} 
                  width="76" 
                  height="76" 
                  loading="lazy" 
                />
              ) : (
                <span>{(person.full_name || '').split(' ').slice(0, 2).map(s => s[0]).join('')}</span>
              )}
            </div>
            <h3 className="person__name">{person.full_name}</h3>
          </article>
        );
      })}
    </div>
  );
}

function PersonModal({ person, onClose }) {
  if (!person) return null;

  const details = person.details || {};
  const imgUrl = person.image_path ? window.getImageUrl(person.image_path) : null;

  return (
    <div className="projectCardOverlay" onClick={onClose}>
      <div className="projectCardModal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="projectCard__close" onClick={onClose}>Fechar</button>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '16px', textAlign: 'center' }}>
          {imgUrl && (
            <img 
              src={imgUrl} 
              alt={`Foto de ${person.full_name}`} 
              style={{ 
                width: '120px', 
                height: '120px', 
                borderRadius: '50%', 
                objectFit: 'cover', 
                marginBottom: '12px', 
                border: '2px solid var(--purple)' 
              }} 
            />
          )}
          <h4 style={{ margin: '0 0 4px 0' }}>{person.full_name}</h4>
          <p style={{ color: 'var(--purple)', fontWeight: '600', margin: '0' }}>{person.role}</p>
        </div>

        {person.summary && (
          <div className="projectCard__section">
            <h5>Resumo</h5>
            <p>{person.summary}</p>
          </div>
        )}

        {Object.entries(details).map(([key, value]) => (
          <div key={key} className="projectCard__section">
            <h5>{fieldLabels[key] || key.replace('_', ' ')}</h5>
            {Array.isArray(value) ? (
              <ul>
                {value.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            ) : (
              <p>{value}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PeopleApp({ type }) {
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    async function loadTeam() {
      try {
        const data = await window.api.getTeam(type);
        setMembers(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erro ao carregar equipe:", err);
      }
    }
    loadTeam();
  }, [type]);

  return (
    <>
      <PeopleList members={members} onOpen={setSelected} />
      <PersonModal person={selected} onClose={() => setSelected(null)} />
    </>
  );
}