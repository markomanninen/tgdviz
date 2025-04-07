import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Clock } from 'three';
import { BufferGeometry, BufferAttribute, Float32BufferAttribute, Material, MeshStandardMaterial, MeshBasicMaterial, Mesh, PlaneGeometry, RingGeometry, Vector2, Vector3, Raycaster, Quaternion, Matrix4 } from 'three';
import viewStyles from '@/styles/ModuleView.module.css';

// --- Helper Functions & Constants ---
// (Nämä pysyvät ennallaan)
interface RaycastResult { point: Vector3 | null; normal: Vector3 | null; }
const getSheetIntersectionViaRaycast = ( raycaster: Raycaster, targetSheetMesh: Mesh<PlaneGeometry, MeshStandardMaterial> | undefined | null, targetX: number, targetZ: number, startYOffset: number ): RaycastResult => { const result: RaycastResult = { point: null, normal: null }; if (!targetSheetMesh) return result; const rayOrigin = new Vector3(targetX, startYOffset + 10.0, targetZ); const rayDirection = new Vector3(0, -1, 0); raycaster.set(rayOrigin, rayDirection); const intersects = raycaster.intersectObject(targetSheetMesh, false); if (intersects.length > 0 && intersects[0].face) { result.point = intersects[0].point.clone(); result.normal = intersects[0].face.normal.clone(); const normalMatrix = new THREE.Matrix3().getNormalMatrix(targetSheetMesh.matrixWorld); result.normal.applyMatrix3(normalMatrix).normalize(); if (result.normal.y < 0.1) { result.normal.set(0, 1, 0); } } else { result.point = new Vector3(targetX, startYOffset, targetZ); result.normal = new Vector3(0, 1, 0); } return result; };
const updateSheetGeometry = (geometry: PlaneGeometry | null, time: number) => { if (!geometry) return; const pos = geometry.attributes.position as THREE.BufferAttribute; const init = geometry.userData.initialPositions as Float32Array; const yOff = geometry.userData.yOffset ?? 0; if (!init || !pos) return; const amplitude = 0.55; for (let i = 0; i < pos.count; i++) { const x=init[i*3], y=init[i*3+1]; const z = (Math.sin(x*.3+time*.5+yOff*.5)*amplitude+Math.cos(y*.3+time*.3+yOff*.8)*amplitude); pos.setZ(i,z); } pos.needsUpdate=true; geometry.computeVertexNormals(); };

const GRID_SIZE = 20; const SHEET_SPACING = 2.0;
const WORMHOLE_TRUNK_SEGMENTS = 64;
const WORMHOLE_HEIGHT_SEGMENTS = 64;
const CAP_THICKNESS_FACTOR = 0.01;
const MIN_CAP_RADIUS_FACTOR = 0.5; const MAX_CAP_RADIUS_FACTOR = 1.5;
const BASE_CAP_RADIUS_FOR_RANDOM = 0.3;
const WORMHOLE_BEND_FACTOR = 0.99;

// --- Data Structures stored in Refs ---
// (Nämä pysyvät ennallaan)
interface SheetData { id: number; yOffset: number; color: THREE.Color; mesh: Mesh<PlaneGeometry, MeshStandardMaterial>; geometry: PlaneGeometry; }
interface WormholeData {
    id: number; targetXZ: THREE.Vector2; sheet1Id: number; sheet2Id: number;
    meshTrunk: Mesh<BufferGeometry, MeshStandardMaterial>;
    trunkGeometry: BufferGeometry;
    meshCap1: Mesh<RingGeometry, MeshBasicMaterial>; // Korjattu: Generics order Mesh<Geo, Mat>
    meshCap2: Mesh<RingGeometry, MeshBasicMaterial>; // Korjattu: Generics order Mesh<Geo, Mat>
    capOuterRadius1: number;
    capOuterRadius2: number;
}

// --- Geometrian luontifunktiot ---
// (Nämä pysyvät ennallaan)
const createRandomCapGeometry = (): { geometry: RingGeometry; outerRadius: number } => { const randomRadiusFactor = THREE.MathUtils.randFloat(MIN_CAP_RADIUS_FACTOR, MAX_CAP_RADIUS_FACTOR); const outerRadius = BASE_CAP_RADIUS_FOR_RANDOM * randomRadiusFactor; const innerRadius = outerRadius * (1 - CAP_THICKNESS_FACTOR); return { geometry: new RingGeometry(innerRadius, outerRadius, WORMHOLE_TRUNK_SEGMENTS), outerRadius }; };
const createTrunkGeometry = (radialSegments = WORMHOLE_TRUNK_SEGMENTS, heightSegments = WORMHOLE_HEIGHT_SEGMENTS): BufferGeometry => {
    const geometry = new BufferGeometry();
    const vertexCount = radialSegments * (heightSegments + 1);
    const vertices = new Float32Array(vertexCount * 3);
    const indices: number[] = [];
    for (let j = 0; j < heightSegments; j++) {
        for (let i = 0; i < radialSegments; i++) {
            const row1 = j * radialSegments; const row2 = (j + 1) * radialSegments;
            const i0 = row1 + i; const i1 = row1 + (i + 1) % radialSegments;
            const i2 = row2 + (i + 1) % radialSegments; const i3 = row2 + i;
            indices.push(i0, i1, i3); indices.push(i1, i2, i3);
        }
    }
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    return geometry;
};
const alignObjectToNormal = (object: THREE.Object3D, position: THREE.Vector3, normal: THREE.Vector3) => { object.position.copy(position); const defaultUp = new THREE.Vector3(0, 0, 1); const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultUp, normal); object.setRotationFromQuaternion(quaternion); };
const quadraticBezier = (p0: Vector3, p1: Vector3, p2: Vector3, t: number, target: Vector3): Vector3 => { const t1 = 1 - t; target.set( t1 * t1 * p0.x + 2 * t1 * t * p1.x + t * t * p2.x, t1 * t1 * p0.y + 2 * t1 * t * p1.y + t * t * p2.y, t1 * t1 * p0.z + 2 * t1 * t * p1.z + t * t * p2.z ); return target; };


// --- Component ---
const ManySheetedView: React.FC = () => {
    // --- Core Refs ---
    // (Nämä pysyvät ennallaan)
    const mountRef = useRef<HTMLDivElement>(null); const rendererRef = useRef<THREE.WebGLRenderer | null>(null); const sceneRef = useRef<THREE.Scene | null>(null); const cameraRef = useRef<THREE.PerspectiveCamera | null>(null); const controlsRef = useRef<OrbitControls | null>(null); const clockRef = useRef<Clock | null>(null); const animationIdRef = useRef<number>(); const gridHelperRef = useRef<THREE.GridHelper | null>(null); const timeRef = useRef<number>(0); const isInitializedRef = useRef<boolean>(false); const raycasterRef = useRef<Raycaster>(new Raycaster());
    const vec3_p0 = useRef(new Vector3()).current; const vec3_p2 = useRef(new Vector3()).current; const vec3_control = useRef(new Vector3()).current; const vec3_mid = useRef(new Vector3()).current; const vec3_offset = useRef(new Vector3()).current; const vec3_vertex = useRef(new Vector3()).current; const matrix_m1 = useRef(new Matrix4()).current; const matrix_m2 = useRef(new Matrix4()).current;

    // --- Refs for Dynamic Object Data ---
    // (Nämä pysyvät ennallaan)
    const sheetsRef = useRef<Map<number, SheetData>>(new Map());
    const wormholesRef = useRef<Map<number, WormholeData>>(new Map());
    const nextSheetIdRef = useRef<number>(0);
    const nextWormholeIdRef = useRef<number>(0);

    // --- Refs for Shared Resources ---
    const sharedWormholeTrunkMaterialRef = useRef<MeshStandardMaterial | null>(null);

    // --- State ---
    // (Nämä pysyvät ennallaan)
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [animationSpeed, setAnimationSpeed] = useState<number>(1.0);
    const [sheetCountUI, setSheetCountUI] = useState<number>(0);
    const [wormholeCountUI, setWormholeCountUI] = useState<number>(0);
    const isPlayingRef = useRef<boolean>(isPlaying);
    const animationSpeedRef = useRef<number>(animationSpeed);

    const [isDescriptionVisible, setIsDescriptionVisible] = useState<boolean>(false);

    useEffect(() => { isPlayingRef.current = isPlaying; if (clockRef.current) { if (isPlaying && !clockRef.current.running) { clockRef.current.start(); clockRef.current.getDelta(); } else if (!isPlaying && clockRef.current.running) { clockRef.current.stop(); }}}, [isPlaying]);
    useEffect(() => { animationSpeedRef.current = animationSpeed; }, [animationSpeed]);

    // --- Cleanup Function ---
    // (Tämä pysyy ennallaan)
    const cleanupSceneContent = useCallback(() => {
        const scene = sceneRef.current; if (!scene) return;
        if (gridHelperRef.current) { scene.remove(gridHelperRef.current); gridHelperRef.current.geometry?.dispose(); (Array.isArray(gridHelperRef.current.material)?gridHelperRef.current.material:[gridHelperRef.current.material]).forEach(m=>(m as Material)?.dispose()); gridHelperRef.current = null; }
        sheetsRef.current.forEach((d) => { if(d.mesh){ scene.remove(d.mesh); d.geometry?.dispose(); d.mesh.material?.dispose(); }}); sheetsRef.current.clear();
        wormholesRef.current.forEach((d) => {
            if(d.meshTrunk) { scene.remove(d.meshTrunk); d.trunkGeometry?.dispose(); /* Materiaalia ei poisteta, koska se on jaettu */ }
            if(d.meshCap1) { scene.remove(d.meshCap1); d.meshCap1.geometry?.dispose(); d.meshCap1.material?.dispose(); }
            if(d.meshCap2) { scene.remove(d.meshCap2); d.meshCap2.geometry?.dispose(); d.meshCap2.material?.dispose(); }
        });
        wormholesRef.current.clear();
        sharedWormholeTrunkMaterialRef.current?.dispose(); sharedWormholeTrunkMaterialRef.current = null;
        nextSheetIdRef.current = 0; nextWormholeIdRef.current = 0; setSheetCountUI(0); setWormholeCountUI(0);
    }, []);

    const sheetColors = useRef([ new THREE.Color(0x0088ff), new THREE.Color(0xff8800), new THREE.Color(0x00ff88), new THREE.Color(0xff0088), new THREE.Color(0x8800ff), new THREE.Color(0xffff00) ]).current;

    // --- Helper to add a single wormhole ---
    const createSingleWormhole = useCallback((sheet1Data: SheetData, sheet2Data: SheetData, xz: Vector2) => {
        const scene = sceneRef.current; if (!scene || !sheet1Data.mesh || !sheet2Data.mesh) return;

        // **** MUUTOS: Luo tai hae jaettu runkomateriaali uusilla asetuksilla ****
        if (!sharedWormholeTrunkMaterialRef.current) {
            sharedWormholeTrunkMaterialRef.current = new MeshStandardMaterial({
                color: 0x666666,        // <-- Muuta väriä halutessasi: 0xaaaaaa, 0x888888, 0x666666
                side: THREE.DoubleSide,
                metalness: 0.2,
                roughness: 0.7,
                wireframe: true,
                transparent: true,      // <-- Oltava true läpinäkyvyydelle
                opacity: 0.1,           // <-- Säädä tätä arvoa (0.0 - 1.0) halutun himmennyksen saamiseksi
                depthTest: false,       // <-- Ei lue syvyyttä, piirtää aina päälle
                depthWrite: false,      // <-- Ei kirjoita syvyyttä, ei peitä takana olevia
                blending: THREE.NormalBlending // (Oletus, mutta hyvä olla eksplisiittinen)
            });
        }

        const { geometry: capGeometry1, outerRadius: capOuterRadius1 } = createRandomCapGeometry();
        const { geometry: capGeometry2, outerRadius: capOuterRadius2 } = createRandomCapGeometry();

        // Cap materiaalit: Normaali, läpinäkymätön, tekee syvyystestin
        const capMaterial1 = new MeshBasicMaterial({
            color: sheet1Data.color,
            side: THREE.DoubleSide,
            // depthTest: true, (oletus)
            // depthWrite: true, (oletus)
            // transparent: false, (oletus)
        });
        const capMaterial2 = new MeshBasicMaterial({
            color: sheet2Data.color,
            side: THREE.DoubleSide,
        });

        const meshCap1 = new Mesh<RingGeometry, MeshBasicMaterial>(capGeometry1, capMaterial1);
        const meshCap2 = new Mesh<RingGeometry, MeshBasicMaterial>(capGeometry2, capMaterial2);

        const trunkGeometry = createTrunkGeometry();
        const meshTrunk = new Mesh(trunkGeometry, sharedWormholeTrunkMaterialRef.current); // Käytä jaettua, muokattua materiaalia

        // *** renderOrder on edelleen tärkeä ***
        // Runko (depthTest=false) piirretään ENNEN cappeja (depthTest=true),
        meshTrunk.renderOrder = 1; // Piirretään ennen cappeja
        meshCap1.renderOrder = 2; // Piirretään rungon jälkeen/päälle
        meshCap2.renderOrder = 2; // Piirretään rungon jälkeen/päälle


        const ray = raycasterRef.current; const intersection1 = getSheetIntersectionViaRaycast(ray, sheet1Data.mesh, xz.x, xz.y, sheet1Data.yOffset); const intersection2 = getSheetIntersectionViaRaycast(ray, sheet2Data.mesh, xz.x, xz.y, sheet2Data.yOffset);
        const p1 = intersection1.point ?? new Vector3(xz.x, sheet1Data.yOffset, xz.y); const n1 = intersection1.normal ?? new Vector3(0, 1, 0); const p2 = intersection2.point ?? new Vector3(xz.x, sheet2Data.yOffset, xz.y); const n2 = intersection2.normal ?? new Vector3(0, 1, 0);
        alignObjectToNormal(meshCap1, p1, n1); alignObjectToNormal(meshCap2, p2, n2);
        meshCap1.updateMatrixWorld(); meshCap2.updateMatrixWorld();

        const trunkPositions = trunkGeometry.attributes.position as BufferAttribute;
        for (let i = 0; i < WORMHOLE_TRUNK_SEGMENTS; i++) {
            const angle = (i / WORMHOLE_TRUNK_SEGMENTS) * Math.PI * 2; const localX = Math.cos(angle); const localY = Math.sin(angle);
            vec3_p0.set(localX * capOuterRadius1, localY * capOuterRadius1, 0).applyMatrix4(meshCap1.matrixWorld);
            vec3_p2.set(localX * capOuterRadius2, localY * capOuterRadius2, 0).applyMatrix4(meshCap2.matrixWorld);
             for (let j = 0; j <= WORMHOLE_HEIGHT_SEGMENTS; j++) {
                 const t = j / WORMHOLE_HEIGHT_SEGMENTS;
                 // Käytetään taivutettua laskentaa kuten ennenkin
                 vec3_vertex.lerpVectors(vec3_p0, vec3_p2, t); // Lineaarinen pohja
                 const centerP0 = new Vector3().setFromMatrixPosition(meshCap1.matrixWorld); // Tehokkuussyistä nämä voisi laskea loopin ulkopuolella
                 const centerP2 = new Vector3().setFromMatrixPosition(meshCap2.matrixWorld); // Tehokkuussyistä nämä voisi laskea loopin ulkopuolella
                 vec3_mid.lerpVectors(centerP0, centerP2, t); // Keskiakselin piste
                 const vecToCenter = vec3_offset.subVectors(vec3_mid, vec3_vertex);
                 const bendAmount = Math.sin(t * Math.PI);
                 const maxShift = vecToCenter.length() * WORMHOLE_BEND_FACTOR;
                 const currentShift = maxShift * bendAmount;
                 if (vecToCenter.lengthSq() > 0.0001) { // Vältetään normalisointi nollavektorille
                    vec3_vertex.addScaledVector(vecToCenter.normalize(), currentShift);
                 }
                 const vertexIndex = j * WORMHOLE_TRUNK_SEGMENTS + i;
                 trunkPositions.setXYZ(vertexIndex, vec3_vertex.x, vec3_vertex.y, vec3_vertex.z);
             }
        }
        trunkPositions.needsUpdate = true; trunkGeometry.computeVertexNormals();
        meshTrunk.position.set(0,0,0); meshTrunk.rotation.set(0,0,0); meshTrunk.scale.set(1,1,1);
        meshTrunk.updateMatrixWorld(); // Varmistetaan matriisipäivitys

        scene.add(meshTrunk); scene.add(meshCap1); scene.add(meshCap2);
        const newWormholeId = nextWormholeIdRef.current;
        const newWormholeData: WormholeData = {
            id: newWormholeId, targetXZ: xz, sheet1Id: sheet1Data.id, sheet2Id: sheet2Data.id,
            meshTrunk: meshTrunk, trunkGeometry: trunkGeometry,
            meshCap1: meshCap1, meshCap2: meshCap2,
            capOuterRadius1: capOuterRadius1, capOuterRadius2: capOuterRadius2
        };
        wormholesRef.current.set(newWormholeId, newWormholeData); nextWormholeIdRef.current++; setWormholeCountUI(wormholesRef.current.size);
    }, []);

    // --- Add Sheet Action ---
    const addSheet = useCallback(() => {
        const scene = sceneRef.current; if (!scene) return;
        const newSheetId = nextSheetIdRef.current;
        const sheetCount = sheetsRef.current.size;
        let currentMaxY = -Infinity;
        if (sheetCount > 0) { sheetsRef.current.forEach(sheet => { if (sheet.yOffset > currentMaxY) currentMaxY = sheet.yOffset; }); }
        else { currentMaxY = -SHEET_SPACING; }
        const newYOffset = currentMaxY + SHEET_SPACING;
        const newColor = sheetColors[sheetCount % sheetColors.length];
        const geometry = new PlaneGeometry(GRID_SIZE * 0.8, GRID_SIZE * 0.8, 30, 30);
        geometry.userData.initialPositions = geometry.attributes.position.array.slice();
        geometry.userData.yOffset = newYOffset;

        // **** Sheet materiaali pysyy ennallaan ****
        // Läpinäkyvä, kirjoittaa syvyyden.
        const material = new MeshStandardMaterial({
            color: newColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85, // Lehden oma läpinäkyvyys
            depthWrite: true // <-- Tärkeää, jotta capien depthTest toimii
        });

        const mesh = new Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = newYOffset;
        updateSheetGeometry(geometry, timeRef.current);
        scene.add(mesh); // Lisätään ennen runkoja ja cappeja (oletus renderOrder 0)
        const newSheetData: SheetData = { id: newSheetId, yOffset: newYOffset, color: newColor, mesh: mesh, geometry: geometry };
        sheetsRef.current.set(newSheetId, newSheetData);
        nextSheetIdRef.current++;
        if (sheetCount > 0) {
            const prevSheet = Array.from(sheetsRef.current.values()).find(s => Math.abs(s.yOffset - currentMaxY) < 0.01);
            if (prevSheet) {
                const x=THREE.MathUtils.randFloat(-GRID_SIZE*.3, GRID_SIZE*.3);
                const z=THREE.MathUtils.randFloat(-GRID_SIZE*.3, GRID_SIZE*.3);
                createSingleWormhole(prevSheet, newSheetData, new Vector2(x, z));
            }
        }
        setSheetCountUI(sheetsRef.current.size);
    }, [sheetColors, createSingleWormhole]);

    // --- Remove Sheet Action ---
    // (Tämä pysyy ennallaan)
    const removeSheet = useCallback(() => { const scene=sceneRef.current;if(!scene||sheetsRef.current.size<=1)return; let highY=-Infinity,removeId=-1; sheetsRef.current.forEach(s=>{if(s.yOffset>highY){highY=s.yOffset;removeId=s.id;}}); if(removeId===-1)return; const removeData=sheetsRef.current.get(removeId); if(!removeData)return; const whRemoveIds:number[]=[]; wormholesRef.current.forEach((wh)=>{if(wh.sheet1Id===removeId||wh.sheet2Id===removeId){if(wh.meshTrunk){scene.remove(wh.meshTrunk); wh.trunkGeometry?.dispose();} if(wh.meshCap1){scene.remove(wh.meshCap1);wh.meshCap1.geometry?.dispose();wh.meshCap1.material?.dispose();} if(wh.meshCap2){scene.remove(wh.meshCap2);wh.meshCap2.geometry?.dispose(); wh.meshCap2.material?.dispose();} whRemoveIds.push(wh.id);}}); whRemoveIds.forEach(id=>wormholesRef.current.delete(id)); scene.remove(removeData.mesh);removeData.geometry?.dispose();removeData.mesh.material?.dispose();sheetsRef.current.delete(removeId); setSheetCountUI(sheetsRef.current.size);setWormholeCountUI(wormholesRef.current.size); }, []);

    // --- Add Random Wormhole Action ---
    // (Tämä pysyy ennallaan)
    const addRandomWormhole = useCallback(() => { if(sheetsRef.current.size<2)return; const sorted=Array.from(sheetsRef.current.values()).sort((a,b)=>a.yOffset-b.yOffset); const s2=sorted[sorted.length-1]; const s1=sorted[sorted.length-2]; if(s1&&s2){const x=THREE.MathUtils.randFloat(-GRID_SIZE*.3, GRID_SIZE*.3);const z=THREE.MathUtils.randFloat(-GRID_SIZE*.3, GRID_SIZE*.3);createSingleWormhole(s1,s2,new Vector2(x,z));}}, [createSingleWormhole]);


    // --- Initial Setup Effect ---
    useEffect(() => {
        if (!mountRef.current || isInitializedRef.current) return;
        const currentMount = mountRef.current; let rendererElement: HTMLCanvasElement | null = null; isInitializedRef.current = true;
        try {
            sceneRef.current = new THREE.Scene(); sceneRef.current.background = new THREE.Color(0x1a1a1a);
            cameraRef.current = new THREE.PerspectiveCamera(75, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000); cameraRef.current.position.set(5, 6, 14);
            rendererRef.current = new THREE.WebGLRenderer({ antialias: true }); rendererRef.current.setSize(currentMount.clientWidth, currentMount.clientHeight); rendererRef.current.setPixelRatio(window.devicePixelRatio);

            // **** Renderöijän sortObjects = false on edelleen tärkeä ****
            rendererRef.current.sortObjects = false;

            rendererElement = rendererRef.current.domElement; currentMount.appendChild(rendererElement);
            const ambLight = new THREE.AmbientLight(0xffffff, 0.7); sceneRef.current.add(ambLight); const dirLight = new THREE.DirectionalLight(0xffffff, 0.9); dirLight.position.set(-10, 15, 10); sceneRef.current.add(dirLight);
            controlsRef.current = new OrbitControls(cameraRef.current, rendererRef.current.domElement); controlsRef.current.enableDamping = true; controlsRef.current.dampingFactor = 0.05;
            clockRef.current = new Clock(isPlayingRef.current);
            gridHelperRef.current = new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x444444, 0x888888); sceneRef.current.add(gridHelperRef.current);
            addSheet(); addSheet();
            if (controlsRef.current && sheetsRef.current.size > 0) { const a=Array.from(sheetsRef.current.values()).sort((a,b)=>a.yOffset-b.yOffset);const my=(a[a.length-1].yOffset+a[0].yOffset)/2;controlsRef.current.target.set(0,my,0);}

            const animate = () => {
                animationIdRef.current = requestAnimationFrame(animate);
                const r = rendererRef.current, s = sceneRef.current, ca = cameraRef.current, cl = clockRef.current, co = controlsRef.current, ray = raycasterRef.current;
                if (!r || !s || !ca || !cl || !co || !ray) return;
                const delta = cl.getDelta(); co.update();
                let timeToUpdate = timeRef.current; if (isPlayingRef.current && cl.running) { timeToUpdate += delta * animationSpeedRef.current; timeRef.current = timeToUpdate; }

                // 1. Päivitä sheetit
                sheetsRef.current.forEach((sheetData) => { updateSheetGeometry(sheetData.geometry, timeToUpdate); });

                // 2. Päivitä madonreiät (runko + capit)
                wormholesRef.current.forEach((whData) => {
                  const sheet1Data = sheetsRef.current.get(whData.sheet1Id); const sheet2Data = sheetsRef.current.get(whData.sheet2Id);
                  const whTrunk = whData.meshTrunk; const trunkGeometry = whData.trunkGeometry;
                  const whCap1 = whData.meshCap1; const whCap2 = whData.meshCap2;
                  const r1 = whData.capOuterRadius1; const r2 = whData.capOuterRadius2;

                  if (sheet1Data?.mesh && sheet2Data?.mesh && whTrunk && trunkGeometry && whCap1 && whCap2) {
                      const x = whData.targetXZ.x; const z = whData.targetXZ.y;
                      const intersection1 = getSheetIntersectionViaRaycast(ray, sheet1Data.mesh, x, z, sheet1Data.yOffset);
                      const intersection2 = getSheetIntersectionViaRaycast(ray, sheet2Data.mesh, x, z, sheet2Data.yOffset);
                      if (intersection1.point && intersection1.normal && intersection2.point && intersection2.normal) {
                          const p1_intersect = intersection1.point; const n1 = intersection1.normal;
                          const p2_intersect = intersection2.point; const n2 = intersection2.normal;
                          let cap1Pos = p1_intersect, cap1Norm = n1, cap2Pos = p2_intersect, cap2Norm = n2;
                          let color1 = sheet1Data.color, color2 = sheet2Data.color; let radius1 = r1, radius2 = r2;
                          // Varmistetaan että cap1 on alempana
                          if (p1_intersect.y > p2_intersect.y) {
                             [cap1Pos, cap2Pos] = [p2_intersect, p1_intersect];
                             [cap1Norm, cap2Norm] = [n2, n1];
                             [color1, color2] = [sheet2Data.color, sheet1Data.color];
                             [radius1, radius2] = [r2, r1];
                          }

                          // Päivitä cappien sijainti ja materiaalin väri
                          alignObjectToNormal(whCap1, cap1Pos, cap1Norm); alignObjectToNormal(whCap2, cap2Pos, cap2Norm);
                          whCap1.material.color.copy(color1);
                          whCap2.material.color.copy(color2);
                          whCap1.visible = true; whCap2.visible = true; whTrunk.visible = true;
                          whCap1.updateMatrixWorld(); whCap2.updateMatrixWorld();

                          // Päivitä rungon verteksit (kuten ennen, käyttäen taivutusta)
                          const trunkPositions = trunkGeometry.attributes.position as BufferAttribute;
                          const centerP0 = new Vector3().setFromMatrixPosition(whCap1.matrixWorld);
                          const centerP2 = new Vector3().setFromMatrixPosition(whCap2.matrixWorld);

                          for (let i = 0; i < WORMHOLE_TRUNK_SEGMENTS; i++) {
                              const angle = (i / WORMHOLE_TRUNK_SEGMENTS) * Math.PI * 2;
                              const localX = Math.cos(angle); const localY = Math.sin(angle);
                              vec3_p0.set(localX * radius1, localY * radius1, 0).applyMatrix4(whCap1.matrixWorld);
                              vec3_p2.set(localX * radius2, localY * radius2, 0).applyMatrix4(whCap2.matrixWorld);

                              for (let j = 0; j <= WORMHOLE_HEIGHT_SEGMENTS; j++) {
                                  const t = j / WORMHOLE_HEIGHT_SEGMENTS;
                                  vec3_vertex.lerpVectors(vec3_p0, vec3_p2, t);
                                  vec3_mid.lerpVectors(centerP0, centerP2, t);
                                  const vecToCenter = vec3_offset.subVectors(vec3_mid, vec3_vertex);
                                  const bendAmount = Math.sin(t * Math.PI);
                                  const maxShift = vecToCenter.length() * WORMHOLE_BEND_FACTOR;
                                  const currentShift = maxShift * bendAmount;
                                  if (vecToCenter.lengthSq() > 0.0001) {
                                    vec3_vertex.addScaledVector(vecToCenter.normalize(), currentShift);
                                  }
                                  const vertexIndex = j * WORMHOLE_TRUNK_SEGMENTS + i;
                                  trunkPositions.setXYZ(vertexIndex, vec3_vertex.x, vec3_vertex.y, vec3_vertex.z);
                              }
                          }
                          trunkPositions.needsUpdate = true;
                          trunkGeometry.computeVertexNormals();
                          whTrunk.position.set(0,0,0); whTrunk.rotation.set(0,0,0); whTrunk.scale.set(1,1,1);
                          whTrunk.updateMatrixWorld(); // Päivitä matriisi

                      } else { /* piilota jos raycast epäonnistui */ whTrunk.visible = false; whCap1.visible = false; whCap2.visible = false; }
                  } else { /* piilota jos sheettejä puuttuu */ if(whTrunk) whTrunk.visible = false; if(whCap1) whCap1.visible = false; if(whCap2) whCap2.visible = false; }
              }); // End wormholesRef.forEach

                // 3. Renderöi scene
                // Piirtojärjestys (koska sortObjects=false):
                // - GridHelper (oletus renderOrder 0)
                // - Sheets (lisätty ensin, oletus renderOrder 0)
                // - Trunks (renderOrder 1, depthTest=false, depthWrite=false)
                // - Caps (renderOrder 2, depthTest=true, depthWrite=true)
                r.render(s, ca);
            };
            animate();
        } catch (error) { console.error("Error during initial setup:", error); }
        const handleResize = () => { if (!rendererRef.current || !cameraRef.current || !currentMount) return; const w=currentMount.clientWidth,h=currentMount.clientHeight; cameraRef.current.aspect=w/h; cameraRef.current.updateProjectionMatrix(); rendererRef.current.setSize(w,h); }; window.addEventListener('resize', handleResize);
        return () => { isInitializedRef.current=false; if(animationIdRef.current)cancelAnimationFrame(animationIdRef.current); window.removeEventListener('resize',handleResize); controlsRef.current?.dispose(); cleanupSceneContent(); rendererRef.current?.dispose(); if(currentMount && rendererElement && currentMount.contains(rendererElement))currentMount.removeChild(rendererElement); rendererRef.current=null; sceneRef.current=null; cameraRef.current=null; clockRef.current=null; controlsRef.current=null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleanupSceneContent, addSheet]);

    useEffect(() => { if(controlsRef.current&&sheetsRef.current.size>0){const a=Array.from(sheetsRef.current.values()).sort((a,b)=>a.yOffset-b.yOffset);const my=(a[a.length-1].yOffset+a[0].yOffset)/2;controlsRef.current.target.set(0,my,0);}else if(controlsRef.current){controlsRef.current.target.set(0,0,0);}}, [sheetCountUI]);

    // --- Kontrollifunktiot pysyvät ennallaan ---
    const togglePlayPause = () => setIsPlaying(prev => !prev);
    const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => setAnimationSpeed(parseFloat(e.target.value));
    const handleAddSheet = () => addSheet();
    const handleRemoveSheet = () => removeSheet();
    const handleAddRandomWormhole = () => addRandomWormhole();
    const toggleDescription = () => {
      setIsDescriptionVisible(prev => !prev);
    };
return (
    // **** Päivitä JSX-selitystä ****
    <div className={viewStyles.moduleContainer}>
        <h2 className={viewStyles.moduleTitle}>Moduuli 2: Moniarkkinen Aika-avaruus</h2>
        <button
                onClick={toggleDescription}
                className={`${viewStyles.toggleButton} ${!isDescriptionVisible ? viewStyles.toggleButtonHidden : ''}`}
             >
                {isDescriptionVisible ? 'Piilota Selitys' : 'Näytä Selitys'}
             </button>
        <div className={`${viewStyles.description} ${!isDescriptionVisible ? viewStyles.descriptionHidden : ''}`}>
          <p> TGD:n yksi keskeisimmistä poikkeamista perinteisestä fysiikasta on aika-avaruuden kuvaaminen <strong>moniarkkisena rakenteena</strong> ("many-sheeted space-time"). Tässä mallissa aika-avaruus ei ole yksi yhtenäinen kokonaisuus, vaan se koostuu lukemattomista päällekkäisistä "arkeista". </p> <ul style={{fontSize: '0.9em', marginBottom: '1em'}}> <li><strong>Aika-avaruusarkit:</strong> Jokainen arkki on 4-ulotteinen pinta 8-ulotteisessa M⁴ x CP<sub>2</sub> -avaruudessa. Ne ovat kuin sivuja kirjassa, lähellä toisiaan tutussa avaruudessa mutta erillisiä korkeammassa ulottuvuudessa. Tässä visualisoinnissa arkit ovat eri värisiä ja eri korkeuksilla (SHEET_SPACING={SHEET_SPACING.toFixed(1)}). Arkit ovat läpinäkyviä (`opacity: 0.85`).</li> <li><strong>Hiukkaset arkeilla:</strong> Hiukkaset ovat laajennettuja rakenteita, jotka "elävät" arkeilla.</li> <li><strong>Madonreikäkontaktit (Wormhole Contacts):</strong> Mikroskooppiset "sillat" arkkien välillä mahdollistavat vuorovaikutukset. <ul> <li>Ne yhdistävät kaksi arkkia ja mahdollistavat energian virtauksen.</li> <li>Tässä visualisoinnissa madonreikä on dynaaminen pinta ("runko"), joka yhdistää kaksi arkkia. Rungon materiaali on asetettu piirtymään aina arkkien päälle (`depthTest: false`) ja olemaan itsekin läpinäkyvä (`opacity: 0.65`, `depthWrite: false`). Tämä saa rungon näyttämään himmeämmältä tai sulautuvan paremmin lehteen, kun sitä katsotaan lehden läpi, verrattuna siihen, kun se näkyy suoraan tummaa taustaa vasten. Värilliset, läpinäkymättömät renkaat ("hatut") päissä seuraavat arkkien pintaa ja piirtyvät oikein rungon päihin. Rungon geometria päivittyy ja kaartuu keskeltä.</li> </ul> </li> <li><strong>Seuraukset:</strong> Mahdollistaa TGD:n ennusteita mm. pimeästä aineesta, kvanttihierarkiasta ja biologiasta.</li> </ul>
          <p>Käytä kontrolleja lisätäksesi tai poistaaksesi arkkeja, lisätäksesi satunnaisia madonreikiä ylimpään väliin sekä säätääksesi animaation nopeutta.</p>
        </div>
        {/* Canvas container */}
        <div className={viewStyles.canvasContainer} ref={mountRef} style={{ width: '100%', height: '60vh', border: '1px solid #ccc', marginTop: '10px', position: 'relative', cursor: 'grab' }}>{/* Canvas */}</div>
        {/* Kontrollit */}
        <div className={viewStyles.controlsPanel} style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f8f8f8', borderRadius: '4px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px 20px', alignItems: 'center' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><button onClick={togglePlayPause} style={{ padding: '8px 15px', minWidth: '80px' }}> {isPlaying ? 'Pause' : 'Play'} </button></div>
             <div><label className={viewStyles.label} htmlFor="speedSlider2" style={{ fontWeight: 'bold', display: 'block', marginBottom: '3px' }}>Animaation Nopeus:</label><div style={{ display: 'flex', alignItems: 'center' }}><input type="range" id="speedSlider2" min="0" max={5} step="0.1" value={animationSpeed} onChange={handleSpeedChange} style={{ width: '100%' }}/><span className={viewStyles.valueDisplay} style={{ marginLeft: '10px', fontFamily: 'monospace', minWidth: '30px' }}>{animationSpeed.toFixed(1)}x</span></div></div>
             <div><button onClick={handleAddRandomWormhole} disabled={sheetCountUI < 2} style={{ padding: '8px 15px', width: '100%' }}> Lisää Satunnainen Madonreikä (Ylimpään Väliin) </button></div>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><button onClick={handleAddSheet} style={{ padding: '8px 15px' }}> Lisää Arkki </button><button onClick={handleRemoveSheet} disabled={sheetCountUI <= 1} style={{ padding: '8px 15px' }}> Poista Ylin Arkki </button></div>
             <div className={viewStyles.valueDisplay} style={{fontFamily: 'monospace'}}>Arkkeja: {sheetCountUI}</div>
             <div className={viewStyles.valueDisplay} style={{fontFamily: 'monospace'}}>Madonreikiä: {wormholeCountUI}</div>
        </div>
    </div>
);
};

export default ManySheetedView;