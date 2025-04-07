import React from 'react';
import { Link } from 'react-router-dom';
import styles from './IntroductionView.module.css'; // Existing CSS module

// Font Awesome icons (example - requires setup)
// import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
// import { faFlask, faProjectDiagram, faAtom, faLightbulb, faSuperscript, faInfinity, faCubes, faFilePdf } from '@fortawesome/free-solid-svg-icons'

const IntroductionView: React.FC = () => {

    const modules = [
        // Added suggested icons (using CSS classes for now)
        { path: "/m4xcp2", name: "Moduuli 1: Aika-avaruus (M⁴ x CP₂)", iconClass: styles.iconSpacetime },
        { path: "/many-sheeted", name: "Moduuli 2: Moniarkkinen Aika-avaruus", iconClass: styles.iconSheets },
        { path: "/particles", name: "Moduuli 3: Alkeishiukkaset Topologisina Rakenteina", iconClass: styles.iconParticles },
        { path: "/fields-mes", name: "Moduuli 4: Kentät & ME:t", iconClass: styles.iconFields },
        { path: "/kahler-cp2", name: "Moduuli 5: Kähler & CP₂", iconClass: styles.iconGeometry },
        { path: "/h-eff", name: "Moduuli 6: h_eff Hierarkia", iconClass: styles.iconHierarchy },
        { path: "/zeo", name: "Moduuli 7: Nollaenergian Ontologia (ZEO)", iconClass: styles.iconZEO },
    ];

    const researchDocs = [
        { name: "Google Deep Research", filename: "google_deep_research.pdf" },
        { name: "OpenAI Deep Research", filename: "openai_deep_research.pdf" },
        { name: "Manus Deep Research", filename: "manus_deep_research.pdf" },
    ];

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                {/* Optional: Add a subtle thematic graphic/logo here */}
                {/* <img src="/path/to/logo.svg" alt="TGD Logo" className={styles.logo} /> */}
                <h1>TGD Visualizer</h1>
                <h2>Matka Topologisen Geometrodynamiikan Ytimeen</h2>
                <p className={styles.subtitle}>
                    Interaktiivinen työkalu TGD:n peruskonseptien visualisointiin ja ymmärtämiseen –
                    askel kohti syvempää käsitystä fysiikan perimmäisistä laeista.
                </p>
            </header>

            <section className={styles.section}>
                <h2>Visualisointimoduulit</h2>
                <p>Sukella TGD:n maailmaan valitsemalla yksi alla olevista visualisoinneista:</p>
                <div className={styles.moduleGrid}>
                    {modules.map((module) => (
                        <Link key={module.path} to={module.path} className={styles.moduleLink}>
                            {/* Icon placeholder (rendered via CSS) */}
                            <span className={`${styles.iconPlaceholder} ${module.iconClass}`}></span>
                            <span className={styles.moduleName}>{module.name}</span>
                        </Link>
                    ))}
                </div>
            </section>

            <section className={styles.section}>
                <h2>Syventävät Materiaalit</h2>
                <p>Tutustu tarkemmin teoriaan ja sen sovelluksiin:</p>
                <div className={styles.researchLinks}>
                    {researchDocs.map((doc) => (
                        <a
                            key={doc.filename}
                            href={`/${doc.filename}`} // Assumes files are in /public
                            download={doc.filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.researchLink}
                        >
                            {/* Icon placeholder */}
                            <span className={`${styles.iconPlaceholder} ${styles.iconPdf}`}></span>
                            {doc.name} (PDF)
                        </a>
                    ))}
                </div>
            </section>

             <footer className={styles.footer}>
                <p>© {new Date().getFullYear()} TGD Visualizer Project | Tutkimus & Kehitys</p>
            </footer>
        </div>
    );
};

export default IntroductionView;