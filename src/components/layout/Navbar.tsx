import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Navbar.module.css'; // Luodaan tämä tiedosto seuraavaksi

const Navbar: React.FC = () => {
  return (
    <nav className={styles.navbar}>
      <Link to="/" className={styles.brand}>TGD Visualizer</Link>
      <ul className={styles.navList}>
        <li><Link to="/m4xcp2">M4xCP2</Link></li>
        <li><Link to="/many-sheeted">Many-Sheeted</Link></li>
        <li><Link to="/particles">Particles</Link></li>
        <li><Link to="/fields-mes">Fields & MEs</Link></li>
        <li><Link to="/kahler-cp2">Kähler & CP2</Link></li>
        <li><Link to="/h-eff">h_eff</Link></li>
        <li><Link to="/zeo">ZEO</Link></li>
      </ul>
    </nav>
  );
};

export default Navbar;
