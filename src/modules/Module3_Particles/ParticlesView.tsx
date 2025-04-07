import React, { useRef, useEffect, useState, useCallback } from 'react';
// **** KORJATTU IMPORT: Lisätty kaikki tarvittavat luokat ****
import * as THREE from 'three'; // Edelleen hyödyllinen yleisille tyypeille
import {
    OrbitControls
} from 'three/examples/jsm/controls/OrbitControls.js';
import {
    Vector3, // <-- LISÄTTY
    SphereGeometry, // <-- LISÄTTY
    MeshStandardMaterial, // <-- OLI JO
    MeshBasicMaterial, // <-- OLI JO
    Mesh, // <-- OLI JO
    TorusGeometry, // <-- LISÄTTY
    LineCurve3, // <-- LISÄTTY
    TubeGeometry, // <-- OLI JO
    ArrowHelper, // <-- LISÄTTY
    Group, // <-- LISÄTTY
    PlaneGeometry, // <-- OLI JO
    CylinderGeometry, // <-- OLI JO
    Raycaster, // <-- OLI JO
    Vector2 // <-- OLI JO
} from 'three';
import viewStyles from '@/styles/ModuleView.module.css';

// --- Particle Types ---
type ParticleType = 'electron' | 'quark' | 'photon' | 'w_boson';
type ParticlePart = 'cp2_extremal' | 'wormhole_throat' | 'flux_tube' | 'spacetime_sheet' | 'wormhole_contact' | 'spin_arrow' | 'unknown';

interface ParticleInfo {
    name: string;
    type: 'fermion' | 'boson';
    description: string;
    parts: Record<ParticlePart, string>;
}

const partDescriptions: Record<ParticlePart, string> = {
    cp2_extremal: 'CP₂-tyyppinen ekstremaali: Pieni, aika-avaruuden 4-pinnan sisäinen 3-ulotteinen alue, joka kantaa hiukkasen kvanttilukuja (esim. sähkövaraus, spin). Sen topologia liittyy hiukkassukupolviin.',
    wormhole_throat: 'Madonreikäkurtku: Kohta, jossa CP₂-ekstremaali liittyy ("koskettaa") suurempaan aika-avaruusarkkiin. Fermionilla on tyypillisesti kaksi kurkkua.',
    flux_tube: 'Vuoputki (tai magneettinen säie): Putkimainen rakenne, joka yhdistää fermionin kahta madonreikäkurtkua. Se kantaa hiukkasen sähkömagneettista (ja mahdollisesti väri-) varausta. Se on käytännössä suljettu magneettikenttä.',
    spacetime_sheet: 'Aika-avaruusarkki (symbolinen): Bosonien tapauksessa madonreikäkontakti yhdistää kahta tällaista arkkia.',
    wormhole_contact: 'Madonreikäkontakti: Putkimainen yhteys kahden aika-avaruusarkin välillä. Välittää vuorovaikutuksia (bosonit). Sisältää virtuaalisen fermioni-antifermioni -parin.',
    spin_arrow: 'Spin (symbolinen): Nuoli kuvaa hiukkasen sisäistä pyörimismäärää eli spiniä.',
    unknown: 'Tuntematon osa.',
};

const particleDatabase: Record<ParticleType, ParticleInfo> = {
  electron: {
      name: 'Elektroni (Fermioni)',
      type: 'fermion',
      description: 'TGD:ssä elektroni mallinnetaan topologisena rakenteena. Se koostuu CP₂-tyyppisestä ekstremaalista (pieni möykky), johon liittyy kaksi madonreikäkurtkua (keltaiset renkaat). Nämä kurkut on yhdistetty magneettisella fluksiputkella (sininen putki), joka kantaa elektronin varausta. Koko rakenne on kiinnittynyt tausta-aika-avaruusarkkiin (ei näytetä tässä yksityiskohtaisesti). Nuoli symboloi spiniä.',
      parts: { ...partDescriptions, spacetime_sheet: '', wormhole_contact: '' } // Sisällytä relevantit osat
  },
  quark: {
      name: 'Kvarkki (Fermioni, yleinen)',
      type: 'fermion',
      description: 'Kvarkit ovat elektronin kaltaisia fermioneja, mutta ne kantavat myös värivarausta. Tässä visualisoinnissa rakenne on samanlainen kuin elektronilla (CP₂-ekstremaali, kurkut, fluksiputki). Värivarausta (punainen, vihreä, sininen) symboloi fluksiputken väri. Kvarkit esiintyvät tyypillisesti sitoutuneina tiloina (hadronit), joissa värivaraukset kumoavat toisensa.',
      parts: { ...partDescriptions, spacetime_sheet: '', wormhole_contact: '' }
  },
  photon: {
      name: 'Fotoni (Bosoni)',
      type: 'boson',
      description: 'Fotoni, sähkömagneettisen vuorovaikutuksen välittäjähiukkanen, kuvataan TGD:ssä madonreikäkontaktina. Se on putkimainen rakenne, joka yhdistää kahta samansuuntaista aika-avaruusarkkia (läpinäkyvät levyt). Fotonin sisällä kulkee fermionin ja antifermionin muodostama pari vastakkaisilla aika-avaruusarkeilla (ei visualisoitu tässä).',
      parts: { ...partDescriptions, cp2_extremal: '', wormhole_throat: '', flux_tube: '', spin_arrow: '' }
  },
  w_boson: {
      name: 'W-Bosoni (Bosoni, yleinen)',
      type: 'boson',
      description: 'Heikon vuorovaikutuksen välittäjäbosonit (W ja Z) ovat myös madonreikäkontakteja, kuten fotoni. Ne ovat kuitenkin massiivisia ja kantavat sähköheikkoa varausta. Tämä visualisoidaan usein paksumpana tai monimutkaisempana kontaktirakenteena verrattuna fotoniin. Tässä käytetään paksumpaa putkea symboloimaan W-bosonia.',
      parts: { ...partDescriptions, cp2_extremal: '', wormhole_throat: '', flux_tube: '', spin_arrow: '' }
  },
};

// --- Visualisation Creation Functions ---

const createFermionVisual = (particleKey: ParticleType, color?: THREE.Color): Group => { // Käytä Groupia tyyppinä
    const group = new Group(); // Käytä Group-konstruktoria
    const cp2ExtremalRadius = 0.5; const throatRadius = 0.1; const fluxTubeRadius = 0.03;

    const extremalGeo = new SphereGeometry(cp2ExtremalRadius, 16, 12); const extremalMat = new MeshStandardMaterial({ color: 0xcccccc, roughness: 0.6, metalness: 0.3 }); const extremalMesh = new Mesh(extremalGeo, extremalMat);
    extremalMesh.userData.part = 'cp2_extremal' as ParticlePart; group.add(extremalMesh);

    const throatGeo = new TorusGeometry(throatRadius, 0.03, 8, 16); const throatMat = new MeshBasicMaterial({ color: 0xffff00 });
    const throat1 = new Mesh(throatGeo, throatMat); throat1.position.set(0, cp2ExtremalRadius*0.8, cp2ExtremalRadius*0.5); throat1.lookAt(extremalMesh.position);
    throat1.userData.part = 'wormhole_throat' as ParticlePart; group.add(throat1);
    const throat2 = new Mesh(throatGeo, throatMat); throat2.position.set(0, -cp2ExtremalRadius*0.8, -cp2ExtremalRadius*0.5); throat2.lookAt(extremalMesh.position);
    throat2.userData.part = 'wormhole_throat' as ParticlePart; group.add(throat2);

    const tubeStart = throat1.position.clone().multiplyScalar(0.9); const tubeEnd = throat2.position.clone().multiplyScalar(0.9); const tubeCurve = new LineCurve3(tubeStart, tubeEnd); const tubeGeo = new TubeGeometry(tubeCurve, 1, fluxTubeRadius, 8, false);
    const tubeColor = color ?? new THREE.Color(0x0000ff); const tubeMat = new MeshStandardMaterial({ color: tubeColor, roughness: 0.8 }); const tubeMesh = new Mesh(tubeGeo, tubeMat);
    tubeMesh.userData.part = 'flux_tube' as ParticlePart; group.add(tubeMesh);

    const spinDir = new Vector3(0, 1, 0); const spinOrigin = new Vector3(cp2ExtremalRadius*1.1, 0, 0); const spinLength = 0.5; const spinColor = 0xff0000; const spinArrow = new ArrowHelper(spinDir.normalize(), spinOrigin, spinLength, spinColor, 0.2, 0.1);
    spinArrow.line.userData.part = 'spin_arrow' as ParticlePart; spinArrow.cone.userData.part = 'spin_arrow' as ParticlePart; group.add(spinArrow);

    group.userData.particleType = particleKey; group.userData.isFermion = true;
    return group;
};

const createBosonVisual = (particleKey: ParticleType): Group => { // Käytä Groupia tyyppinä
    const group = new Group(); // Käytä Group-konstruktoria
    const sheetDistance = 1.5; const contactRadius = particleKey === 'photon' ? 0.2 : 0.35; const contactLength = sheetDistance * 1.1;
    const sheetGeo = new PlaneGeometry(2.5, 2.5); const sheetMat = new MeshStandardMaterial({ color: 0xeeeeee, side: THREE.DoubleSide, transparent: true, opacity: 0.3, depthWrite: false });
    const sheet1 = new Mesh(sheetGeo, sheetMat); sheet1.position.y = sheetDistance / 2; sheet1.userData.part = 'spacetime_sheet' as ParticlePart; group.add(sheet1);
    const sheet2 = new Mesh(sheetGeo, sheetMat); sheet2.position.y = -sheetDistance / 2; sheet2.userData.part = 'spacetime_sheet' as ParticlePart; group.add(sheet2);

    const contactGeo = new CylinderGeometry(contactRadius, contactRadius, contactLength, 16, 1); const contactColor = particleKey === 'photon' ? 0xffffff : 0xffaa00; const contactMat = new MeshStandardMaterial({ color: contactColor, roughness: 0.5, metalness: 0.4 }); const contactMesh = new Mesh(contactGeo, contactMat); contactMesh.rotation.x = Math.PI / 2;
    contactMesh.userData.part = 'wormhole_contact' as ParticlePart; group.add(contactMesh);
    group.userData.particleType = particleKey; group.userData.isBoson = true;
    return group;
};


// --- Component ---
const ParticlesView: React.FC = () => {
    // --- Refs ---
    const mountRef = useRef<HTMLDivElement>(null); const rendererRef = useRef<THREE.WebGLRenderer | null>(null); const sceneRef = useRef<THREE.Scene | null>(null); const cameraRef = useRef<THREE.PerspectiveCamera | null>(null); const controlsRef = useRef<OrbitControls | null>(null); const particleGroupRef = useRef<Group | null>(null); // Käytä Group-tyyppiä
    const animationIdRef = useRef<number>(); const isInitializedRef = useRef<boolean>(false);
    const raycasterRef = useRef<Raycaster>(new Raycaster()); const mousePosRef = useRef<Vector2>(new Vector2());

    // --- State ---
    const [selectedParticle, setSelectedParticle] = useState<ParticleType>('electron');
    const [particleInfo, setParticleInfo] = useState<ParticleInfo>(particleDatabase.electron);
    const [selectedPartInfo, setSelectedPartInfo] = useState<string>('');
    const [isDescriptionVisible, setIsDescriptionVisible] = useState<boolean>(false);

    // --- Cleanup Function ---
    const cleanupVisualization = useCallback(() => {
        const scene = sceneRef.current; const particleGroup = particleGroupRef.current;
        if (scene && particleGroup) {
            while(particleGroup.children.length > 0){
                const obj = particleGroup.children[0]; // Ei tarvitse castata Meshiksi, ArrowHelper sisältää muita
                particleGroup.remove(obj);
                // Dispose geometry and material if they exist
                if ((obj as any).geometry) (obj as any).geometry.dispose();
                const material = (obj as any).material;
                if (material) {
                    if (Array.isArray(material)) { material.forEach(m => m.dispose()); } else { material.dispose(); }
                }
            }
            scene.remove(particleGroup); particleGroupRef.current = null;
        }
    }, []);

    // --- Create Visualization Function ---
    const createVisualization = useCallback((particleKey: ParticleType) => {
        cleanupVisualization(); const scene = sceneRef.current; if (!scene) return;
        const info = particleDatabase[particleKey]; let particleGroup: Group; // Käytä Groupia
        if (info.type === 'fermion') { let color: THREE.Color | undefined = undefined; if (particleKey === 'quark') { const colors = [0xff0000, 0x00ff00, 0x0000ff]; color = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]); } particleGroup = createFermionVisual(particleKey, color); } else { particleGroup = createBosonVisual(particleKey); }
        scene.add(particleGroup); particleGroupRef.current = particleGroup; setParticleInfo(info); setSelectedPartInfo('');
    }, [cleanupVisualization]);

    // --- Canvas Click Handler ---
    const handleCanvasClick = useCallback((event: MouseEvent) => {
        const cam = cameraRef.current; const scene = sceneRef.current; const particleGroup = particleGroupRef.current; const mount = mountRef.current;
        if (!cam || !scene || !mount || !particleGroup) return;
        const rect = mount.getBoundingClientRect(); mousePosRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; mousePosRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; raycasterRef.current.setFromCamera(mousePosRef.current, cam);
        const intersects = raycasterRef.current.intersectObject(particleGroup, true);
        let hitPartDescription = '';
        if (intersects.length > 0) {
            let hitObject = null;
            for (const intersect of intersects) { if (intersect.object.userData.part) { hitObject = intersect.object; break; } }
            if (hitObject) { const partType = hitObject.userData.part as ParticlePart; const description = partDescriptions[partType] || partDescriptions.unknown;
                 // Korjattu termi "Vuoputki" kuvauksessa
                const displayedPartType = partType === 'flux_tube' ? 'vuoputki' : partType;
                hitPartDescription = `${displayedPartType}: ${description}`;
            }
        }
        setSelectedPartInfo(hitPartDescription);
    }, []);

    // --- Initial Setup Effect ---
    useEffect(() => {
        if (!mountRef.current || isInitializedRef.current) return;
        const currentMount = mountRef.current; let rendererElement: HTMLCanvasElement | null = null; isInitializedRef.current = true; let localClickListener: ((event: MouseEvent) => void) | null = null;
        try {
            sceneRef.current = new THREE.Scene(); sceneRef.current.background = new THREE.Color(0x333340);
            cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 100); cameraRef.current.position.set(0, 1.5, 5);
            rendererRef.current = new THREE.WebGLRenderer({ antialias: true }); rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight); rendererRef.current.setPixelRatio(window.devicePixelRatio);
            rendererElement = rendererRef.current.domElement; currentMount.appendChild(rendererElement);
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); sceneRef.current.add(ambientLight); const pointLight = new THREE.PointLight(0xffffff, 0.9, 100); pointLight.position.set(5, 5, 5); sceneRef.current.add(pointLight); const pointLight2 = new THREE.PointLight(0xffffff, 0.5, 100); pointLight2.position.set(-5, -3, -5); sceneRef.current.add(pointLight2);
            controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement); controlsRef.current.enableDamping = true; controlsRef.current.dampingFactor = 0.05; controlsRef.current.target.set(0, 0, 0);

            createVisualization(selectedParticle);
            localClickListener = handleCanvasClick; currentMount.addEventListener('click', localClickListener);

            const animate = () => {
                animationIdRef.current = requestAnimationFrame(animate);
                const r = rendererRef.current, s = sceneRef.current, ca = cameraRef.current, co = controlsRef.current;
                if (!r || !s || !ca || !co) return;
                co.update();
                const particleGroup = particleGroupRef.current;
                if (particleGroup && particleGroup.userData.isFermion) {
                    const spinArrow = particleGroup.children.find(child => child instanceof ArrowHelper) as ArrowHelper; // Käytä ArrowHelper tyyppiä
                    if (spinArrow) { spinArrow.rotateOnAxis(new Vector3(0, 1, 0), 0.02); } // Käytä Vector3 konstruktoria
                }
                r.render(s, ca);
            };
            animate();
        } catch (error) { console.error("Error during initial setup:", error); }
        const handleResize = () => { if (!rendererRef.current || !cameraRef.current || !currentMount) return; const w=currentMount.clientWidth,h=currentMount.clientHeight; cameraRef.current.aspect=w/h; cameraRef.current.updateProjectionMatrix(); rendererRef.current.setSize(w,h); }; window.addEventListener('resize', handleResize);
        return () => {
            isInitializedRef.current = false; if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current); window.removeEventListener('resize', handleResize); controlsRef.current?.dispose();
            if (localClickListener && currentMount) { currentMount.removeEventListener('click', localClickListener); }
            cleanupVisualization();
            rendererRef.current?.dispose(); if (currentMount && rendererElement && currentMount.contains(rendererElement)) currentMount.removeChild(rendererElement); rendererRef.current = null; sceneRef.current = null; cameraRef.current = null; controlsRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleanupVisualization, createVisualization, handleCanvasClick]); // Riippuvuudet callbackeista

    useEffect(() => {
        if (!isInitializedRef.current) return;
        createVisualization(selectedParticle);
    }, [selectedParticle, createVisualization]);

    const handleParticleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedParticle(event.target.value as ParticleType);
    };

    const toggleDescription = () => {
      setIsDescriptionVisible(prev => !prev);
    };
    return (
        <div className={viewStyles.moduleContainer}>
            <h2 className={viewStyles.moduleTitle}>Moduuli 3: Alkeishiukkaset Topologisina Rakenteina</h2>
            <button
                onClick={toggleDescription}
                className={`${viewStyles.toggleButton} ${!isDescriptionVisible ? viewStyles.toggleButtonHidden : ''}`}
             >
                {isDescriptionVisible ? 'Piilota Selitys' : 'Näytä Selitys'}
             </button>
            <div className={`${viewStyles.description} ${!isDescriptionVisible ? viewStyles.descriptionHidden : ''}`}>
            <p>
                TGD:ssä alkeishiukkasia ei kuvata pistemäisinä objekteina, vaan <strong>topologisina rakenteina</strong> aika-avaruudessa.
                Niiden ominaisuudet, kuten massa, varaus ja spin, syntyvät näiden rakenteiden geometriasta ja topologiasta M⁴ x CP<sub>2</sub> -avaruudessa.
                Tämä visualisointi esittää symbolisesti fermionien ja bosonien rakenteita TGD:n mukaisesti. **Klikkaa mallin osia saadaksesi lisätietoa.**
            </p>
            </div>
            <div className={viewStyles.controlsPanel} style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', marginBottom: '15px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                    <label className={viewStyles.label} htmlFor="particleSelect" style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Valitse hiukkanen:</label>
                    <select id="particleSelect" value={selectedParticle} onChange={handleParticleChange} style={{ padding: '8px', width: '100%' }}>
                        <option value="electron">Elektroni</option>
                        <option value="quark">Kvarkki (yleinen)</option>
                        <option value="photon">Fotoni</option>
                        <option value="w_boson">W-Bosoni (yleinen)</option>
                    </select>
                </div>
                <div className={viewStyles.subtleNote} style={{ flex: '2 1 300px', border: '1px solid #ccc', padding: '10px', borderRadius: '4px', backgroundColor: '#f9f9f9', minHeight: '100px' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '5px', color: 'orange' }}>{particleInfo.name}</h4>
                    <p style={{ fontSize: '0.9em', margin: '0 0 10px 0', color: 'slategray' }}>{particleInfo.description.replace(/Fluksiputki/gi, 'Vuoputki')}</p> {/* Korvaa termi lennosta */}
                    {selectedPartInfo && (
                         <div style={{ borderTop: '1px dashed #aaa', paddingTop: '10px', marginTop: '10px' }}>
                             {/* Korvaa termi myös klikkausinfossa */}
                            <p style={{ fontSize: '0.85em', margin: 0, fontStyle: 'italic' }}>{selectedPartInfo.replace(/flux_tube/gi, 'vuoputki')}</p>
                        </div>
                    )}
                </div>
            </div>
            {/* Canvas container */}
            <div className={viewStyles.canvasContainer} ref={mountRef} style={{ width: '100%', height: '60vh', border: '1px solid #ccc', marginTop: '10px', position: 'relative', cursor: 'pointer' }}>
                {/* Canvas */}
            </div>
        </div>
    );
};

export default ParticlesView;