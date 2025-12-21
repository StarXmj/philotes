import { useRef, useMemo, useState, Suspense, useEffect } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Text, Float, Billboard } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react'
import * as THREE from 'three'

// --- 1. LOGIQUES MATHÉMATIQUES PARTAGÉES ---

// Fonction pour sécuriser l'URL
const getSafeAvatarUrl = (prive, publicName) => {
    if (prive) return prive;
    if (publicName && publicName !== 'null' && publicName !== 'undefined') return `/avatars/${publicName}`;
    return '/avatars/avatar1.png';
}

// Fonction PRÉCISE pour calculer la position d'un user (utilisée par la Sphère ET la Caméra)
const calculateUserPosition = (match) => {
    const score = match.score_global || 0
    // Distance : Plus le score est haut, plus on est près du centre (5 à 35 unités)
    const radiusDist = 35 - (score / 100) * 30 
    
    // Générateur pseudo-aléatoire stable basé sur l'ID
    const pseudoRandom = (str) => {
      let hash = 0;
      if (!str) return 0.5;
      for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
      return (Math.abs(hash) % 1000) / 1000;
    }

    const theta = pseudoRandom(match.id || 'default') * Math.PI * 2 
    const phi = Math.acos(2 * pseudoRandom(match.pseudo || 'user') - 1)
    
    // Conversion Sphérique -> Cartésien (X, Y, Z)
    return new THREE.Vector3(
      radiusDist * Math.sin(phi) * Math.cos(theta),
      radiusDist * Math.sin(phi) * Math.sin(theta),
      radiusDist * Math.cos(phi)
    )
}

// --- 2. LE CAMÉRAMAN AUTOMATIQUE (CameraRig) ---
// C'est lui qui gère le Zoom, le Reset et le Focus sur un utilisateur
function CameraRig({ selectedUser, zoomAction, setZoomAction }) {
    const { camera, controls } = useThree()
    const vec = new THREE.Vector3()

    useFrame((state, delta) => {
        // A. GESTION DU FOCUS UTILISATEUR (Si on clique dans la liste)
        if (selectedUser) {
            const targetPos = calculateUserPosition(selectedUser)
            
            // 1. On regarde vers l'utilisateur (Smooth)
            controls.target.lerp(targetPos, 0.1)
            
            // 2. La caméra se place juste devant lui (à 4 unités de distance)
            // On calcule un point sur la ligne entre le centre (0,0,0) et l'utilisateur
            // Direction = Utilisateur -> Centre (normalisé)
            const direction = targetPos.clone().normalize()
            // Position Caméra = Position User + (Direction * 4)
            const camTargetPos = targetPos.clone().add(direction.multiplyScalar(4))
            
            camera.position.lerp(camTargetPos, 0.05)
            controls.update()
        }

        // B. GESTION DES BOUTONS (Zoom Avant / Arrière / Reset)
        if (zoomAction) {
            const step = 20 * delta // Vitesse du zoom
            
            if (zoomAction === 'in') {
                // Avancer vers la cible actuelle
                const dist = camera.position.distanceTo(controls.target)
                if (dist > 5) camera.translateZ(-step) 
            }
            if (zoomAction === 'out') {
                // Reculer
                const dist = camera.position.distanceTo(controls.target)
                if (dist < 100) camera.translateZ(step)
            }
            if (zoomAction === 'reset') {
                // Retour à la vue globale
                controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.1)
                camera.position.lerp(new THREE.Vector3(0, 10, 40), 0.05)
                
                // Si on est arrivé proche du reset, on arrête l'action
                if (camera.position.distanceTo(new THREE.Vector3(0, 10, 40)) < 1) {
                    setZoomAction(null)
                }
            }
        }
    })

    // Arrêter l'action de zoom manuel quand on relâche le bouton (géré par events JS mais ici pour cleanup)
    return null
}

// --- 3. SPHÈRE UTILISATEUR ---
function UserSphere({ match, onClick, isSelected }) {
  const avatarMeshRef = useRef()
  const glowMeshRef = useRef()
  const [hovered, setHovered] = useState(false)
  
  const score = match.score_global || 0
  
  // Utilisation de la fonction centralisée (Memo pour perf)
  const position = useMemo(() => calculateUserPosition(match), [match])

  const color = score > 85 ? '#4ade80' : score > 60 ? '#60a5fa' : '#94a3b8'
  const isFriend = match.connection?.status === 'accepted'
  const finalGlowColor = isFriend ? '#8b5cf6' : color

  const avatarUrl = getSafeAvatarUrl(match.avatar_prive, match.avatar_public)
  const texture = useLoader(THREE.TextureLoader, avatarUrl)

  useFrame((state, delta) => {
      if (avatarMeshRef.current) avatarMeshRef.current.rotation.y += delta * 0.2
      // Si sélectionné, le glow pulse
      if (isSelected && glowMeshRef.current) {
          glowMeshRef.current.scale.setScalar(1.2 + Math.sin(state.clock.elapsedTime * 3) * 0.1)
      }
  })

  const baseSize = 0.35
  const scale = hovered || isSelected ? 1.5 : 1

  return (
    <Float speed={2} rotationIntensity={0.2} floatIntensity={0.5}>
      <group 
        position={position} 
        scale={[scale, scale, scale]}
        onClick={(e) => { e.stopPropagation(); onClick(match) }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; setHovered(true) }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; setHovered(false) }}
      >
          <mesh ref={avatarMeshRef}>
            <sphereGeometry args={[baseSize, 32, 32]} />
            <meshStandardMaterial map={texture} roughness={0.4} metalness={0.1} />
          </mesh>

          <mesh ref={glowMeshRef}>
            <sphereGeometry args={[baseSize * 1.2, 32, 32]} />
            <meshBasicMaterial color={finalGlowColor} transparent opacity={(hovered || isSelected) ? 0.6 : 0.3} side={THREE.BackSide} />
          </mesh>

          {(hovered || isSelected) && (
            <Billboard position={[0, -baseSize * 2, 0]}>
                <Text fontSize={0.5} color="white" outlineWidth={0.02} outlineColor="#000000" anchorY="top">
                {match.pseudo || 'Utilisateur'}
                </Text>
                <Text fontSize={0.3} color={finalGlowColor} position={[0, -0.6, 0]} outlineWidth={0.01} outlineColor="#000000" anchorY="top">
                {Math.round(score)}%
                </Text>
            </Billboard>
          )}
      </group>
    </Float>
  )
}

// --- 4. SOLEIL (MOI) ---
function MyAvatarSphere({ profile }) {
  const avatarUrl = getSafeAvatarUrl(profile?.avatar_prive, profile?.avatar_public)
  const texture = useLoader(THREE.TextureLoader, avatarUrl)
  const meshRef = useRef()

  useFrame((state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y -= delta * 0.1 
  })

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

// --- 5. GUIDES VISUELS ---
function OrbitalGuides() {
    return (
        <group rotation={[Math.PI / 2, 0, 0]}> 
           <mesh rotation={[-Math.PI / 2, 0, 0]}>
             <ringGeometry args={[34.8, 35, 128]} />
             <meshBasicMaterial color="white" opacity={0.03} transparent side={THREE.DoubleSide} />
           </mesh>
           <mesh rotation={[-Math.PI / 2, 0, 0]}>
             <ringGeometry args={[9.4, 9.5, 128]} />
             <meshBasicMaterial color="#4ade80" opacity={0.08} transparent side={THREE.DoubleSide} />
           </mesh>
        </group>
    )
}

// --- COMPOSANT PRINCIPAL ---
export default function Constellation3D({ matches, myProfile, onSelectUser, selectedUser: dashboardSelectedUser }) { // Note: on reçoit selectedUser du Dashboard
  const [zoomAction, setZoomAction] = useState(null)
  
  // Petit hack pour gérer le "press and hold" sur les boutons de zoom
  const startZoom = (action) => setZoomAction(action)
  const stopZoom = () => { if(zoomAction !== 'reset') setZoomAction(null) }

  // IMPORTANT: Quand selectedUser change via la liste, on veut que le CameraRig prenne le relais.
  // Mais selectedUser est un objet complet (ou null).

  return (
    <div className="w-full h-full bg-slate-900 cursor-move relative group">
      
      {/* --- UI OVERLAY (LES FAMEUX BOUTONS) --- */}
      <div className="absolute bottom-6 right-6 z-40 flex flex-col gap-2 bg-slate-800/90 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-2xl">
            <button 
                onMouseDown={() => startZoom('in')} onMouseUp={stopZoom} onMouseLeave={stopZoom}
                className="p-3 hover:bg-white/10 rounded-lg text-white transition active:bg-philo-primary" title="Zoom Avant"
            >
                <ZoomIn size={24}/>
            </button>
            
            <button 
                onClick={() => startZoom('reset')} 
                className="p-3 hover:bg-white/10 rounded-lg text-white transition active:bg-philo-primary" title="Réinitialiser la vue"
            >
                <RotateCcw size={24}/>
            </button>
            
            <button 
                onMouseDown={() => startZoom('out')} onMouseUp={stopZoom} onMouseLeave={stopZoom}
                className="p-3 hover:bg-white/10 rounded-lg text-white transition active:bg-philo-primary" title="Zoom Arrière"
            >
                <ZoomOut size={24}/>
            </button>
      </div>

      <div className="absolute top-4 left-4 z-40 px-3 py-1 bg-black/40 backdrop-blur-sm rounded-full border border-white/5 text-[10px] text-gray-400 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
            <Move size={12}/> Clic Gauche: Tourner • Clic Droit: Déplacer • Molette: Zoom
      </div>

      <Canvas camera={{ position: [0, 10, 40], fov: 50 }} gl={{ antialias: true }}>
        {/* Le CameraRig gère les animations fluides */}
        <CameraRig selectedUser={dashboardSelectedUser} zoomAction={zoomAction} setZoomAction={setZoomAction} />

        {/* OrbitControls en mode "esclave" (il obéit au CameraRig quand nécessaire) */}
        <OrbitControls 
            makeDefault
            enablePan={true} 
            enableZoom={true} 
            enableRotate={true}
            autoRotate={!dashboardSelectedUser && !zoomAction} // Arrête la rotation auto si on focus quelqu'un
            autoRotateSpeed={0.2}
            minDistance={3}
            maxDistance={120} 
        />

        <Stars radius={200} depth={50} count={8000} factor={4} saturation={0} fade speed={0.5} />
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
                    isSelected={dashboardSelectedUser?.id === match.id} // Pour le glow actif
                />
            ))}
        </Suspense>

        <EffectComposer>
            <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} height={300} intensity={1.2} />
        </EffectComposer>
      </Canvas>
    </div>
  )
}