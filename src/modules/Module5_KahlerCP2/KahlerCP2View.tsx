import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ParametricGeometry } from 'three/examples/jsm/geometries/ParametricGeometry.js'; // Käytetään parametrista geometriaa
import viewStyles from '@/styles/ModuleView.module.css';

// --- Shaderit CP2-metaforalle ---

const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition; // Kameran suunta verteksiin nähden

  void main() {
    vNormal = normalize(normalMatrix * normal); // Normaali maailman koordinaateissa
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * worldPosition;
    vViewPosition = -viewPosition.xyz; // Vektori verteksistä kameraan
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  // Yksinkertainen "kaarevuus"-approksimaatio normaalin perusteella
  // Tai käytetään sijaintia/normaalia suoraan väriin
  float calculatePseudoCurvature(vec3 normal) {
    // Esimerkki: Kuinka paljon normaali poikkeaa Y-akselista
    // Tai käytä jotain monimutkaisempaa
    return 1.0 - abs(dot(normalize(normal), vec3(0.0, 1.0, 0.0)));
    // Tai käytä esim. Fresnel-efektiä
    // float fresnel = pow(1.0 - abs(dot(normalize(vViewPosition), normalize(vNormal))), 3.0);
    // return fresnel;

  }

  // HSL to RGB conversion
    vec3 hsl2rgb( vec3 c ) {
        vec3 rgb = clamp( abs( mod( c.x * 6.0 + vec3( 0.0, 4.0, 2.0 ), 6.0 ) - 3.0 ) - 1.0, 0.0, 1.0 );
        return c.z + c.y * ( rgb - 0.5 ) * ( 1.0 - abs( 2.0 * c.z - 1.0 ) );
    }


  void main() {
    float curvature = calculatePseudoCurvature(vNormal);

    // Väritetään sijainnin perusteella HSL-avaruudessa
    // Normalisoidaan sijainti esim. välille 0-1 (vaatii objektin koon tuntemista)
    // Tässä karkea normalisointi olettaen objektin olevan origon ympärillä
    vec3 normalizedPosition = normalize(vViewPosition) * 0.5 + 0.5; // Karkea normalisointi

    // Käytä normaalia ja sijaintia värin sävyn (hue) ja saturaation määrittelyyn
    float hue = fract(normalizedPosition.x * 1.5 + normalizedPosition.y * 0.8 + vNormal.z * 0.5); // Leikittele kertoimilla
    float saturation = 0.6 + vNormal.y * 0.3; // Saturoituneempi ylhäällä/alhaalla
    float lightness = 0.5 + curvature * 0.2 - dot(normalize(vViewPosition), vNormal)*0.1; // Vaaleampi "kaarevissa" kohdissa, tummempi suoraan kohti

    vec3 color = hsl2rgb(vec3(hue, clamp(saturation, 0.4, 0.9), clamp(lightness, 0.3, 0.7)));


    gl_FragColor = vec4(color, 1.0); // Käytä laskettua väriä
    // gl_FragColor = vec4(vNormal * 0.5 + 0.5, 1.0); // Tai näytä normaalit testinä
  }
`;


// --- Parametrinen pinta -funktio (esimerkki: Klein bottle -tyyppinen) ---
// Tämä funktio määrittelee pinnan muodon (x, y, z) u:n ja v:n funktiona (0..1)
const parametricSurfaceFunction = (u: number, v: number, target: THREE.Vector3): void => {
    const R = 1.5; // Pääsäde
    const r = 0.5; // Putken säde
    const scale = 4.0; // Kokonaisskaalaus

    u *= Math.PI;
    v *= 2 * Math.PI;

    const x = (R + r * Math.cos(u / 2) * Math.sin(v) - r * Math.sin(u / 2) * Math.sin(2 * v)) * Math.cos(u);
    const y = (R + r * Math.cos(u / 2) * Math.sin(v) - r * Math.sin(u / 2) * Math.sin(2 * v)) * Math.sin(u);
    const z = r * Math.sin(u / 2) * Math.sin(v) + r * Math.cos(u / 2) * Math.sin(2 * v);

    target.set(x, y, z).multiplyScalar(scale);
};


// --- Component ---
const KahlerCP2View: React.FC = () => {
    // --- Refs ---
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const meshRef = useRef<THREE.Mesh | null>(null); // Ref CP2-metaforalle
    const animationIdRef = useRef<number>();
    const isInitializedRef = useRef<boolean>(false);

    const [isDescriptionVisible, setIsDescriptionVisible] = useState<boolean>(false);

    // --- Cleanup ---
    const cleanupSceneContent = useCallback(() => {
        const scene = sceneRef.current;
        const mesh = meshRef.current;
        if (scene && mesh) {
            scene.remove(mesh);
            mesh.geometry?.dispose();
            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(m => m.dispose());
            } else {
                mesh.material?.dispose();
            }
            meshRef.current = null;
        }
    }, []);

    // --- Initial Setup Effect ---
    useEffect(() => {
        if (!mountRef.current || isInitializedRef.current) return;
        const currentMount = mountRef.current;
        let rendererElement: HTMLCanvasElement | null = null;
        isInitializedRef.current = true;

        try {
            // Core Three.js setup
            sceneRef.current = new THREE.Scene();
            sceneRef.current.background = new THREE.Color(0x111111); // Hyvin tumma tausta

            cameraRef.current = new THREE.PerspectiveCamera(70, currentMount.clientWidth / currentMount.clientHeight, 0.1, 100);
            cameraRef.current.position.set(0, 0, 12); // Kamera kauempana

            rendererRef.current = new THREE.WebGLRenderer({ antialias: true });
            rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight);
            rendererRef.current.setPixelRatio(window.devicePixelRatio);
            rendererElement = rendererRef.current.domElement;
            currentMount.appendChild(rendererElement);

            // Valaistus (vaikuttaa vähän ShaderMaterialiin ilman lisäkoodia, mutta hyvä olla olemassa)
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
            sceneRef.current.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
            directionalLight.position.set(1, 1, 1);
            sceneRef.current.add(directionalLight);

            // Kontrollit
            controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement);
            controlsRef.current.enableDamping = true;
            controlsRef.current.dampingFactor = 0.05;
            controlsRef.current.autoRotate = true; // Automaattinen pyöritys
            controlsRef.current.autoRotateSpeed = 0.5;

            // Luo CP2-metafora geometria ja materiaali
            const divisions = 100; // Lisää tarkkuutta
            const geometry = new ParametricGeometry(parametricSurfaceFunction, divisions, divisions);

            const material = new THREE.ShaderMaterial({
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                side: THREE.DoubleSide,
                // Uniforms can be added here later for time-based animation or interaction
                // uniforms: { time: { value: 0.0 } }
            });

            const mesh = new THREE.Mesh(geometry, material);
            meshRef.current = mesh;
            sceneRef.current.add(mesh);

            // Animaatioloop (vain kontrollien päivitys)
            const animate = () => {
                animationIdRef.current = requestAnimationFrame(animate);
                const r = rendererRef.current, s = sceneRef.current, ca = cameraRef.current, co = controlsRef.current;
                if (!r || !s || !ca || !co) return;

                co.update(); // Päivitä kontrollit (tarvitaan autoRotateen ja dampingiin)

                // Voisit päivittää shaderin 'time' uniformia tässä, jos lisäät sen
                // if (material.uniforms.time) {
                //   material.uniforms.time.value = clockRef.current.getElapsedTime();
                // }

                r.render(s, ca);
            };
            animate();

        } catch (error) { console.error("Error during initial setup:", error); }

        const handleResize = () => { if (!rendererRef.current || !cameraRef.current || !currentMount) return; const w=currentMount.clientWidth,h=currentMount.clientHeight; cameraRef.current.aspect=w/h; cameraRef.current.updateProjectionMatrix(); rendererRef.current.setSize(w,h); }; window.addEventListener('resize', handleResize);

        return () => {
            isInitializedRef.current = false; if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current); window.removeEventListener('resize', handleResize); controlsRef.current?.dispose();
            cleanupSceneContent(); // Siivoa luotu mesh
            rendererRef.current?.dispose(); if (currentMount && rendererElement && currentMount.contains(rendererElement)) currentMount.removeChild(rendererElement); rendererRef.current = null; sceneRef.current = null; cameraRef.current = null; /*clockRef*/ controlsRef.current = null;
        };
    }, [cleanupSceneContent]); // Riippuu cleanupista

    const toggleDescription = () => {
      setIsDescriptionVisible(prev => !prev);
    };

    return (
        <div className={viewStyles.moduleContainer}>
            <h2 className={viewStyles.moduleTitle}>Moduuli 5: Kähler-geometria ja CP<sub>2</sub> (Symbolinen Esitys)</h2>
            <button
                onClick={toggleDescription}
                className={`${viewStyles.toggleButton} ${!isDescriptionVisible ? viewStyles.toggleButtonHidden : ''}`}
             >
                {isDescriptionVisible ? 'Piilota Selitys' : 'Näytä Selitys'}
             </button>
            <div className={`${viewStyles.description} ${!isDescriptionVisible ? viewStyles.descriptionHidden : ''}`}>
            <p>
                Yksi TGD:n kulmakivistä on 8-ulotteinen aika-avaruus M⁴ x CP<sub>2</sub>. Vaikka M⁴ edustaa tuttua aika-avaruutta,
                CP<sub>2</sub> (Kompleksinen Projektiivinen Taso 2) on kompaktimpi, 4-ulotteinen avaruus, jonka geometria on äärimmäisen rikas.
                CP<sub>2</sub>:n geometriaa kuvaa **Kähler-metriikka**, joka sisältää sekä Riemannin metriikan (etäisyydet ja kaarevuus) että symplektisen muodon (liittyy faasiavaruuksiin ja kvantisointiin).
            </p>
             <ul style={{fontSize: '0.9em', marginBottom: '1em'}}>
                <li><strong>Merkitys fysiikassa:</strong> CP<sub>2</sub>:n geometria ja topologia määrittävät Standardimallin symmetriat (väri SU(3) ja sähköheikko SU(2)xU(1)). Eri kohdat CP<sub>2</sub>:ssa vastaavat eri tavoin näitä symmetrioita. CP<sub>2</sub>:n holonomiaryhmä on SU(3)xU(1), ja sen avulla voidaan ymmärtää mm. värivaraus ja hiukkasten kiraalisuus.</li>
                <li><strong>Kählerin Funktio:</strong> Kähler-geometria voidaan johtaa yhdestä funktiosta, Kählerin funktiosta. Sen muoto määrää koko geometrian ja siten fysiikan lakeja.</li>
                 <li><strong>Visualisoinnin haaste:</strong> Koska CP<sub>2</sub> on 4-ulotteinen ja kompleksinen, sitä ei voi visualisoida tarkasti 3D:ssä. Tämä visualisointi on **abstrakti ja metaforinen**. Se EI esitä CP<sub>2</sub>:n todellista muotoa.</li>
                <li><strong>Mitä näet:</strong> Näet monimutkaisen, itsensä leikkaavan pinnan, jonka värit on laskettu shaderilla perustuen pinnan normaaliin ja sijaintiin. Eri värit ja sävyt symboloivat CP<sub>2</sub>-geometrian vaihtelua ja monimutkaisuutta. Voit ajatella eri alueita vastaavan eri fysikaalisia ominaisuuksia (esim. eri värisävy voisi liittyä värivaraukseen). Automaattinen pyöritys auttaa hahmottamaan muotoa.</li>
             </ul>
            <p>Käytä hiirtä pyörittelyyn ja zoomaukseen tutkiaksesi tätä symbolista esitystä.</p>
            </div>
            {/* Canvas container */}
            <div className={viewStyles.canvasContainer} ref={mountRef} style={{ width: '100%', height: '70vh', border: '1px solid #ccc', marginTop: '10px', position: 'relative', cursor: 'grab' }}>
                {/* Canvas */}
            </div>
             {/* Tähän voisi myöhemmin lisätä interaktiivisuutta, esim. pisteen valinta */}

        </div>
    );
};

export default KahlerCP2View;