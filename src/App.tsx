import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from '@/components/layout/Layout'; // Käyttää aliasta
import IntroductionView from '@/modules/Introduction/IntroductionView';
import M4xCP2View from '@/modules/Module1_M4xCP2/M4xCP2View';
import ManySheetedView from '@/modules/Module2_ManySheeted/ManySheetedView';
import ParticlesView from '@/modules/Module3_Particles/ParticlesView';
import FieldsMEsView from '@/modules/Module4_FieldsMEs/FieldsMEsView';
import KahlerCP2View from '@/modules/Module5_KahlerCP2/KahlerCP2View';
import HEffView from '@/modules/Module6_h_eff/h_effView'; // Nimeä tiedosto h_effView.tsx
import ZEOView from '@/modules/Module7_ZEO/ZEOView';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<IntroductionView />} />
        <Route path="/m4xcp2" element={<M4xCP2View />} />
        <Route path="/many-sheeted" element={<ManySheetedView />} />
        <Route path="/particles" element={<ParticlesView />} />
        <Route path="/fields-mes" element={<FieldsMEsView />} />
        <Route path="/kahler-cp2" element={<KahlerCP2View />} />
        <Route path="/h-eff" element={<HEffView />} />
        <Route path="/zeo" element={<ZEOView />} />
        {/* Lisää tarvittaessa 404-sivu */}
        <Route path="*" element={<div>404 - Sivua ei löytynyt</div>} />
      </Routes>
    </Layout>
  );
}

export default App;
