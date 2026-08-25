import { useState } from 'react';

const ProjectCard = ({ title, intro, sections = [] }) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggle = () => setIsOpen((value) => !value);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <>
      <article
        className="projectCard projectCard--small"
        tabIndex="0"
        role="button"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={toggle}
        onKeyDown={handleKeyDown}
      >
        <h4>{title}</h4>
        <p className="projectCard__intro">{intro}</p>
        <span className="projectCard__toggleLabel">
          {isOpen ? "Ocultar dados" : "Ver dados"}
        </span>
      </article>

      {isOpen && (
        <div className="projectCardOverlay" onClick={() => setIsOpen(false)}>
          <div
            className="projectCardModal"
            role="dialog"
            aria-modal="true"
            aria-label={`${title} - detalhes`}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="projectCard__close" onClick={() => setIsOpen(false)}>
              Fechar
            </button>
            <h4>{title}</h4>
            {intro && <p className="projectCard__intro">{intro}</p>}
            {sections.map((section) => (
              <div key={section.heading} className="projectCard__section">
                <h5>{section.heading}</h5>
                {section.items ? (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{section.text}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default ProjectCard;
