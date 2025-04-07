import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Clock } from 'three';
import { TubeGeometry, CatmullRomCurve3, Vector3, MeshStandardMaterial, Mesh, CylinderGeometry, Group, Material, Line } from 'three';
import viewStyles from '@/styles/ModuleView.module.css';

// --- Tyypit ---
type FieldObjectType = 'flux_tube' | 'me';
interface FieldObjectData { id: number; type: FieldObjectType; objectGroup: Group; direction?: Vector3; creationTime?: number; }

// --- Vakiot ---
const LIGHT_SPEED_FACTOR = 5.0;
const GRID_SIZE = 20;

// --- Component ---
const FieldsMEsView: React.FC = () => {
    // --- Refs ---
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const clockRef = useRef<THREE.Clock | null>(null);
    const animationIdRef = useRef<number>();
    const gridHelperRef = useRef<THREE.GridHelper | null>(null); // Ref ruudukolle
    const isInitializedRef = useRef<boolean>(false);
    const fieldObjectsRef = useRef<Map<number, FieldObjectData>>(new Map());
    const nextObjectIdRef = useRef<number>(0);

    // --- State ---
    const [isPlaying, setIsPlaying] = useState<boolean>(true); // Aloita animaatio päällä
    const animationSpeedRef = useRef<number>(1.0);
    const [objectCountUI, setObjectCountUI] = useState<number>(0);
    const isPlayingRef = useRef<boolean>(isPlaying);
    const [isDescriptionVisible, setIsDescriptionVisible] = useState<boolean>(false);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
        if (clockRef.current) {
            if (isPlaying && !clockRef.current.running) { clockRef.current.start(); clockRef.current.getDelta(); }
            else if (!isPlaying && clockRef.current.running) { clockRef.current.stop(); }
        }
    }, [isPlaying]);

    // --- Cleanup Function (VAIN KENTTÄOBJEKTEILLE) ---
    const cleanupFieldObjects = useCallback(() => {
        const scene = sceneRef.current; if (!scene) return;
        console.log("[Cleanup] Removing FIELD OBJECTS only...");
        fieldObjectsRef.current.forEach((fieldObj, id) => {
            // console.log(`[Cleanup] Removing object ${id} (type: ${fieldObj.type})`);
            scene.remove(fieldObj.objectGroup);
            fieldObj.objectGroup.traverse((child) => {
                 if (child instanceof Mesh) { child.geometry?.dispose(); if(Array.isArray(child.material)) { child.material.forEach(m => m.dispose()); } else { child.material?.dispose(); } }
                 else if (child instanceof Line) { child.geometry?.dispose(); if(Array.isArray(child.material)) { child.material.forEach(m => m.dispose()); } else { child.material?.dispose(); } }
            });
        });
        fieldObjectsRef.current.clear(); nextObjectIdRef.current = 0; setObjectCountUI(0);
        console.log("[Cleanup] Field objects removed.");
    }, []); // Ei riippuvuuksia

    // --- Create Visuals ---
    const createFluxTubeVisual = useCallback((): Group | null => {
        try {
            const group = new Group(); const tubeRadius = 0.1; const tubeColor = 0x00ff00;
            const startPoint = new Vector3(THREE.MathUtils.randFloat(-GRID_SIZE*0.4, GRID_SIZE*0.4), 0.1, THREE.MathUtils.randFloat(-GRID_SIZE*0.4, GRID_SIZE*0.4));
            const midPoint = new Vector3(THREE.MathUtils.randFloat(-GRID_SIZE*0.3, GRID_SIZE*0.3), THREE.MathUtils.randFloat(0.5, 2.5), THREE.MathUtils.randFloat(-GRID_SIZE*0.3, GRID_SIZE*0.3));
            const endPoint = new Vector3(THREE.MathUtils.randFloat(-GRID_SIZE*0.4, GRID_SIZE*0.4), 0.1, THREE.MathUtils.randFloat(-GRID_SIZE*0.4, GRID_SIZE*0.4));
            if (startPoint.distanceTo(midPoint) < 0.5 || midPoint.distanceTo(endPoint) < 0.5 || startPoint.distanceTo(endPoint) < 1.0) { midPoint.y += 1.0; endPoint.x += 2.0; }
            const curve = new CatmullRomCurve3([startPoint, midPoint, endPoint]);
            const geometry = new TubeGeometry(curve, 20, tubeRadius, 8, false); const material = new MeshStandardMaterial({ color: tubeColor, roughness: 0.6, metalness: 0.1 }); const mesh = new Mesh(geometry, material); group.add(mesh); group.userData.type = 'flux_tube';
            return group;
        } catch (error) { console.error("Error creating Flux Tube:", error); return null; }
    }, []); // Implisiittinen riippuvuus GRID_SIZE

    const createMEVisual = useCallback((): { group: Group; direction: Vector3 } | null => {
       try {
            const group = new Group(); const meLength = 0.1; const meRadius = 0.08; const meColor = 0xffffaa;
            const geometry = new CylinderGeometry(meRadius, meRadius, meLength, 12, 1); const material = new MeshStandardMaterial({ color: meColor, emissive: meColor, emissiveIntensity: 0.5, roughness: 0.8, transparent: true, opacity: 0.8 }); const mesh = new Mesh(geometry, material);
            mesh.rotation.z = Math.PI / 2; group.add(mesh);
            const startPos = new Vector3( THREE.MathUtils.randFloat(-GRID_SIZE * 0.45, GRID_SIZE * 0.45), THREE.MathUtils.randFloat(0.2, 3.0), THREE.MathUtils.randFloat(-GRID_SIZE * 0.45, GRID_SIZE * 0.45) ); group.position.copy(startPos);
            const direction = new Vector3( THREE.MathUtils.randFloatSpread(1), 0, THREE.MathUtils.randFloatSpread(1) ).normalize();
             if (direction.lengthSq() === 0) direction.set(1,0,0);
            group.quaternion.setFromUnitVectors(new Vector3(1, 0, 0), direction);
            group.userData.type = 'me';
            return { group, direction };
       } catch (error) { console.error("Error creating ME:", error); return null; }
    }, []); // Implisiittinen riippuvuus GRID_SIZE

    // --- Add Object Action ---
    const addObject = useCallback((type: FieldObjectType) => {
        const scene = sceneRef.current; if (!scene) { console.error("AddObject: Scene not ready"); return; }
        // console.log(`[AddObject] Attempting to add: ${type}`);
        const newId = nextObjectIdRef.current++; let newObjectData: FieldObjectData | null = null;
        if (type === 'flux_tube') {
            const visualResult = createFluxTubeVisual();
            if (visualResult) { scene.add(visualResult); newObjectData = { id: newId, type: type, objectGroup: visualResult }; }
            else { console.error("[AddObject] Failed to create flux tube visual."); }
        } else if (type === 'me') {
            const visualResult = createMEVisual();
            if (visualResult) { scene.add(visualResult.group); newObjectData = { id: newId, type: type, objectGroup: visualResult.group, direction: visualResult.direction, creationTime: clockRef.current?.getElapsedTime() ?? 0 }; }
            else { console.error("[AddObject] Failed to create ME visual."); }
        }
        if (newObjectData) { fieldObjectsRef.current.set(newId, newObjectData); setObjectCountUI(fieldObjectsRef.current.size); }
        else { nextObjectIdRef.current--; } // Peru ID jos epäonnistui
    }, [createFluxTubeVisual, createMEVisual]); // Riippuvuudet

    // --- Remove All Action (VAIN KENTTÄOBJEKTEILLE) ---
    const removeAllObjects = useCallback(() => {
        cleanupFieldObjects(); // Kutsu vain kenttäobjektien siivoajaa
    }, [cleanupFieldObjects]);

    // --- Initial Setup Effect ---
    useEffect(() => {
        if (!mountRef.current || isInitializedRef.current) return;
        const currentMount = mountRef.current; let rendererElement: HTMLCanvasElement | null = null; isInitializedRef.current = true;
        console.log("--- Initializing Module 4 ---");
        try {
            sceneRef.current = new THREE.Scene(); sceneRef.current.background = new THREE.Color(0x282c34);
            cameraRef.current = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000); cameraRef.current.position.set(0, 10, 25); cameraRef.current.lookAt(0, 1, 0);
            rendererRef.current = new THREE.WebGLRenderer({ antialias: true }); rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight); rendererRef.current.setPixelRatio(window.devicePixelRatio);
            rendererElement = rendererRef.current.domElement; currentMount.appendChild(rendererElement);
            const ambLight = new THREE.AmbientLight(0xffffff, 0.6); sceneRef.current.add(ambLight); const dirLight = new THREE.DirectionalLight(0xffffff, 0.8); dirLight.position.set(10, 15, 10); sceneRef.current.add(dirLight);
            controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement); controlsRef.current.enableDamping = true; controlsRef.current.dampingFactor = 0.05; controlsRef.current.target.set(0, 1, 0);
            // **** Luo GridHelper ja TALLENNA se refiin ****
            gridHelperRef.current = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x555555, 0x777777);
            sceneRef.current.add(gridHelperRef.current);
            clockRef.current = new Clock(isPlayingRef.current); if(isPlayingRef.current) clockRef.current.getDelta();
            console.log("--- Initial Setup Complete ---");

            const animate = () => {
                animationIdRef.current = requestAnimationFrame(animate);
                const r = rendererRef.current, s = sceneRef.current, ca = cameraRef.current, co = controlsRef.current, clock = clockRef.current;
                if (!r || !s || !ca || !co || !clock) { animationIdRef.current = undefined; return; }
                const delta = clock.running ? clock.getDelta() : 0; const elapsedTime = clock.getElapsedTime(); co.update();

                fieldObjectsRef.current.forEach((fieldObj) => {
                    if (fieldObj.type === 'me' && fieldObj.direction && isPlayingRef.current && delta > 0) {
                        const distance = LIGHT_SPEED_FACTOR * delta * animationSpeedRef.current; fieldObj.objectGroup.position.addScaledVector(fieldObj.direction, distance);
                        const mainMesh = fieldObj.objectGroup.children.find(c => c instanceof Mesh) as Mesh<CylinderGeometry, MeshStandardMaterial>;
                        if (mainMesh?.material instanceof MeshStandardMaterial) { mainMesh.material.emissiveIntensity = 0.5 + Math.sin(elapsedTime * 5 + fieldObj.id) * 0.3; }
                        // Poisto kommentoitu pois
                        // if (fieldObj.objectGroup.position.lengthSq() > (GRID_SIZE * 2)**2) { /* ... poisto setTimeoutilla ... */ }
                    }
                });
                r.render(s, ca);
            };
            animate();
        } catch (error) { console.error("Error during initial setup:", error); }

        const handleResize = () => { if (!rendererRef.current || !cameraRef.current || !currentMount) return; const w=currentMount.clientWidth,h=currentMount.clientHeight; cameraRef.current.aspect=w/h; cameraRef.current.updateProjectionMatrix(); rendererRef.current.setSize(w,h); }; window.addEventListener('resize', handleResize);

        // --- KOMPONENTIN POISTON cleanup ---
        return () => {
             console.log("--- Cleaning up Module 4 (UNMOUNT) ---");
             isInitializedRef.current=false; if(animationIdRef.current) cancelAnimationFrame(animationIdRef.current); animationIdRef.current = undefined;
             window.removeEventListener('resize', handleResize); controlsRef.current?.dispose();

             // **** Siivoa GridHelper TÄÄLLÄ ****
             if (gridHelperRef.current && sceneRef.current) {
                 console.log("[Unmount Cleanup] Removing GridHelper...");
                 sceneRef.current.remove(gridHelperRef.current);
                 gridHelperRef.current.geometry?.dispose();
                 (Array.isArray(gridHelperRef.current.material)?gridHelperRef.current.material:[gridHelperRef.current.material]).forEach(m=>(m as Material)?.dispose());
                 gridHelperRef.current = null;
             }

             // Siivoa myös kenttäobjektit
             cleanupFieldObjects();

             rendererRef.current?.dispose(); if(currentMount && rendererElement && currentMount.contains(rendererElement)) currentMount.removeChild(rendererElement);
             rendererRef.current=null; sceneRef.current=null; cameraRef.current=null; clockRef.current=null; controlsRef.current=null;
             console.log("--- Module 4 Cleanup Finished (UNMOUNT) ---");
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleanupFieldObjects]); // Poistettu add/create riippuvuudet

    // --- Target Update Effect ---
    useEffect(() => { if (controlsRef.current) { controlsRef.current.target.set(0, 1, 0); } }, [objectCountUI]);

    // --- UI Event Handlers ---
    const togglePlayPause = () => setIsPlaying(prev => !prev);
    const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => animationSpeedRef.current = parseFloat(e.target.value);
    const handleAddFluxTube = () => addObject('flux_tube');
    const handleAddME = () => addObject('me');
    const handleRemoveAll = () => removeAllObjects(); // Tämä kutsuu nyt cleanupFieldObjects

    const toggleDescription = () => {
      setIsDescriptionVisible(prev => !prev);
    };
return (
    <div className={viewStyles.moduleContainer}>
        <h2 className={viewStyles.moduleTitle}>Moduuli 4: Topologinen Kenttäkvantisointi ja ME:t</h2>
        <button
                onClick={toggleDescription}
                className={`${viewStyles.toggleButton} ${!isDescriptionVisible ? viewStyles.toggleButtonHidden : ''}`}
             >
                {isDescriptionVisible ? 'Piilota Selitys' : 'Näytä Selitys'}
             </button>
        <div className={`${viewStyles.description} ${!isDescriptionVisible ? viewStyles.descriptionHidden : ''}`}>
        <p> TGD:ssä klassiset kentät, kuten sähkömagneettinen kenttä, eivät ole sileitä ja kaikkialla avaruudessa vaikuttavia, vaan ne ovat kvantittuneet topologisiksi rakenteiksi aika-avaruusarkeilla. Sen sijaan että kenttä täyttäisi avaruuden, sen energia ja vuo keskittyvät näihin rakenteisiin. </p> <ul style={{fontSize: '0.9em', marginBottom: '1em'}}> <li><strong>Vuoputket (Flux Tubes):</strong> Nämä ovat putkimaisia (1D- tai 2D-) rakenteita, jotka kantavat kentän vuota (esim. magneettikenttä). Ne voivat olla suljettuja silmukoita tai yhdistää eri kohteita. Ne ovat keskeisiä mm. hadronifysiikassa ja energiansiirrossa TGD-mallissa. Tässä ne visualisoidaan vihreinä, kaartuvina putkina.</li> <li><strong>Massattomat Ekstremaalit (ME, "Topological Light Rays"):</strong> Nämä ovat TGD:n vastineita säteilykvanteille (kuten fotonit ja gravitonit). Ne ovat putkimaisia tai levymäisiä rakenteita, jotka etenevät valonnopeudella ja joiden sisällä voi olla oskilloivia sähkömagneettisia (tai muita) kenttiä. Ne voivat kuljettaa energiaa ja informaatiota ilman dispersiota pitkiäkin matkoja. Tässä ne visualisoidaan kellertävinä, hehkuvina ja etenevinä "säteinä".</li> </ul>
        <p>Käytä kontrolleja luodaksesi vuoputkia ja ME-objekteja sceneen sekä hallitaksesi ME-animaatiota.</p>
        </div>
        {/* Canvas container */}
        <div className={viewStyles.canvasContainer} ref={mountRef} style={{ width: '100%', height: '60vh', border: '1px solid #ccc', marginTop: '10px', position: 'relative', cursor: 'grab' }}>{/* Canvas */}</div>
         <div style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f8f8f8', borderRadius: '4px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px 20px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}> <button onClick={togglePlayPause} style={{ padding: '8px 15px', minWidth: '80px' }}> {isPlaying ? 'Pause ME' : 'Play ME'} </button> </div>
            <div> <label className={viewStyles.label} htmlFor="speedSlider4" style={{ fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>ME Animaation Nopeus:</label> <div style={{ display: 'flex', alignItems: 'center' }}> <input type="range" id="speedSlider4" min="0" max={10} step="0.1" defaultValue={animationSpeedRef.current} onChange={handleSpeedChange} style={{ width: '100%' }}/> </div> </div>
            <div> {/* Tyhjä paikka */} </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}> <button onClick={handleAddFluxTube} style={{ padding: '8px 15px' }}> Luo Vuoputki </button> <button onClick={handleAddME} style={{ padding: '8px 15px' }}> Luo ME </button> </div>
            <div> <button onClick={handleRemoveAll} disabled={objectCountUI === 0} style={{ padding: '8px 15px', width: '100%' }}> Poista Kaikki </button> </div>
            <div style={{fontFamily: 'monospace'}}>Objekteja: {objectCountUI}</div>
         </div>
    </div>
);
};

export default FieldsMEsView;