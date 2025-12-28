import { useRef, useMemo, useState, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars, Text, Billboard, useTexture } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react'
import * as THREE from 'three'

const getSafeAvatarUrl = (prive, publicName) => {
    if (prive) return prive;
    if (publicName && publicName !== 'null') return `/avatars/${publicName}`;
    return '/avatars/avatar1.png';
}

// Fonction position AVEC CONVERSION 100%
const calculateUserPosition = (match, scoreMode) => {
    let score = scoreMode === 'VIBES' ? (match.personality_score || 0) : (match.profile_score || 0)
    if (score <= 1) score *= 100 // <-- FIX ICI
    
    // Si score=100 -> dist=5 (près), si score=0 -> dist=35 (loin)
    const radiusDist = 35 - (score / 100) * 30 
    
    const pseudoRandom = (str) => {
      let hash = 0; if (!str) return 0.5;
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

const sharedSphereGeo = new THREE.SphereGeometry(0.35, 16, 16)
const sharedGlowGeo = new THREE.SphereGeometry(0.35 * 1.3, 16, 16)
const sharedGlowMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, side: THREE.BackSide })

function CameraRig({ selectedUser, zoomAction, setZoomAction, scoreMode }) {
    const { camera, controls } = useThree()
    useFrame((state, delta) => {
        if (selectedUser) {
            const targetPos = calculateUserPosition(selectedUser, scoreMode)
            controls.target.lerp(targetPos, 0.1)
            const direction = targetPos.clone().normalize()
            const camTargetPos = targetPos.clone().add(direction.multiplyScalar(4))
            camera.position.lerp(camTargetPos, 0.05)
            controls.update()
        }
        if (zoomAction) {
            const step = 20 * delta 
            if (zoomAction === 'in') { const dist = camera.position.distanceTo(controls.target); if (dist > 5) camera.translateZ(-step) }
            if (zoomAction === 'out') { const dist = camera.position.distanceTo(controls.target); if (dist < 100) camera.translateZ(step) }
            if (zoomAction === 'reset') {
                controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.1)
                camera.position.lerp(new THREE.Vector3(0, 10, 40), 0.05)
                if (camera.position.distanceTo(new THREE.Vector3(0, 10, 40)) < 1) setZoomAction(null)
            }
        }
    })
    return null
}

function UserSphere({ match, onClick, isSelected, unreadCount, myId, scoreMode }) {
  const glowMeshRef = useRef()
  const [hovered, setHovered] = useState(false)
  
  const isFriend = match.connection?.status === 'accepted'
  const isPendingRequest = match.connection?.status === 'pending' && match.connection?.receiver_id === myId
  const hasUnreadMessages = unreadCount > 0
  
  // RECUPERATION DU SCORE AVEC CONVERSION
  let score = scoreMode === 'VIBES' ? (match.personality_score || 0) : (match.profile_score || 0)
  if (score <= 1) score *= 100 // <-- FIX ICI

  let baseColor = '#94a3b8'; let glowColor = baseColor; let pulseSpeed = 2
  if (isPendingRequest) { baseColor = '#4ade80'; glowColor = '#4ade80'; pulseSpeed = 8 } 
  else if (hasUnreadMessages) { baseColor = '#ffffff'; glowColor = '#ffffff'; pulseSpeed = 6 } 
  else if (isFriend) { baseColor = '#8b5cf6'; glowColor = '#8b5cf6'; pulseSpeed = 2 } 
  else {
      if (score >= 85) { baseColor = '#4ade80'; glowColor = '#22c55e' }
      else if (score >= 60) { baseColor = '#2dd4bf'; glowColor = '#0f766e' }
      else if (score >= 45) { baseColor = '#60a5fa'; glowColor = '#3b82f6' }
      else { baseColor = '#818cf8'; glowColor = '#6366f1' }
  }

  const position = useMemo(() => calculateUserPosition(match, scoreMode), [match, scoreMode])
  const avatarUrl = getSafeAvatarUrl(match.avatar_prive, match.avatar_public)
  const texture = useTexture(avatarUrl)
  const showDetails = hovered || isSelected || isPendingRequest || hasUnreadMessages

  useFrame((state) => { if (showDetails && glowMeshRef.current) glowMeshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * pulseSpeed) * 0.15) })
  const handleOver = (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; setHovered(true) }
  const handleOut = () => { document.body.style.cursor = 'auto'; setHovered(false) }

  return (
      <group position={position} scale={isSelected ? 1.5 : 1} onClick={(e) => { e.stopPropagation(); onClick(match) }} onPointerOver={handleOver} onPointerOut={handleOut}>
          <mesh geometry={sharedSphereGeo}><meshStandardMaterial map={texture} roughness={0.4} metalness={0.1} color={!texture ? baseColor : 'white'} /></mesh>
          {showDetails && (<mesh ref={glowMeshRef} geometry={sharedGlowGeo} material={sharedGlowMat} material-color={glowColor} />)}
          {isPendingRequest && (<Billboard position={[0.4, 0.4, 0]}><mesh><circleGeometry args={[0.2, 32]} /><meshBasicMaterial color="#22c55e" /></mesh><Text position={[0, 0, 0.01]} fontSize={0.12} color="black" fontWeight="bold">NEW</Text></Billboard>)}
          {hasUnreadMessages && !isPendingRequest && (<Billboard position={[0.4, 0.4, 0]}><mesh><circleGeometry args={[0.18, 32]} /><meshBasicMaterial color="#ef4444" /></mesh><Text position={[0, 0, 0.01]} fontSize={0.15} color="white" fontWeight="bold">{unreadCount > 9 ? '+9' : unreadCount}</Text></Billboard>)}
          {(hovered || isSelected) && (
            <Billboard position={[0, -0.7, 0]}>
                <Text fontSize={0.5} color="white" outlineWidth={0.02} outlineColor="#000000" anchorY="top">{match.pseudo || 'Utilisateur'}</Text>
                <Text fontSize={0.3} color={glowColor} position={[0, -0.6, 0]} outlineWidth={0.01} outlineColor="#000000" anchorY="top">{Math.round(score)}%</Text>
            </Billboard>
          )}
      </group>
  )
}

function MyAvatarSphere({ profile }) {
  const avatarUrl = getSafeAvatarUrl(profile?.avatar_prive, profile?.avatar_public)
  const texture = useTexture(avatarUrl)
  const meshRef = useRef()
  useFrame((state, delta) => { if (meshRef.current) meshRef.current.rotation.y -= delta * 0.1 })
  return (
    <group>
        <pointLight position={[0, 0, 0]} intensity={4} color="#8b5cf6" distance={40} decay={2} />
        <mesh ref={meshRef}><sphereGeometry args={[1, 64, 64]} /><meshStandardMaterial map={texture} emissive="#8b5cf6" emissiveIntensity={0.6} roughness={0.2} /></mesh>
        <mesh><sphereGeometry args={[1.2, 32, 32]} /><meshBasicMaterial color="#8b5cf6" transparent opacity={0.2} side={THREE.BackSide} /></mesh>
        <Billboard position={[0, -1.5, 0]}><Text fontSize={0.6} color="white" outlineWidth={0.04} outlineColor="#000000">Moi</Text></Billboard>
    </group>
  )
}
function OrbitalGuides() {
    return (
        <group rotation={[Math.PI / 2, 0, 0]}> 
           <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[34.8, 35, 64]} /><meshBasicMaterial color="white" opacity={0.03} transparent side={THREE.DoubleSide} /></mesh>
           <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[9.4, 9.5, 64]} /><meshBasicMaterial color="#4ade80" opacity={0.08} transparent side={THREE.DoubleSide} /></mesh>
        </group>
    )
}

export default function Constellation3D({ matches, myProfile, onSelectUser, selectedUser, unreadCounts = {}, myId, scoreMode }) { 
  const [zoomAction, setZoomAction] = useState(null)
  return (
    <div className="w-full h-full bg-slate-900 cursor-move relative group">
      <div className="absolute bottom-6 right-6 z-40 flex flex-col gap-2 bg-slate-800/90 backdrop-blur-md p-2 rounded-xl border border-white/10 shadow-2xl">
            <button onMouseDown={() => setZoomAction('in')} onMouseUp={() => setZoomAction(null)} className="p-3 hover:bg-white/10 rounded-lg text-white"><ZoomIn size={24}/></button>
            <button onClick={() => setZoomAction('reset')} className="p-3 hover:bg-white/10 rounded-lg text-white"><RotateCcw size={24}/></button>
            <button onMouseDown={() => setZoomAction('out')} onMouseUp={() => setZoomAction(null)} className="p-3 hover:bg-white/10 rounded-lg text-white"><ZoomOut size={24}/></button>
      </div>
      <div className="absolute top-4 left-4 z-40 px-3 py-1 bg-black/40 backdrop-blur-sm rounded-full border border-white/5 text-[10px] text-gray-400 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2"><Move size={12}/> Navigation 3D optimisée</div>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 10, 40], fov: 50 }} gl={{ powerPreference: "high-performance", antialias: false }} performance={{ min: 0.5 }}>
        <CameraRig selectedUser={selectedUser} zoomAction={zoomAction} setZoomAction={setZoomAction} scoreMode={scoreMode} />
        <OrbitControls makeDefault enablePan={true} enableZoom={true} enableRotate={true} autoRotate={!selectedUser && !zoomAction} autoRotateSpeed={0.2} minDistance={3} maxDistance={120} />
        <Stars radius={200} depth={50} count={5000} factor={4} saturation={0} fade speed={0.5} />
        <ambientLight intensity={0.2} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Suspense fallback={null}>
            <MyAvatarSphere profile={myProfile} />
            <OrbitalGuides />
            {matches.map((match) => (
                <UserSphere key={match.id} match={match} onClick={onSelectUser} isSelected={selectedUser?.id === match.id} unreadCount={unreadCounts[match.id] || 0} myId={myId} scoreMode={scoreMode} />
            ))}
        </Suspense>
        <EffectComposer multisampling={0} disableNormalPass><Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.0} resolutionScale={0.5} /></EffectComposer>
      </Canvas>
    </div>
  )
}