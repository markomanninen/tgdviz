import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

const ZEOView: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    // Basic Three.js setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });

    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // Placeholder geometry
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    const cube = new THREE.Mesh(geometry, material);
    scene.add(cube);

    camera.position.z = 5;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
        if (mountRef.current) {
            const width = mountRef.current.clientWidth;
            const height = mountRef.current.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      if (mountRef.current) {
        mountRef.current.removeChild(renderer.domElement);
      }
      // Dispose Three.js objects if necessary (geometry, material, renderer etc.)
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []); // Empty dependency array means this runs once on mount

  return (
    <div>
      <h2>Nollaenergian Ontologia (ZEO)</h2>
      <p>Tähän tulee Nollaenergian Ontologia (ZEO)-osion visualisointi ja selitykset.</p>
      <div ref={mountRef} style={{ width: '100%', height: '60vh', border: '1px solid #ccc', marginTop: '10px' }}>
        {/* Three.js canvas renderöidään tähän */}
      </div>
      {/* Lisää tähän interaktiiviset elementit (sliderit, napit) myöhemmin */}
    </div>
  );
};

export default ZEOView;
