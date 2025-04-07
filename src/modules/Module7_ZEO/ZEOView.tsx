import React, { useRef, useEffect, useState, useCallback } from 'react';
// **** KORJAUS: Varmistetaan kaikki importit THREE:sta ****
import * as THREE from 'three'; // Käytetään tätä yleisesti
import {
    OrbitControls
} from 'three/examples/jsm/controls/OrbitControls.js';
import {
    LineMaterial
} from 'three/examples/jsm/lines/LineMaterial.js';
import {
    LineGeometry
} from 'three/examples/jsm/lines/LineGeometry.js';
import {
    Line2
} from 'three/examples/jsm/lines/Line2.js';
// Erilliset importit selkeyden vuoksi, vaikka THREE.* toimisi myös
import { Vector3, Color, ConeGeometry, MeshBasicMaterial, Mesh, Group, TorusGeometry, BufferGeometry, BufferAttribute, PointsMaterial, Points, PerspectiveCamera, Scene, WebGLRenderer, AmbientLight } from 'three';
import viewStyles from '@/styles/ModuleView.module.css';

// --- Vakiot ---
const CD_HEIGHT = 6; const CD_RADIUS = 3; const CD_COLOR_FUTURE = 0xaaaaff; const CD_COLOR_PAST = 0xffaaaa; const EDGE_COLOR = 0xffffff; const EDGE_LINEWIDTH = 0.005; const JUMP_DURATION = 0.5;

// --- Component ---
const ZEOView: React.FC = () => {
    // --- Refs ---
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<WebGLRenderer | null>(null); // Käytä tarkempia tyyppejä
    const sceneRef = useRef<Scene | null>(null);
    const cameraRef = useRef<PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const cdGroupRef = useRef<Group | null>(null);
    const futureConeRef = useRef<Mesh<ConeGeometry, MeshBasicMaterial> | null>(null); // Tarkempi tyyppi
    const pastConeRef = useRef<Mesh<ConeGeometry, MeshBasicMaterial> | null>(null);
    const futureEdgeRef = useRef<Line2 | null>(null);
    const pastEdgeRef = useRef<Line2 | null>(null);
    const internalStateRef = useRef<Points<BufferGeometry, PointsMaterial> | null>(null); // Tarkempi tyyppi
    const animationIdRef = useRef<number>();
    const isInitializedRef = useRef<boolean>(false);
    const jumpAnimationRef = useRef<{ startTime: number; startOpacity: number; targetOpacity: number; jumping: boolean; newPos?: Vector3 }>({ startTime: 0, startOpacity: 1, targetOpacity: 1, jumping: false }); // Käytä Vector3-tyyppiä


    // --- State ---
    const [jumpCounter, setJumpCounter] = useState<number>(0);
    const [isDescriptionVisible, setIsDescriptionVisible] = useState<boolean>(false);

    // --- Cleanup ---
    const cleanupSceneContent = useCallback(() => {
        const scene = sceneRef.current; const cdGroup = cdGroupRef.current;
        if (scene && cdGroup) {
            scene.remove(cdGroup);
            futureConeRef.current?.geometry?.dispose(); (futureConeRef.current?.material as Material)?.dispose();
            pastConeRef.current?.geometry?.dispose(); (pastConeRef.current?.material as Material)?.dispose();
            futureEdgeRef.current?.geometry?.dispose(); (futureEdgeRef.current?.material as Material)?.dispose();
            pastEdgeRef.current?.geometry?.dispose(); (pastEdgeRef.current?.material as Material)?.dispose();
            internalStateRef.current?.geometry?.dispose(); (internalStateRef.current?.material as Material)?.dispose();
            cdGroupRef.current = null; futureConeRef.current = null; pastConeRef.current = null; futureEdgeRef.current = null; pastEdgeRef.current = null; internalStateRef.current = null;
        }
    }, []);

    // --- Create CD Function ---
    const createCD = useCallback((position: Vector3 = new Vector3(0, 0, 0)): Group | null => { // Voi palauttaa null
        const scene = sceneRef.current;
        if (!scene) {
             console.error("Cannot create CD: Scene not initialized.");
             return null;
        }
        cleanupSceneContent(); // Poista vanha CD ensin
        const group = new Group(); group.position.copy(position);
        const coneHeight = CD_HEIGHT / 2; const coneRadius = CD_RADIUS; const coneRadialSegments = 32; const coneHeightSegments = 4;
        const coneGeometry = new ConeGeometry(coneRadius, coneHeight, coneRadialSegments, coneHeightSegments, true);
        const futureMaterial = new MeshBasicMaterial({ color: CD_COLOR_FUTURE, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, });
        const futureCone = new Mesh(coneGeometry, futureMaterial); futureCone.position.y = coneHeight / 2; group.add(futureCone); futureConeRef.current = futureCone;
        const pastMaterial = new MeshBasicMaterial({ color: CD_COLOR_PAST, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, });
        const pastCone = new Mesh(coneGeometry, pastMaterial); pastCone.position.y = -coneHeight / 2; pastCone.rotation.x = Math.PI; group.add(pastCone); pastConeRef.current = pastCone;
        const edgeMaterial = new LineMaterial({ color: EDGE_COLOR, linewidth: EDGE_LINEWIDTH, dashed: false, opacity: 0.6, transparent: true, });
        if (rendererRef.current) { // Aseta resoluutio heti
             edgeMaterial.resolution.set(mountRef.current?.clientWidth ?? window.innerWidth, mountRef.current?.clientHeight ?? window.innerHeight);
        }
        const edgePoints: number[] = []; const divisions = coneRadialSegments;
        for (let i = 0; i <= divisions; i++) { const angle = (i / divisions) * Math.PI * 2; edgePoints.push(Math.cos(angle) * coneRadius, 0, Math.sin(angle) * coneRadius); }
        const edgeGeometry = new LineGeometry(); edgeGeometry.setPositions(edgePoints);
        const futureEdge = new Line2(edgeGeometry, edgeMaterial); futureEdge.position.y = coneHeight; futureEdge.computeLineDistances(); group.add(futureEdge); futureEdgeRef.current = futureEdge;
        const pastEdge = new Line2(edgeGeometry, edgeMaterial); pastEdge.position.y = -coneHeight; pastEdge.computeLineDistances(); group.add(pastEdge); pastEdgeRef.current = pastEdge;
        const pointsGeometry = new BufferGeometry(); const pointsCount = 1000; const positions = new Float32Array(pointsCount * 3);
        for (let i = 0; i < pointsCount; i++) { const y = THREE.MathUtils.randFloat(-coneHeight, coneHeight); const radiusAtY = coneRadius * (1 - Math.abs(y) / coneHeight); const angle = Math.random() * Math.PI * 2; const radius = Math.random() * radiusAtY; positions[i * 3] = Math.cos(angle) * radius; positions[i * 3 + 1] = y; positions[i * 3 + 2] = Math.sin(angle) * radius; }
        pointsGeometry.setAttribute('position', new BufferAttribute(positions, 3));
        const pointsMaterial = new PointsMaterial({ color: 0xffffff, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, });
        const points = new Points(pointsGeometry, pointsMaterial); group.add(points); internalStateRef.current = points;
        cdGroupRef.current = group; scene.add(group);
        return group;
    }, [cleanupSceneContent]);


    // --- Initial Setup Effect ---
    useEffect(() => {
        if (!mountRef.current || isInitializedRef.current) return;
        const currentMount = mountRef.current; let rendererElement: HTMLCanvasElement | null = null; isInitializedRef.current = true;
        try {
            sceneRef.current = new Scene(); sceneRef.current.background = new Color(0x05050a); // Käytä konstruktoria
            cameraRef.current = new PerspectiveCamera(70, currentMount.clientWidth / currentMount.clientHeight, 0.1, 100); cameraRef.current.position.set(0, 0, 10);
            rendererRef.current = new WebGLRenderer({ antialias: true }); rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight); rendererRef.current.setPixelRatio(window.devicePixelRatio);
            rendererElement = rendererRef.current.domElement; currentMount.appendChild(rendererElement);
            const ambientLight = new AmbientLight(0xffffff, 0.3); sceneRef.current.add(ambientLight);
            controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement); controlsRef.current.enableDamping = true; controlsRef.current.dampingFactor = 0.05; controlsRef.current.target.set(0, 0, 0);

            createCD(); // Luo ensimmäinen CD

            const animate = () => {
                animationIdRef.current = requestAnimationFrame(animate);
                const r = rendererRef.current, s = sceneRef.current, ca = cameraRef.current, co = controlsRef.current;
                if (!r || !s || !ca || !co) return;
                const now = performance.now() / 1000.0; co.update();
                const anim = jumpAnimationRef.current;
                if (anim.jumping) {
                    const elapsed = now - anim.startTime; let progress = Math.min(elapsed / JUMP_DURATION, 1.0);
                    let currentOpacity: number = 0; // Määritellään loopin ulkopuolella
                    if (progress < 0.5) { currentOpacity = THREE.MathUtils.lerp(anim.startOpacity, 0, progress * 2); }
                    else {
                        // Luo uusi CD kun ollaan puolivälissä, jos vanha on poistettu JA uutta ei ole vielä luotu
                        if (!cdGroupRef.current && anim.newPos) {
                             createCD(anim.newPos); // Luo uusi
                             // Aseta uuden opacity aluksi 0
                             const group = cdGroupRef.current;
                             if(group) {
                                 group.traverse((child) => { // Käy läpi kaikki osat
                                     if ((child as Mesh).material) {
                                         ((child as Mesh).material as Material).opacity = 0;
                                         ((child as Mesh).material as Material).needsUpdate = true;
                                     }
                                 });
                             }
                             // Aseta reunaviivojen opacity erikseen (jos ne ovat olemassa)
                             if (futureEdgeRef.current?.material) futureEdgeRef.current.material.opacity = 0;
                             if (pastEdgeRef.current?.material) pastEdgeRef.current.material.opacity = 0;
                        }
                        currentOpacity = THREE.MathUtils.lerp(0, anim.targetOpacity, (progress - 0.5) * 2);
                    }
                    // Aseta opacity kaikille nykyisen CD:n osille
                    const group = cdGroupRef.current;
                     if(group) {
                        // Asetetaan opacityt refien kautta varmuuden vuoksi
                         if(futureConeRef.current?.material) futureConeRef.current.material.opacity = currentOpacity * 0.2;
                         if(pastConeRef.current?.material) pastConeRef.current.material.opacity = currentOpacity * 0.2;
                         if(futureEdgeRef.current?.material) futureEdgeRef.current.material.opacity = currentOpacity * 0.6;
                         if(pastEdgeRef.current?.material) pastEdgeRef.current.material.opacity = currentOpacity * 0.6;
                         if(internalStateRef.current?.material) internalStateRef.current.material.opacity = currentOpacity * 0.5;
                     }
                    if (progress >= 1.0) { anim.jumping = false; /* Varmista lopullinen opacity */
                        if(group) {
                            if(futureConeRef.current?.material) futureConeRef.current.material.opacity = anim.targetOpacity * 0.2;
                            if(pastConeRef.current?.material) pastConeRef.current.material.opacity = anim.targetOpacity * 0.2;
                            if(futureEdgeRef.current?.material) futureEdgeRef.current.material.opacity = anim.targetOpacity * 0.6;
                            if(pastEdgeRef.current?.material) pastEdgeRef.current.material.opacity = anim.targetOpacity * 0.6;
                            if(internalStateRef.current?.material) internalStateRef.current.material.opacity = anim.targetOpacity * 0.5;
                        }
                    }
                }
                r.render(s, ca);
            };
            animate();
        } catch (error) { console.error("Error during initial setup:", error); }
        const handleResize = () => { if (!rendererRef.current || !cameraRef.current || !currentMount) return; const w=currentMount.clientWidth,h=currentMount.clientHeight; ca.aspect=w/h; ca.updateProjectionMatrix(); rendererRef.current.setSize(w,h); if (futureEdgeRef.current?.material) (futureEdgeRef.current.material as LineMaterial).resolution.set(w, h); if (pastEdgeRef.current?.material) (pastEdgeRef.current.material as LineMaterial).resolution.set(w, h); }; window.addEventListener('resize', handleResize);
        return () => { isInitializedRef.current = false; if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current); window.removeEventListener('resize', handleResize); controlsRef.current?.dispose(); cleanupSceneContent(); rendererRef.current?.dispose(); if (currentMount && rendererElement && currentMount.contains(rendererElement)) currentMount.removeChild(rendererElement); rendererRef.current = null; sceneRef.current = null; cameraRef.current = null; controlsRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleanupSceneContent, createCD]);

     // --- UI Event Handlers ---
     const handleQuantumJump = () => {
         if (jumpAnimationRef.current.jumping) return;

         // **** KORJAUS: Käytä Vector3 konstruktoria ****
         const newPos = new Vector3(
             THREE.MathUtils.randFloatSpread(2),
             THREE.MathUtils.randFloatSpread(1),
             THREE.MathUtils.randFloatSpread(2)
         );

         // Lue nykyinen opacity jostain osasta (jos se on olemassa)
         const currentOpacityTarget = futureConeRef.current?.material.opacity ?? 1.0; // Käytä cone opacitya

         jumpAnimationRef.current = {
             startTime: performance.now() / 1000.0,
             startOpacity: currentOpacityTarget / 0.2, // Laske alkuperäinen 'base' opacity
             targetOpacity: 1.0,
             jumping: true,
             newPos: newPos
         };

         // Poista vanha CD vasta animaation keskivaiheessa
         setTimeout(() => {
             if (jumpAnimationRef.current.jumping) {
                 cleanupSceneContent(); // Poista vanha CD kokonaan
                 cdGroupRef.current = null; // Nollaa ref heti
             }
         }, (JUMP_DURATION / 2) * 1000);

         setJumpCounter(prev => prev + 1);
     };

    const toggleDescription = () => {
      setIsDescriptionVisible(prev => !prev);
    };
return (
    <div className={viewStyles.moduleContainer}>
        <h2 className={viewStyles.moduleTitle}>Moduuli 7: Nollaenergian Ontologia (ZEO)</h2>
        <button
          onClick={toggleDescription}
          className={`${viewStyles.toggleButton} ${!isDescriptionVisible ? viewStyles.toggleButtonHidden : ''}`}
        >
          {isDescriptionVisible ? 'Piilota Selitys' : 'Näytä Selitys'}
        </button>
        <div className={`${viewStyles.description} ${!isDescriptionVisible ? viewStyles.descriptionHidden : ''}`}>
        <p> Nollaenergian ontologia (Zero Energy Ontology, ZEO) on TGD:n perustavanlaatuinen kehys, joka muuttaa käsitystämme fysiikan tiloista ja ajan luonteesta. Sen ydinajatus on, että fysikaaliset tilat eivät edusta hetkellisiä tilannekuvia, vaan kokonaisia "kvanttihistorioita". </p> <ul style={{fontSize: '0.9em', marginBottom: '1em'}}> <li><strong>Kausaalinen Timantti (CD):</strong> Fysikaaliset tilat määritellään M⁴:n alueilla, joita kutsutaan kausaalisiksi timanteiksi (CD). CD on kahden valokartion leikkausalue, joilla on yhteinen kärki (tai kärjet ovat toistensa valokartioissa). Tässä visualisoinnissa näet yhden tällaisen CD:n, joka koostuu tulevaisuuden (sinertävä) ja menneisyyden (punertava) valokartiosta.</li> <li><strong>Nollaenergiatilat:</strong> Jokainen fysikaalinen tila on "nollaenergiatila". Tämä tarkoittaa, että sen kokonaiskvanttiluvut (kuten energia) ovat nolla. Tila määritellään CD:n vastakkaisilla, valonkaltaisilla rajoilla (timantin ylä- ja alareuna). Toisella rajalla on positiivisen energian komponentit ja toisella negatiivisen energian komponentit, jotka kumoavat toisensa.</li> <li><strong>Kvanttihypyt ja Aika:</strong> Subjektiivinen ajan kokemus syntyy TGD:ssä kvanttihyppyjen sarjana. Jokaisessa hypyssä ("state function reduction") koko universumin kvanttitila (nollaenergiatila yhdessä CD:ssä) korvautuu uudella. Tämä EI tarkoita determinististä etenemistä ajassa, vaan jatkuvaa uudelleenluontia. Tässä visualisoinnissa "Suorita Kvanttihyppy" -nappi simuloi tätä: vanha CD häivytetään ja uusi ilmestyy (mahdollisesti eri paikassa ja hieman eri sisäisellä "tilalla" - symboloidaan tässä pisteillä).</li> <li><strong>Tietoisuus:</strong> ZEO on pohja TGD:n tietoisuusteorialle, jossa kvanttihyppy vastaa hetkellistä tietoisuuden kokemusta ("qualia"). Ajan virta on seurausta näiden hyppyjen sekvenssistä.</li> </ul>
        <p>Klikkaa nappia simuloidaksesi kvanttihyppyä ja ajan etenemistä ZEO:ssa.</p>
        </div>
        {/* Canvas container */}
        <div className={viewStyles.canvasContainer} ref={mountRef} style={{ width: '100%', height: '70vh', border: '1px solid #ccc', marginTop: '10px', position: 'relative', cursor: 'grab', backgroundColor: '#05050a' }}>{/* Canvas */}</div>
        {/* Controls */}
        <div className={viewStyles.controlsPanel} style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f8f8f8', borderRadius: '4px', display: 'flex', gap: '15px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleQuantumJump} style={{ padding: '10px 20px', fontSize: '1.1em' }}> Suorita Kvanttihyppy (Uusi CD) </button>
            <span style={{fontFamily: 'monospace'}}>Hyppyjä: {jumpCounter}</span>
         </div>
    </div>
);
};

export default ZEOView;