import { useRef, useMemo, useState, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Text, Float, Billboard, useTexture } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react'
import * as THREE from 'three'

// --- 1. LOGIQUES MATHÉMATIQUES PARTAGÉES ---

const getSafeAvatarUrl = (prive, publicName) => {
    if (prive) return prive;
    if (publicName && publicName !== 'null' && publicName !== 'undefined') return `/avatars/${publicName}`;
    return '/avatars/avatar1.png';
}

const calculateUserPosition = (match) => {
    const score = match.score_global || 0
    const radiusDist = 35 - (score / 100) * 30 
    
    const pseudoRandom = (str) => {
      let hash = 0;
      if (!str) return 0.5;
      for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
      return (Math.abs(hash) % 1000) / 1000;
    }

    const theta = pseudoRandom(match.id || 'default') * Math.PI * 2 
    const phi = Math.acos(2 * pseudoRandom(match.pseudo || 'user') - 1)
    
    return new THREE.Vector3(
      radiusDist * Math.sin(phi) * Math.cos(theta),
      radiusDist * Math.sin(phi) * Math.sin(theta),
      radiusDist * Math.cos(phi)
    )
}

// --- OPTIMISATION ÉTAPE 3 : GÉOMÉTRIES PARTAGÉES ---
// Instanciation unique hors du cycle de vie React
const sharedSphereGeo = new THREE.SphereGeometry(0.35, 16, 16) // Segments réduits (32 -> 16) pour perf mobile
const sharedGlowGeo = new THREE.SphereGeometry(0.35 * 1.2, 16, 16)
const sharedGlowMat = new THREE.MeshBasicMaterial({ 
    transparent: true, 
    opacity: 0.5, 
    side: THREE.BackSide 
})

// --- 2. CAMERA RIG ---
function CameraRig({ selectedUser, zoomAction, setZoomAction }) {
    const { camera, controls } = useThree()

    useFrame((state, delta) => {
        if (selectedUser) {
            const targetPos = calculateUserPosition(selectedUser)
            controls.target.lerp(targetPos, 0.1)
            const direction = targetPos.clone().normalize()
            const camTargetPos = targetPos.clone().add(direction.multiplyScalar(4))
            camera.position.lerp(camTargetPos, 0.05)
            controls.update()
        }

        if (zoomAction) {
            const step = 20 * delta 
            if (zoomAction === 'in') {
                const dist = camera.position.distanceTo(controls.target)
                if (dist > 5) camera.translateZ(-step) 
            }
            if (zoomAction === 'out') {
                const dist = camera.position.distanceTo(controls.target)
                if (dist < 100) camera.translateZ(step)
            }
            if (zoomAction === 'reset') {
                controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.1)
                camera.position.lerp(new THREE.Vector3(0, 10, 40), 0.05)
                if (camera.position.distanceTo(new THREE.Vector3(0, 10, 40)) < 1) setZoomAction(null)
            }
        }
    })
    return null
}

// --- 3. SPHÈRE UTILISATEUR OPTIMISÉE ---
function UserSphere({ match, onClick, isSelected }) {
  const glowMeshRef = useRef()
  const [hovered, setHovered] = useState(false)
  
  const score = match.score_global || 0
  const position = useMemo(() => calculateUserPosition(match), [match])
  const color = useMemo(() => score > 85 ? '#4ade80' : score > 60 ? '#60a5fa' : '#94a3b8', [score])
  const isFriend = match.connection?.status === 'accepted'
  const finalGlowColor = isFriend ? '#8b5cf6' : color

  // Chargement texture
  const avatarUrl = getSafeAvatarUrl(match.avatar_prive, match.avatar_public)
  const texture = useTexture(avatarUrl)

  // OPTIMISATION CRITIQUE : Affichage conditionnel
  const showDetails = hovered || isSelected

  useFrame((state) => {
      if (showDetails && glowMeshRef.current) {
          glowMeshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.1)
      }
  })

  // Gestion événements pour activer/désactiver le mode "Détail"
  const handleOver = (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; setHovered(true) }
  const handleOut = () => { document.body.style.cursor = 'auto'; setHovered(false) }

  // Groupe principal (toujours rendu mais léger)
  const MeshContent = (
      <group 
        position={position} 
        scale={showDetails ? 1.5 : 1}
        onClick={(e) => { e.stopPropagation(); onClick(match) }}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
          {/* Sphère Base : Géométrie partagée */}
          <mesh geometry={sharedSphereGeo}>
            <meshStandardMaterial map={texture} roughness={0.4} metalness={0.1} color={!texture ? color : 'white'} />
          </mesh>

          {/* Éléments lourds : Rendu conditionnel strict */}
          {showDetails && (
            <>
                <mesh ref={glowMeshRef} geometry={sharedGlowGeo} material={sharedGlowMat} material-color={finalGlowColor} />
                <Billboard position={[0, -0.7, 0]}>
                    <Text fontSize={0.5} color="white" outlineWidth={0.02} outlineColor="#000000" anchorY="top">
                        {match.pseudo || 'Utilisateur'}
                    </Text>
                    <Text fontSize={0.3} color={finalGlowColor} position={[0, -0.6, 0]} outlineWidth={0.01} outlineColor="#000000" anchorY="top">
                        {Math.round(score)}%
                    </Text>
                </Billboard>
            </>
          )}
      </group>
  )

  // Le composant Float consomme du CPU, on ne l'active que si nécessaire
  return showDetails ? (
      <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>{MeshContent}</Float>
  ) : MeshContent
}

// --- 4. SOLEIL (MOI) ---
function MyAvatarSphere({ profile }) {
  const avatarUrl = getSafeAvatarUrl(profile?.avatar_prive, profile?.avatar_public)
  const texture = useTexture(avatarUrl)
  const meshRef = useRef()

  useFrame((state, delta) => { if (meshRef.current) meshRef.current.rotation.y -= delta * 0.1 })

  return (
    <group>
        <pointLight position={[0, 0, 0]} intensity={4} color="#8b5cf6" distance={40} decay={2} />
        <mesh ref={meshRef}>
            <sphereGeometry args={[1, 64, 64]} />
            <meshStandardMaterial map={texture} emissive="#8b5cf6" emissiveIntensity={0.6} roughness={0.2} />
        </mesh>
        <mesh>
            <sphereGeometry args={[1.2, 32, 32]} />
            <meshBasicMaterial color="#8b5cf6" transparent opacity={0.2} side={THREE.BackSide} />
        </mesh>
        <Billboard position={[0, -1.5, 0]}>
             <Text fontSize={0.6} color="white" outlineWidth={0.04} outlineColor="#000000">Moi</Text>
        </Billboard>
    </group>
  )
}

function OrbitalGuides() {
    return (
        <group rotation={[Math.PI / 2, 0, 0]}> 
           <mesh rotation={[-Math.PI / 2, 0, 0]}>
             <ringGeometry args={[34.8, 35, 64]} /> 
             <meshBasicMaterial color="white" opacity={0.03} transparent side={THREE.DoubleSide} />
           </mesh>
           <mesh rotation={[-Math.PI / 2, 0, 0]}>
             <ringGeometry args={[9.4, 9.5, 64]} />
             <meshBasicMaterial color="#4ade80" opacity={0.08} transparent side={THREE.DoubleSide} />
           </mesh>
        </group>
    )
}

// --- COMPOSANT PRINCIPAL ---
export default function Constellation3D({ matches, myProfile, onSelectUser, selectedUser }) { 
  const [zoomAction, setZoomAction] = useState(null)
  
  return (
    <div className="w-full h-full bg-slate-900 cursor-move relative group">
      {/* UI Overlay */}
      <div className="absolute bottom-6 right-6 z-40 flex flex-col gap-2 bg-slate-800/90 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-2xl">
            <button onMouseDown={() => setZoomAction('in')} onMouseUp={() => setZoomAction(null)} className="p-3 hover:bg-white/10 rounded-lg text-white"><ZoomIn size={24}/></button>
            <button onClick={() => setZoomAction('reset')} className="p-3 hover:bg-white/10 rounded-lg text-white"><RotateCcw size={24}/></button>
            <button onMouseDown={() => setZoomAction('out')} onMouseUp={() => setZoomAction(null)} className="p-3 hover:bg-white/10 rounded-lg text-white"><ZoomOut size={24}/></button>
      </div>

      <div className="absolute top-4 left-4 z-40 px-3 py-1 bg-black/40 backdrop-blur-sm rounded-full border border-white/5 text-[10px] text-gray-400 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
            <Move size={12}/> Navigation 3D optimisée
      </div>

      {/* ÉTAPE 4 : CONFIGURATION CANVAS OPTIMISÉE */}
      <Canvas 
        dpr={[1, 1.5]} // Limite le DPR pour sauver le GPU
        camera={{ position: [0, 10, 40], fov: 50 }} 
        gl={{ 
            powerPreference: "high-performance", 
            antialias: false // Désactivé car Bloom floute les bords de toute façon = Gain FPS
        }}
        performance={{ min: 0.5 }} // R3F dégradera la qualité automatiquement si FPS < 30
      >
        <CameraRig selectedUser={selectedUser} zoomAction={zoomAction} setZoomAction={setZoomAction} />

        <OrbitControls makeDefault enablePan={true} enableZoom={true} enableRotate={true} autoRotate={!selectedUser && !zoomAction} autoRotateSpeed={0.2} minDistance={3} maxDistance={120} />

        <Stars radius={200} depth={50} count={5000} factor={4} saturation={0} fade speed={0.5} />
        <ambientLight intensity={0.2} />
        <directionalLight position={[10, 10, 5]} intensity={1} />

        <Suspense fallback={null}>
            <MyAvatarSphere profile={myProfile} />
            <OrbitalGuides />
            {matches.map((match) => (
                <UserSphere 
                    key={match.id} 
                    match={match} 
                    onClick={onSelectUser} 
                    isSelected={selectedUser?.id === match.id} 
                />
            ))}
        </Suspense>

        {/* POST-PROCESSING OPTIMISÉ */}
        <EffectComposer multisampling={0} disableNormalPass>
            <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.0} resolutionScale={0.5} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}