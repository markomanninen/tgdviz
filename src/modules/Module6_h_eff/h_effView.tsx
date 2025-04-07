import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshStandardMaterial, Mesh, SphereGeometry, PointLight } from 'three';
import viewStyles from '@/styles/ModuleView.module.css';

// --- Vakiot ---
const BASE_RADIUS = 0.5; // Hiukkasen/aaltopaketin perussäde kun n=1
const MAX_N_VALUE = 10; // Suurin n:n arvo sliderille (voi olla logaritminenkin)
// const SCALE_FACTOR_PER_N = 1.5; // Kuinka paljon säde kasvaa per n (esim. r ~ n*SCALE_FACTOR) tai n^2
const N_POWER_FOR_RADIUS = 1.5; // Potenssi, johon n korotetaan sädettä laskettaessa (esim. 1, 1.5 tai 2)


// --- Component ---
const HEffView: React.FC = () => {
    // --- Refs ---
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const particleMeshRef = useRef<Mesh<SphereGeometry, MeshStandardMaterial> | null>(null);
    const particleLightRef = useRef<PointLight | null>(null);
    const animationIdRef = useRef<number>();
    const isInitializedRef = useRef<boolean>(false);

    // --- State ---
    const [nValue, setNValue] = useState<number>(1); // h_eff = n * h, alkaa arvosta 1
    const [currentRadius, setCurrentRadius] = useState<number>(BASE_RADIUS);
    const [isDescriptionVisible, setIsDescriptionVisible] = useState<boolean>(false);

    // --- Cleanup ---
    const cleanupSceneContent = useCallback(() => {
        const scene = sceneRef.current;
        const particleMesh = particleMeshRef.current;
        const particleLight = particleLightRef.current;

        if (scene) {
            if (particleMesh) {
                scene.remove(particleMesh);
                particleMesh.geometry?.dispose();
                particleMesh.material?.dispose();
                particleMeshRef.current = null;
            }
             if (particleLight) {
                scene.remove(particleLight);
                particleLightRef.current = null;
            }
        }
    }, []);

    // --- Create/Update Particle Visualisation ---
    const updateParticleVisual = useCallback((n: number) => {
        const scene = sceneRef.current;
        if (!scene) return;

        // Laske uusi säde
        const newRadius = BASE_RADIUS * Math.pow(n, N_POWER_FOR_RADIUS);
        setCurrentRadius(newRadius); // Päivitä state UI:ta varten

        // Poista vanha mesh ja valo
        cleanupSceneContent();

        // Luo uusi pallo uudella säteellä
        const segments = Math.max(16, Math.min(64, 16 + Math.floor(n * 4))); // Lisää segmenttejä isompaan palloon
        const geometry = new SphereGeometry(newRadius, segments, Math.floor(segments / 2));
        const material = new MeshStandardMaterial({
            color: 0x88ddff,
            emissive: 0x44aadd,
            emissiveIntensity: 0.4,
            transparent: true,
            opacity: Math.max(0.1, 0.8 / Math.pow(n, 0.7)), // Himmeämpi/läpinäkyvämpi isommalla n:llä
            roughness: 0.8,
            metalness: 0.1,
            depthWrite: false,
        });

        const mesh = new Mesh(geometry, material);
        particleMeshRef.current = mesh;
        scene.add(mesh);

         // Lisää valo pallon keskelle
        const lightIntensity = 1.0 + n * 0.2;
        const light = new PointLight(0xffffff, lightIntensity, newRadius * 5 + 5); // Kantama kasvaa myös
        particleLightRef.current = light;
        scene.add(light);

        // Päivitä kameran etäisyyttä hieman pallon koon mukaan (valinnainen)
        if (cameraRef.current) {
            const targetZ = Math.max(10, newRadius * 3 + 5); // Zoomaa ulos isommalla pallolla
            // Voit animoida tämän muutoksen pehmeämmin (esim. GSAP tai TWEEN.js)
            cameraRef.current.position.z = targetZ;
        }


    }, [cleanupSceneContent]); // Riippuu cleanupista

    // --- Initial Setup Effect ---
    useEffect(() => {
        if (!mountRef.current || isInitializedRef.current) return;
        const currentMount = mountRef.current; let rendererElement: HTMLCanvasElement | null = null; isInitializedRef.current = true;

        try {
            sceneRef.current = new THREE.Scene();
            sceneRef.current.background = new THREE.Color(0x0f0f1f);

            cameraRef.current = new THREE.PerspectiveCamera(60, currentMount.clientWidth / currentMount.clientHeight, 0.1, 200);
            cameraRef.current.position.set(0, 0, 15); // Oletusetäisyys

            rendererRef.current = new THREE.WebGLRenderer({ antialias: true });
            rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
            rendererRef.current.setPixelRatio(window.devicePixelRatio);
            rendererElement = rendererRef.current.domElement;
            currentMount.appendChild(rendererElement);

            controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
            controlsRef.current.enableDamping = true;
            controlsRef.current.dampingFactor = 0.05;
            controlsRef.current.enablePan = false;
            controlsRef.current.target.set(0, 0, 0);

            // Luo alkutilan hiukkanen
            updateParticleVisual(nValue); // Kutsu heti tässä

            const animate = () => {
                animationIdRef.current = requestAnimationFrame(animate);
                const r = rendererRef.current, s = sceneRef.current, ca = cameraRef.current, co = controlsRef.current;
                if (!r || !s || !ca || !co) return;

                co.update();

                const particleMesh = particleMeshRef.current;
                if (particleMesh) {
                    const scaleFactor = 1.0 + Math.sin(Date.now() * 0.001) * 0.02;
                    particleMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
                }

                r.render(s, ca);
            };
            animate();

        } catch (error) { console.error("Error during initial setup:", error); }

        const handleResize = () => { if (!rendererRef.current || !cameraRef.current || !currentMount) return; const w=currentMount.clientWidth,h=currentMount.clientHeight; ca.aspect=w/h; ca.updateProjectionMatrix(); rendererRef.current.setSize(w,h); }; window.addEventListener('resize', handleResize);

        return () => {
            isInitializedRef.current = false; if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current); window.removeEventListener('resize', handleResize); controlsRef.current?.dispose();
            cleanupSceneContent();
            rendererRef.current?.dispose(); if (currentMount && rendererElement && currentMount.contains(rendererElement)) currentMount.removeChild(rendererElement); rendererRef.current = null; sceneRef.current = null; cameraRef.current = null; controlsRef.current = null;
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleanupSceneContent, updateParticleVisual]); // Riippuu clean/update

    // Efekti visualisoinnin päivittämiseksi kun nValue muuttuu
    useEffect(() => {
        if (!isInitializedRef.current) return; // Aja vain alustuksen jälkeen
        updateParticleVisual(nValue);
    }, [nValue, updateParticleVisual]);

    // --- UI Event Handlers ---
    const handleNChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setNValue(parseInt(event.target.value, 10));
    };

    const toggleDescription = () => {
      setIsDescriptionVisible(prev => !prev);
    };

    return (
        <div className={viewStyles.moduleContainer}>
            <h2 className={viewStyles.moduleTitle}>Moduuli 6: Planckin Vakion Hierarkia (h<sub>eff</sub>)</h2>
            <button
                onClick={toggleDescription}
                className={`${viewStyles.toggleButton} ${!isDescriptionVisible ? viewStyles.toggleButtonHidden : ''}`}
             >
                {isDescriptionVisible ? 'Piilota Selitys' : 'Näytä Selitys'}
             </button>
            <div className={`${viewStyles.description} ${!isDescriptionVisible ? viewStyles.descriptionHidden : ''}`}>
            <p>
                Yksi TGD:n radikaaleimmista ehdotuksista on **Planckin vakion hierarkia**. Sen sijaan, että Planckin vakio `h` olisi universaali vakio, TGD ehdottaa
                efektiivisen Planckin vakion `h_eff` olemassaoloa, joka voi olla moninkerta (`n`) perus-Planckin vakiosta: `h_eff = n * h`.
                Tämä hierarkia liittyy läheisesti **pimeän aineen** hierarkiaan TGD:ssä.
            </p>
             <ul style={{fontSize: '0.9em', marginBottom: '1em'}}>
                {/* **** KORJATTU TAGI TÄSSÄ **** */}
                <li><strong>Suurempi `n`, Suurempi Skaala:</strong> Eri `n`:n arvot vastaavat eri kvanttiskaaloja. Suuremmat `n`:n arvot mahdollistavat kvantti-ilmiöiden ja kvanttikoherenssin ilmenemisen paljon suuremmissa avaruudellisissa ja ajallisissa skaaloissa kuin tavallisessa kvanttimekaniikassa (jossa n=1).</li>
                <li><strong>Pimeä Aine:</strong>TGD:n mukaan eri `n`:n arvoilla varustetut systeemit vuorovaikuttavat heikosti keskenään ja käyttäytyvät kuin pimeä aine toistensa suhteen. Suuremman `h_eff`:n systeemit voivat kontrolloida pienemmän `h_eff`:n systeemejä.</li>
                <li><strong>Elämä ja Tietoisuus:</strong> TGD ehdottaa, että elävät systeemit hyödyntävät tätä `h_eff`-hierarkiaa mahdollistaen makroskooppisen kvanttikoherenssin, joka on välttämätöntä monimutkaisille prosesseille kuten tietoisuudelle ja aivotoiminnalle.</li>
                <li><strong>Visualisointi:</strong> Tämä visualisointi esittää symbolisesti, miten hiukkasen kvanttivaikutusalue (aaltofunktion leviäminen tai "koko") skaalautuu `n`:n arvon mukaan. Suurempi `n` tarkoittaa laajempaa kvanttivaikutusta. Pallo hehkuu ja sen läpinäkyvyys vähenee `n`:n kasvaessa, symboloiden suurempaa "kvanttiutta" laajemmassa skaalassa.</li>
             </ul>
            <p>Säädä `n`:n arvoa liukusäätimellä nähdäksesi kvanttiskaalan muutoksen.</p>

            </div>
            {/* Canvas container */}
            <div className={viewStyles.canvasContainer} ref={mountRef} style={{ width: '100%', height: '60vh', border: '1px solid #ccc', marginTop: '10px', position: 'relative', cursor: 'grab', backgroundColor: '#0f0f1f' }}>
                {/* Canvas */}
            </div>

             {/* --- UI Controls --- */}
            <div className={viewStyles.controlsPanel} style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f8f8f8', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                 <div>
                    <label className={viewStyles.label} htmlFor="nSlider" style={{ marginRight: '10px', fontWeight: 'bold' }}>Efektiivinen Planckin Vakio: h<sub>eff</sub> = n * h</label>
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', width: '80%', maxWidth: '500px' }}>
                    <span className={viewStyles.valueDisplay}>n = 1</span>
                    <input
                        type="range"
                        id="nSlider"
                        min="1"
                        max={MAX_N_VALUE}
                        step="1" // Vain kokonaislukuja n:lle
                        value={nValue}
                        onChange={handleNChange}
                        style={{ flexGrow: 1, margin: '0 10px' }}
                    />
                    <span className={viewStyles.valueDisplay}>n = {MAX_N_VALUE}</span>
                 </div>
                 <div className={viewStyles.valueDisplay} style={{fontFamily: 'monospace', fontSize: '0.9em'}}>
                     Nykyinen n = {nValue} | Suhteellinen Kvanttiskaala (Säde ~ n<sup>{N_POWER_FOR_RADIUS.toFixed(1)}</sup>): {currentRadius.toFixed(2)} (Perussäde = {BASE_RADIUS})
                 </div>
            </div>

        </div>
    );
};

export default HEffView;