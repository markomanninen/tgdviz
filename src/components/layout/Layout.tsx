import React from 'react';
import Navbar from './Navbar';
// Voit lisätä myös Footeria tai Sivupalkkia tarvittaessa

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar />
      <main className="main-content" style={{ flexGrow: 1 }}>
        {children}
      </main>
      {/* <Footer /> */}
    </div>
  );
};

export default Layout;
