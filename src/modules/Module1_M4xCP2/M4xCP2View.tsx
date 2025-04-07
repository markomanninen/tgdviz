import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Clock } from 'three';
import { BufferGeometry, Material, InstancedMesh, MeshStandardMaterial, Plane, Vector3, Mesh, BoxHelper } from 'three'; // Added BoxHelper
import viewStyles from '@/styles/ModuleView.module.css';

// --- Helper Functions & Constants ---
const updateSheetGeometry = (geometry: THREE.BufferGeometry | null, time: number) => { /* ... */ if (!geometry) return; const pos = geometry.attributes.position as THREE.BufferAttribute; const init = geometry.userData.initialPositions as Float32Array; if (!init || !pos) return; for (let i = 0; i < pos.count; i++) { const x = init[i*3], y = init[i*3+1]; const z = Math.sin(x*.3+time*.5)*.5+Math.cos(y*.3+time*.3)*.5; pos.setZ(i,z); } pos.needsUpdate=true; geometry.computeVertexNormals(); };
function getRandom(min: number, max: number): number { return Math.random() * (max - min) + min; }
const GRID_SIZE = 20; const CP2_BASE_Y = 0.3; const BASE_SCALE = 1.0; const BASE_ROTATION_SPEED = 0.8;
type VariationLevel = 'low' | 'medium' | 'high';
const variationSettings: Record<VariationLevel, { scaleRange: number; speedRange: number }> = { low: { scaleRange: 0.1, speedRange: 0.2 }, medium: { scaleRange: 0.4, speedRange: 0.6 }, high: { scaleRange: 0.8, speedRange: 1.2 } };
interface GeometryParams { type: 'Torus' | 'TorusKnot'; key: string; radius?: number; tube?: number; radialSegments?: number; tubularSegments?: number; p?: number; q?: number; }
const geometryPools: Record<VariationLevel, GeometryParams[]> = { low: [ { key: 'torus_simple', type: 'Torus', radius: 0.25, tube: 0.1, radialSegments: 12, tubularSegments: 48 }, ], medium: [ { key: 'torus_medium', type: 'Torus', radius: 0.25, tube: 0.1, radialSegments: 16, tubularSegments: 64 }, { key: 'knot_2_3_medium', type: 'TorusKnot', radius: 0.25, tube: 0.09, tubularSegments: 64, radialSegments: 8, p: 2, q: 3 }, ], high: [ /* ... high variation geometries ... */ { key: 'torus_high', type: 'Torus', radius: 0.25, tube: 0.1, radialSegments: 24, tubularSegments: 100 }, { key: 'knot_2_3_high', type: 'TorusKnot', radius: 0.25, tube: 0.08, tubularSegments: 128, radialSegments: 10, p: 2, q: 3 }, { key: 'knot_4_5_thick', type: 'TorusKnot', radius: 0.22, tube: 0.11, tubularSegments: 128, radialSegments: 12, p: 4, q: 5 }, { key: 'knot_3_7_thin', type: 'TorusKnot', radius: 0.28, tube: 0.06, tubularSegments: 128, radialSegments: 12, p: 3, q: 7 }, { key: 'knot_5_4_complex', type: 'TorusKnot', radius: 0.25, tube: 0.07, tubularSegments: 192, radialSegments: 16, p: 5, q: 4 } ] };
function createGeometry(params: GeometryParams): BufferGeometry { if (params.type === 'Torus') return new THREE.TorusGeometry(params.radius, params.tube, params.radialSegments, params.tubularSegments); else if (params.type === 'TorusKnot') return new THREE.TorusKnotGeometry(params.radius, params.tube, params.tubularSegments, params.radialSegments, params.p, params.q); return new THREE.SphereGeometry(0.2); }
const TIME_SLIDER_MAX = 20; const SPEED_SLIDER_MAX = 5; const INSTANCE_COUNT_MIN = 10; const INSTANCE_COUNT_MAX = 500; const CLIP_RANGE = GRID_SIZE / 2;
// Store geometry params along with animation data
interface InstanceAnimData { matrix: THREE.Matrix4; rotationAxis: THREE.Vector3; rotationSpeed: number; baseScale: THREE.Vector3; geometryParams: GeometryParams; } // Added geometryParams
interface InstanceGroupData { mesh: InstancedMesh; geometry: BufferGeometry; animationData: InstanceAnimData[]; } // Updated animationData type
const disposeMaterial = (material: Material | Material[] | null) => { if (!material) return; (Array.isArray(material) ? material : [material]).forEach(m => m.dispose()); };

// State type for selected instance info
interface SelectedInstanceInfo {
    groupKey: string;
    instanceId: number;
    params: GeometryParams;
}

const M4xCP2View: React.FC = () => {
    // --- Refs ---
    const mountRef = useRef<HTMLDivElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const clockRef = useRef<THREE.Clock | null>(null);
    const animationIdRef = useRef<number>();
    const sheetMeshRef = useRef<Mesh<BufferGeometry, MeshStandardMaterial> | null>(null);
    const gridHelperRef = useRef<THREE.GridHelper | null>(null);
    const instanceGroupsRef = useRef<Record<string, InstanceGroupData>>({});
    const sharedMaterialRef = useRef<MeshStandardMaterial | null>(null);
    const highlightMarkerRef = useRef<THREE.Mesh | null>(null); // For sheet click
    const highlightBoxRef = useRef<BoxHelper | null>(null); // For instance highlight
    const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
    const mousePosRef = useRef<THREE.Vector2>(new THREE.Vector2());
    const dummyObject = useRef<THREE.Object3D>(new THREE.Object3D());
    const clipPlanesRef = useRef<THREE.Plane[]>([]);
    const isInitializedRef = useRef<boolean>(false);

    // --- State Variables ---
    const [timeSlider, setTimeSlider] = useState<number>(0); const [isPlaying, setIsPlaying] = useState<boolean>(true); const [animationSpeed, setAnimationSpeed] = useState<number>(1.0); const [instanceCount, setInstanceCount] = useState<number>(50); const [variationLevel, setVariationLevel] = useState<VariationLevel>('medium'); const [clippingEnabled, setClippingEnabled] = useState<boolean>(false); const [clipXMin, setClipXMin] = useState<number>(-CLIP_RANGE); const [clipXMax, setClipXMax] = useState<number>(CLIP_RANGE); const [clipYMin, setClipYMin] = useState<number>(-CLIP_RANGE); const [clipYMax, setClipYMax] = useState<number>(CLIP_RANGE); const [clipZMin, setClipZMin] = useState<number>(-CLIP_RANGE); const [clipZMax, setClipZMax] = useState<number>(CLIP_RANGE); const [highlightCoords, setHighlightCoords] = useState<string>('');
    const [selectedInstanceInfo, setSelectedInstanceInfo] = useState<SelectedInstanceInfo | null>(null); // State for selected CP2 info
    const [isDescriptionVisible, setIsDescriptionVisible] = useState<boolean>(false);

    // --- State Refs ---
    const timeRef = useRef<number>(timeSlider); const isPlayingRef = useRef<boolean>(isPlaying); const animationSpeedRef = useRef<number>(animationSpeed);
    useEffect(() => { timeRef.current = timeSlider; }, [timeSlider]); useEffect(() => { isPlayingRef.current = isPlaying; clockRef.current?.[isPlaying ? 'start' : 'stop'](); }, [isPlaying]); useEffect(() => { animationSpeedRef.current = animationSpeed; }, [animationSpeed]);

    // --- Clipping Plane Update Effect ---
    useEffect(() => { /* ... clipping effect ... */ if (!isInitializedRef.current) return; const planes: Plane[] = []; if (clippingEnabled) { planes.push(/*...*/); } clipPlanesRef.current = planes; const applyClipping = (material: Material | null) => { if (material && 'clippingPlanes' in material) { (material as MeshStandardMaterial).clippingPlanes = planes; material.needsUpdate = true; } }; applyClipping(sheetMeshRef.current?.material ?? null); applyClipping(sharedMaterialRef.current); if (rendererRef.current) { rendererRef.current.localClippingEnabled = clippingEnabled; } }, [clippingEnabled, clipXMin, clipXMax, clipYMin, clipYMax, clipZMin, clipZMax]);

    // --- Cleanup for Dynamic Objects ---
    const cleanupDynamicObjects = useCallback(() => {
        // console.log("Cleanup Dynamic Objects");
        const scene = sceneRef.current; if (!scene) return;
        if (gridHelperRef.current) { scene.remove(gridHelperRef.current); gridHelperRef.current.geometry?.dispose(); disposeMaterial(gridHelperRef.current.material as Material | Material[]); gridHelperRef.current = null; }
        if (sheetMeshRef.current) { scene.remove(sheetMeshRef.current); sheetMeshRef.current.geometry?.dispose(); disposeMaterial(sheetMeshRef.current.material); sheetMeshRef.current = null; }
        if (highlightMarkerRef.current) { scene.remove(highlightMarkerRef.current); highlightMarkerRef.current.geometry?.dispose(); disposeMaterial(highlightMarkerRef.current.material as Material); highlightMarkerRef.current = null; }
        if (highlightBoxRef.current) { scene.remove(highlightBoxRef.current); highlightBoxRef.current.geometry?.dispose(); disposeMaterial(highlightBoxRef.current.material as Material); highlightBoxRef.current = null; } // Cleanup BoxHelper
        Object.values(instanceGroupsRef.current).forEach(group => { if (group.mesh) { scene.remove(group.mesh); group.geometry?.dispose(); } });
        instanceGroupsRef.current = {};
        if (sharedMaterialRef.current) { sharedMaterialRef.current.dispose(); sharedMaterialRef.current = null; }
    }, []);

    // --- Initialization for Dynamic Objects ---
    const initializeDynamicObjects = useCallback((count: number, variation: VariationLevel) => {
        // console.log(`Initializing Dynamic Objects: count=${count}, variation=${variation}`);
        const scene = sceneRef.current; const currentClipPlanes = clipPlanesRef.current; if (!scene) return;
        cleanupDynamicObjects(); // Cleanup before init

        sharedMaterialRef.current = new MeshStandardMaterial({ color: 0xff00ff, metalness: 0.5, roughness: 0.4, clippingPlanes: currentClipPlanes, clipShadows: true });
        gridHelperRef.current = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x888888, 0xcccccc); scene.add(gridHelperRef.current);
        const sheetGeometry = new THREE.PlaneGeometry(GRID_SIZE * 0.8, GRID_SIZE * 0.8, 30, 30); sheetGeometry.userData.initialPositions = sheetGeometry.attributes.position.array.slice(); const sheetMaterial = new THREE.MeshStandardMaterial({ color: 0x0088ff, side: THREE.DoubleSide, transparent: true, opacity: 0.75, clippingPlanes: currentClipPlanes, clipShadows: true }); sheetMeshRef.current = new THREE.Mesh(sheetGeometry, sheetMaterial); sheetMeshRef.current.rotation.x = -Math.PI / 2; sheetMeshRef.current.position.y = 0.05; scene.add(sheetMeshRef.current); updateSheetGeometry(sheetGeometry, timeRef.current);
        // Marker for sheet click
        const markerGeometry = new THREE.SphereGeometry(0.1, 16, 8); const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff8800, depthTest: false, transparent: true, opacity: 0.8 }); highlightMarkerRef.current = new THREE.Mesh(markerGeometry, markerMaterial); highlightMarkerRef.current.visible = false; highlightMarkerRef.current.renderOrder = 999; scene.add(highlightMarkerRef.current);
        // Highlight box for instance click
        highlightBoxRef.current = new BoxHelper(new THREE.Object3D(), 0xffff00); // Yellow box, target set later
        highlightBoxRef.current.visible = false; highlightBoxRef.current.material.depthTest = false; highlightBoxRef.current.renderOrder = 998; scene.add(highlightBoxRef.current);

        // Create Instances...
        const geometriesToUse = geometryPools[variation]; const numGeomTypes = geometriesToUse.length; const variationParams = variationSettings[variation];
        const countPerType = Math.floor(count / numGeomTypes); let remainingCount = count % numGeomTypes;
        const tempMatrix = new THREE.Matrix4(); const p=new THREE.Vector3(), q=new THREE.Quaternion(), s=new THREE.Vector3(), ax=new THREE.Vector3();
        geometriesToUse.forEach((geomParams) => { /* ... instance creation loop ... */
            const countForThis = countPerType + (remainingCount-- > 0 ? 1 : 0); if (countForThis === 0) return;
            const geom = createGeometry(geomParams); if (!sharedMaterialRef.current) return;
            const instances = new InstancedMesh(geom, sharedMaterialRef.current, countForThis); instances.castShadow = true;
            // Store geometry params with each instance's animation data
            const animData: InstanceAnimData[] = [];
            for (let i = 0; i < countForThis; i++) { /* ... set instance matrix & data ... */ p.set( getRandom(-GRID_SIZE*.45,GRID_SIZE*.45), CP2_BASE_Y, getRandom(-GRID_SIZE*.45,GRID_SIZE*.45) ); ax.set(getRandom(-1,1),getRandom(-1,1),getRandom(-1,1)).normalize(); const scVar = getRandom(-variationParams.scaleRange, variationParams.scaleRange); const iSc = Math.max(0.1, BASE_SCALE+scVar); s.set(iSc,iSc,iSc); const spVar = getRandom(-variationParams.speedRange, variationParams.speedRange); const rSp = BASE_ROTATION_SPEED+spVar; q.setFromAxisAngle(ax, getRandom(0, Math.PI*2)); tempMatrix.compose(p, q, s); instances.setMatrixAt(i, tempMatrix); animData.push({ matrix: tempMatrix.clone(), rotationAxis: ax.clone(), rotationSpeed: rSp, baseScale: s.clone(), geometryParams: geomParams }); } // Added geometryParams
            instances.instanceMatrix.needsUpdate = true; scene.add(instances);
            instanceGroupsRef.current[geomParams.key] = { mesh: instances, geometry: geom, animationData: animData };
        });
        if (Object.keys(instanceGroupsRef.current).length === 0 && count > 0) { sharedMaterialRef.current?.dispose(); sharedMaterialRef.current = null; }
    }, [cleanupDynamicObjects]);

    // --- Canvas Click Handler ---
    const handleCanvasClick = useCallback((event: MouseEvent) => {
        try {
            const cam = cameraRef.current; const sc = sceneRef.current; const sheet = sheetMeshRef.current; const mount = mountRef.current; const marker = highlightMarkerRef.current; const box = highlightBoxRef.current;
            if (!cam || !sc || !mount || !marker || !box) { console.warn("Raycast deps missing"); return; }

            const rect = mount.getBoundingClientRect();
            mousePosRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mousePosRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            raycasterRef.current.setFromCamera(mousePosRef.current, cam);

            // 1. Check for instance intersection first
            const instanceMeshes = Object.values(instanceGroupsRef.current).map(g => g.mesh).filter(m => m !== null) as InstancedMesh[];
            const instanceIntersects = raycasterRef.current.intersectObjects(instanceMeshes, false);

            marker.visible = false; // Hide sheet marker by default
            box.visible = false; // Hide box marker by default
            setSelectedInstanceInfo(null); // Clear selection info
            setHighlightCoords('');

            if (instanceIntersects.length > 0) {
                const intersect = instanceIntersects[0]; // Closest instance hit
                if (intersect.instanceId !== undefined && intersect.object instanceof InstancedMesh) {
                    const instanceMesh = intersect.object;
                    const instanceId = intersect.instanceId;
                    // Find which group this mesh belongs to
                    const groupEntry = Object.entries(instanceGroupsRef.current).find(([key, group]) => group.mesh === instanceMesh);

                    if (groupEntry) {
                        const [groupKey, groupData] = groupEntry;
                        const instanceData = groupData.animationData[instanceId];
                        if (instanceData) {
                             console.log(`Hit instance ${instanceId} of group ${groupKey}`);
                            // Update and show BoxHelper
                            box.setFromObject(instanceMesh); // Set target conceptually (doesn't work directly like this)
                            // We need to apply the specific instance's matrix to the BoxHelper
                            const instanceMatrix = new THREE.Matrix4();
                            instanceMesh.getMatrixAt(instanceId, instanceMatrix);
                            // Can't directly set BoxHelper from matrix. We need a dummy object.
                            dummyObject.current.applyMatrix4(instanceMatrix); // Apply instance transform to dummy
                            box.setFromObject(dummyObject.current); // Now update box from transformed dummy
                            box.visible = true;

                            setSelectedInstanceInfo({ groupKey, instanceId, params: instanceData.geometryParams });
                            setHighlightCoords(''); // Clear sheet coords
                            return; // Stop processing further hits
                        }
                    }
                }
            }

            // 2. If no instance hit, check for sheet intersection
            if (sheet) {
                const sheetIntersects = raycasterRef.current.intersectObject(sheet, false);
                if (sheetIntersects.length > 0) {
                    const intersectionPoint = sheetIntersects[0].point;
                    marker.position.copy(intersectionPoint);
                    const dir = cam.position.clone().sub(intersectionPoint).normalize();
                    marker.position.addScaledVector(dir, 0.02);
                    marker.visible = true;
                    setHighlightCoords(`(${intersectionPoint.x.toFixed(2)}, ${intersectionPoint.y.toFixed(2)}, ${intersectionPoint.z.toFixed(2)})`);
                    // Ensure box helper is hidden if sheet is hit after checking instances
                    box.visible = false;
                    setSelectedInstanceInfo(null);
                }
            }

        } catch (error) { console.error("Error in handleCanvasClick:", error); }
    }, []);

    // --- Effect for Initial Setup & Core Logic ---
    useEffect(() => {
        console.log("Root useEffect: Initializing Core");
        if (!mountRef.current) { console.error("Root useEffect: Mount ref missing!"); return; }
        const currentMount = mountRef.current;
        let rendererElement: HTMLCanvasElement | null = null;
        let localClickListenerAttached = false;
        let localAnimationId: number | undefined = undefined;

        try {
            // --- Core Setup ---
            sceneRef.current = new THREE.Scene(); sceneRef.current.background = new THREE.Color(0xeeeeee);
            cameraRef.current = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000); cameraRef.current.position.set(5, 5, 10);
            rendererRef.current = new THREE.WebGLRenderer({ antialias: true }); rendererRef.current.localClippingEnabled = clippingEnabled;
            rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight); rendererRef.current.setPixelRatio(window.devicePixelRatio);
            rendererElement = rendererRef.current.domElement; currentMount.appendChild(rendererElement);
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); sceneRef.current.add(ambientLight); const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); directionalLight.position.set(5, 10, 7.5); sceneRef.current.add(directionalLight);
            controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement); controlsRef.current.enableDamping = true; controlsRef.current.dampingFactor = 0.05; controlsRef.current.minDistance = 2; controlsRef.current.maxDistance = 50;
            clockRef.current = new Clock(isPlaying);

            // --- Initial Dynamic Object Creation ---
            initializeDynamicObjects(instanceCount, variationLevel);
            isInitializedRef.current = true; // Mark as initialized

            // --- Raycasting Listener Setup ---
            currentMount.addEventListener('click', handleCanvasClick);
            localClickListenerAttached = true;

            // --- Animation Loop ---
            const animate = () => {
                localAnimationId = requestAnimationFrame(animate);
                const r = rendererRef.current, s = sceneRef.current, ca = cameraRef.current, cl = clockRef.current, co = controlsRef.current;
                if (!r || !s || !ca || !cl || !co) return;
                const delta = cl.getDelta(); co.update();
                const effectiveSpeed = animationSpeedRef.current * (isPlayingRef.current ? 1 : 0);
                // Time update (ref only)
                if (isPlayingRef.current) { let t = timeRef.current + delta * animationSpeedRef.current; t %= TIME_SLIDER_MAX; timeRef.current = t; }
                // Sheet update
                updateSheetGeometry(sheetMeshRef.current?.geometry as BufferGeometry ?? null, timeRef.current);
                // Instance animation
                const dummy = dummyObject.current; const tQuat = new THREE.Quaternion(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), sc = new THREE.Vector3();
                let needsRender = false; // Optimization: only render if something moved
                Object.values(instanceGroupsRef.current).forEach(group => {
                    const instances = group.mesh; const data = group.animationData; if(!instances) return;
                    let matrixNeedsUpdate = false;
                    for (let i = 0; i < instances.count; i++) {
                        const item = data[i]; if (!item) continue;
                        item.matrix.decompose(pos, quat, sc);
                        const angle = item.rotationSpeed * delta * effectiveSpeed;
                        // Only apply rotation if speed is non-zero and animation is playing
                        if (angle !== 0) {
                             tQuat.setFromAxisAngle(item.rotationAxis, angle); quat.premultiply(tQuat);
                             dummy.position.copy(pos); dummy.quaternion.copy(quat); dummy.scale.copy(item.baseScale); dummy.updateMatrix();
                             instances.setMatrixAt(i, dummy.matrix); item.matrix.copy(dummy.matrix);
                             matrixNeedsUpdate = true;
                        }
                    }
                    if (matrixNeedsUpdate) { instances.instanceMatrix.needsUpdate = true; needsRender = true; }
                });

                // Update highlight box if visible
                if (highlightBoxRef.current?.visible && selectedInstanceInfo) {
                    const group = instanceGroupsRef.current[selectedInstanceInfo.groupKey];
                    if (group && group.mesh) {
                        const instanceMatrix = new THREE.Matrix4();
                        group.mesh.getMatrixAt(selectedInstanceInfo.instanceId, instanceMatrix);
                        dummyObject.current.position.set(0,0,0); dummyObject.current.quaternion.set(0,0,0,1); dummyObject.current.scale.set(1,1,1);
                        dummyObject.current.applyMatrix4(instanceMatrix);
                        highlightBoxRef.current.setFromObject(dummyObject.current);
                        highlightBoxRef.current.update(); // Ensure update
                        needsRender = true;
                    }
                }

                // Render only if controls moved, animation is playing, or selection changed (implicitly needsRender)
                if (co.enabled || needsRender || isPlayingRef.current || highlightBoxRef.current?.visible || highlightMarkerRef.current?.visible) {
                     r.render(s, ca);
                }

            };
            animate();

        } catch (error) { console.error("Error during initial setup useEffect:", error); }
        // --- Resize Handler ---
        const handleResize = () => { if (!rendererRef.current || !cameraRef.current || !currentMount) return; const w = currentMount.clientWidth, h = currentMount.clientHeight; cameraRef.current.aspect = w / h; cameraRef.current.updateProjectionMatrix(); rendererRef.current.setSize(w, h); };
        window.addEventListener('resize', handleResize);
        // --- Main Cleanup ---
        return () => { /* ... cleanup logic ... */ console.log("Root useEffect cleanup: Unmounting..."); isInitializedRef.current = false; if (localAnimationId) cancelAnimationFrame(localAnimationId); window.removeEventListener('resize', handleResize); if (localClickListenerAttached && currentMount) { currentMount.removeEventListener('click', handleCanvasClick); } controlsRef.current?.dispose(); cleanupDynamicObjects(); rendererRef.current?.dispose(); if (currentMount && rendererElement && currentMount.contains(rendererElement)) { currentMount.removeChild(rendererElement); } rendererRef.current = null; sceneRef.current = null; cameraRef.current = null; clockRef.current = null; controlsRef.current = null; console.log("Root useEffect cleanup finished."); };
    // }, [initializeDynamicObjects, cleanupDynamicObjects, handleCanvasClick]); // Removed state deps like instanceCount, variationLevel
     // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [initializeDynamicObjects, cleanupDynamicObjects, handleCanvasClick]); // Only callbacks should be dependencies


    // --- Effect for Parameter Changes ---
    useEffect(() => {
        if (!isInitializedRef.current) return; // Don't run on initial mount
        console.log(`Parameter change: Rebuilding (Count: ${instanceCount}, Variation: ${variationLevel})`);
        // Cleanup & Initialize dynamic objects
        // initializeDynamicObjects calls cleanup internally now
        initializeDynamicObjects(instanceCount, variationLevel);
    }, [instanceCount, variationLevel, initializeDynamicObjects]); // Depend on state & init func

    // --- UI Event Handlers ---
    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => { if (isPlaying) setIsPlaying(false); setTimeSlider(parseFloat(e.target.value)); }; const togglePlayPause = () => setIsPlaying(prev => !prev); const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => setAnimationSpeed(parseFloat(e.target.value)); const handleInstanceCountChange = (e: React.ChangeEvent<HTMLInputElement>) => setInstanceCount(parseInt(e.target.value, 10)); const handleVariationChange = (e: React.ChangeEvent<HTMLSelectElement>) => setVariationLevel(e.target.value as VariationLevel); const handleClippingToggle = (e: React.ChangeEvent<HTMLInputElement>) => setClippingEnabled(e.target.checked); const handleClipChange = (setter: React.Dispatch<React.SetStateAction<number>>) => (e: React.ChangeEvent<HTMLInputElement>) => { setter(parseFloat(e.target.value)); };

    const toggleDescription = () => {
      setIsDescriptionVisible(prev => !prev);
    };
    // --- Render Component ---
    // console.log("M4xCP2View: Rendering JSX");
    return (
        <div className={viewStyles.moduleContainer}>
            <h2 className={viewStyles.moduleTitle}>Moduuli 1: Aika-avaruus (M⁴ x CP<sub>2</sub>)</h2>
            <button
                onClick={toggleDescription}
                className={`${viewStyles.toggleButton} ${!isDescriptionVisible ? viewStyles.toggleButtonHidden : ''}`}
             >
                {isDescriptionVisible ? 'Piilota Selitys' : 'Näytä Selitys'}
             </button>
            <div className={`${viewStyles.description} ${!isDescriptionVisible ? viewStyles.descriptionHidden : ''}`}>
            <p>
              Tämä visualisointi esittää <i>metaforisesti</i> TGD:n kuvaamaa aika-avaruutta. TGD:ssä 4-ulotteinen aika-avaruus (jota tässä symboloi liikkuva sininen "arkki")
              on upotettu korkeampaan, 8-ulotteiseen avaruuteen M⁴ x CP<sub>2</sub>.
            </p>
            <ul style={{fontSize: '0.9em', marginBottom: '1em'}}>
              <li>
                  <strong>M⁴:</strong> Edustaa tuttua 4D Minkowski-aika-avaruutta (3 tila + 1 aika). Tässä visualisoinnissa sen 3D-tilaleikkausta symboloi harmaa ruudukko.
                  Ajan kulkua simuloidaan arkin muodon muutoksella.
              </li>
              <li>
                  <strong>CP<sub>2</sub> (Kompleksinen Projektiivinen Taso 2):</strong> On 4-ulotteinen (reaaliulottuvuuksiltaan), kompakti ja kompleksinen avaruus. TGD:ssä se kuvaa hiukkasten
                  sisäisiä vapausasteita, jotka vastaavat Standardimallin symmetrioita (värivaraus SU(3) ja sähköheikko SU(2)xU(1)). Sen geometria on erittäin rikas ja
                  määrittää fysiikan lakeja perustavanlaatuisella tasolla.
              </li>
              <li>
                  <strong>Visualisoinnin Yksinkertaistukset:</strong>
                  <ul>
                    <li>8D-avaruutta ei voi esittää suoraan 3D:ssä. Näemme vain M⁴:n projektion ja CP<sub>2</sub>:n symbolisen esityksen.</li>
                    <li>Magenta-solmut (Torukset/Solmutorukset) <i>eivät ole</i> CP<sub>2</sub>, vaan ne ovat vain <i>visuaalisia symboleita</i> sen olemassaololle ja kompleksisuudelle M⁴:n jokaiseen pisteeseen liittyen (tässä näytetään vain otos). Niiden muotojen (esim. eri solmut) ja koon/pyörimisen vaihtelu on valittu havainnollistamaan ajatusta siitä, että CP<sub>2</sub>-geometria voi kantaa monimutkaista informaatiota (kuten hiukkasten kvanttilukuja). Topologialla (reikien ja solmujen olemassaololla) on TGD:ssä syvä merkitys.</li>
                    <li>Moduulissa 5 syvennytään tarkemmin CP<sub>2</sub>:n merkitykseen ja geometriaan.</li>
                  </ul>
              </li>
            </ul>
            <p>
                Klikkaa sinistä arkkia nähdäksesi pisteen koordinaatit tai magenta-solmua nähdäksesi sen symbolisen muodon tiedot.
                Käytä kontrolleja ajan, instanssien ja leikkauksen säätämiseen.
            </p>
            </div>
            {/* Canvas container */}
            <div className={viewStyles.canvasContainer} ref={mountRef} style={{ width: '100%', height: '60vh', border: '1px solid #ccc', marginTop: '10px', position: 'relative', cursor: 'pointer' }}> {/* Changed cursor */}
                {/* Info Display Area */}
                <div className={viewStyles.infoOverlay} style={{ position: 'absolute', bottom: '10px', left: '10px', backgroundColor: 'rgba(0, 0, 0, 0.7)', color: '#fff', padding: '8px 12px', borderRadius: '4px', fontSize: '11px', fontFamily: 'monospace', pointerEvents: 'none', zIndex: 10, maxWidth: 'calc(100% - 20px)' }}>
                    {highlightCoords && <div>Arkki: {highlightCoords}</div>}
                    {selectedInstanceInfo && (
                        <div>
                            <div>Valittu CP<sub>2</sub> (Instanssi #{selectedInstanceInfo.instanceId}, Tyyppi: {selectedInstanceInfo.groupKey})</div>
                            <div>Muoto: {selectedInstanceInfo.params.type}</div>
                            {selectedInstanceInfo.params.type === 'TorusKnot' && <div>(p={selectedInstanceInfo.params.p}, q={selectedInstanceInfo.params.q})</div>}
                            <div>Säde: {selectedInstanceInfo.params.radius?.toFixed(2)}, Putki: {selectedInstanceInfo.params.tube?.toFixed(2)}</div>
                        </div>
                    )}
                    {!highlightCoords && !selectedInstanceInfo && <div>Klikkaa arkkia tai CP<sub>2</sub>-solmua</div>}
                </div>
            </div>

            {/* UI Controls Section */}
            <div className={viewStyles.controlsPanel} style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f8f8f8', borderRadius: '4px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px 20px' }}>
                {/* Row 1: Play/Time/Speed */}
                 {/* ... controls ... */}
                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><button onClick={togglePlayPause} style={{ padding: '8px 15px', minWidth: '80px' }}>{isPlaying ? 'Pause' : 'Play'}</button></div>
                 <div><label className={viewStyles.label} htmlFor="timeSlider" style={{ fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>Aika:</label><div style={{ display: 'flex', alignItems: 'center' }}><input type="range" id="timeSlider" min="0" max={TIME_SLIDER_MAX} step="0.1" value={timeSlider} onChange={handleTimeChange} style={{ width: '100%' }} /><span className={viewStyles.valueDisplay} style={{ marginLeft: '10px', fontFamily: 'monospace', minWidth: '40px' }}>{timeSlider.toFixed(1)}</span></div></div>
                 <div><label className={viewStyles.label} htmlFor="speedSlider" style={{ fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>Nopeus:</label><div style={{ display: 'flex', alignItems: 'center' }}><input type="range" id="speedSlider" min="0" max={SPEED_SLIDER_MAX} step="0.1" value={animationSpeed} onChange={handleSpeedChange} style={{ width: '100%' }}/><span className={viewStyles.valueDisplay} style={{ marginLeft: '10px', fontFamily: 'monospace', minWidth: '30px' }}>{animationSpeed.toFixed(1)}x</span></div></div>
                 {/* Row 2: Count/Variation */}
                  <div><label className={viewStyles.label} htmlFor="instanceSlider" style={{ fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>CP<sub>2</sub> Instanssit:</label><div style={{ display: 'flex', alignItems: 'center' }}><input type="range" id="instanceSlider" min={INSTANCE_COUNT_MIN} max={INSTANCE_COUNT_MAX} step="10" value={instanceCount} onChange={handleInstanceCountChange} style={{ width: '100%' }}/><span className={viewStyles.valueDisplay} style={{ marginLeft: '10px', fontFamily: 'monospace', minWidth: '45px' }}>{instanceCount}</span></div></div>
                 <div><label className={viewStyles.label} htmlFor="variationSelect" style={{ fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>CP<sub>2</sub> Variaatio:</label><select id="variationSelect" value={variationLevel} onChange={handleVariationChange} style={{ padding: '8px', width: '100%' }}><option value="low">Matala</option><option value="medium">Keskitaso</option><option value="high">Korkea</option></select></div>
                 <div></div> {/* Placeholder */}
                  {/* Row 3: Clipping Controls Header */}
                  <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #ddd', paddingTop: '15px' }}><label className={viewStyles.label} style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}><input type="checkbox" checked={clippingEnabled} onChange={handleClippingToggle} /> Aktivoi Leikkausnäkymät</label></div>
                  {/* Conditional Rendering for Clipping Sliders */}
                  {clippingEnabled && ( <> {/* ... X/Z sliders ... */} </> )}
            </div>
        </div>
    );
};

export default M4xCP2View;