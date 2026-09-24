import React, { useState, useEffect } from 'react';

function initials(fullName) {
  return (fullName || '').split(' ').slice(0, 2).map((s) => s[0]).join('');
}

function PersonCard({ person }) {
  const lattesUrl = person.details && person.details.lattes_url;

  const avatar = (
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
        <span>{initials(person.full_name)}</span>
      )}
    </div>
  );

  const body = (
    <>
      {avatar}
      <h3 className="person__name">{person.full_name}</h3>
      {person.role && <p className="person__role">{person.role}</p>}
      {lattesUrl && <p className="person__lattes">Ver Currículo Lattes ↗</p>}
    </>
  );

  // Perfis com link cadastrado abrem direto o Currículo Lattes num separador
  // novo. Sem link ainda, o card fica só informativo (sem clique).
  if (lattesUrl) {
    return (
      <a
        className="person"
        role="listitem"
        href={lattesUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Ver Currículo Lattes de ${person.full_name}`}
      >
        {body}
      </a>
    );
  }

  return (
    <article className="person" role="listitem">
      {body}
    </article>
  );
}

function PeopleList({ members }) {
  if (!members || members.length === 0) {
    return <p style={{ padding: '24px', color: 'var(--muted)' }}>Carregando equipe...</p>;
  }

  return (
    <div className="peopleGrid" role="list">
      {members.map((member) => {
        const person = member.people;
        if (!person) return null;
        return <PersonCard key={person.id} person={person} />;
      })}
    </div>
  );
}

export default function PeopleApp({ type }) {
  const [members, setMembers] = useState([]);

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

  return <PeopleList members={members} />;
}
