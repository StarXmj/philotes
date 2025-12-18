import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, GraduationCap, MapPin, User, BrainCircuit, Loader2, Sparkles } from 'lucide-react'

const CAMPUS_LIST = ["Pau", "Bayonne", "Anglet", "Tarbes", "Mont-de-Marsan"]

export default function Profile() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState(null)

  // États du formulaire
  const [pseudo, setPseudo] = useState('')
  const [sexe, setSexe] = useState('')
  const [birthDate, setBirthDate] = useState('')
  
  // États Scolaires
  const [formationsData, setFormationsData] = useState([])
  const [selectedEtude, setSelectedEtude] = useState('')
  const [selectedTheme, setSelectedTheme] = useState('')
  const [selectedAnnee, setSelectedAnnee] = useState('')
  const [selectedNom, setSelectedNom] = useState('')
  const [selectedParcours, setSelectedParcours] = useState('')
  const [selectedLieu, setSelectedLieu] = useState('')

  // États Réponses Quiz (Structure: { question: string, answer: string })
  const [myVibes, setMyVibes] = useState([])

  // 1. CHARGEMENT
  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return navigate('/')
      setUser(user)

      // A. Récupérer le profil principal
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profile) {
        setPseudo(profile.pseudo || '')
        setSexe(profile.sexe || '')
        setBirthDate(profile.date_naissance || '')
        setSelectedEtude(profile.type_diplome || '')
        setSelectedTheme(profile.domaine || '')
        setSelectedAnnee(profile.annee_etude || '')
        setSelectedNom(profile.intitule || '')
        setSelectedParcours(profile.parcours || '')
        setSelectedLieu(profile.etudes_lieu || '')
      }

      // B. Récupérer les Réponses AVEC les Questions
      const { data: answers } = await supabase
        .from('user_answers')
        .select(`
          question_id,
          questions ( text ), 
          options ( text )
        `)
        .eq('user_id', user.id)
      
      if (answers) {
        // On formate les données pour l'affichage
        const formattedVibes = answers.map(a => ({
          question: a.questions?.text,
          answer: a.options?.text
        }))
        setMyVibes(formattedVibes)
      }

      // C. Récupérer les formations
      const { data: form } = await supabase.from('formations').select('*')
      setFormationsData(form || [])
      
      setLoading(false)
    }
    loadProfile()
  }, [navigate])

  // --- LOGIQUE FILTRES ---
  const etudesOpts = [...new Set(formationsData.map(f => f.etude))].filter(Boolean).sort()
  const themesOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude).map(f => f.theme))].filter(Boolean).sort()
  const anneesOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme).map(f => f.annee))].filter(Boolean).sort()
  const nomsOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme && f.annee === selectedAnnee).map(f => f.nom))].filter(Boolean).sort()
  const parcoursOpts = [...new Set(formationsData.filter(f => f.etude === selectedEtude && f.theme === selectedTheme && f.annee === selectedAnnee && f.nom === selectedNom).map(f => f.parcours))].filter(Boolean).sort()

  // --- SAUVEGARDE ---
  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)

    const { error } = await supabase
      .from('profiles')
      .update({
        pseudo, sexe, date_naissance: birthDate,
        type_diplome: selectedEtude, domaine: selectedTheme, annee_etude: selectedAnnee,
        intitule: selectedNom, parcours: selectedParcours || null, etudes_lieu: selectedLieu
      })
      .eq('id', user.id)

    if (error) { alert("Erreur sauvegarde") } 
    else { navigate('/app') }
    setSaving(false)
  }

  const handleRetakeQuiz = () => {
    navigate('/onboarding', { state: { mode: 'edit' } })
  }

  const selectStyle = "w-full p-3 rounded-xl bg-slate-800 border border-slate-600 text-white focus:border-philo-primary focus:outline-none appearance-none cursor-pointer placeholder-gray-400"

  if (loading) return <div className="min-h-screen bg-philo-dark flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2"/> Chargement...</div>

  return (
    <div className="min-h-screen bg-philo-dark p-6 md:p-10 text-white">
      <div className="max-w-3xl mx-auto">
        
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate('/app')} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-3xl font-bold">Mon Profil</h1>
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          
          {/* 1. INFOS PERSO */}
          <div className="bg-white/5 p-6 rounded-3xl border border-white/10 shadow-lg">
            <div className="flex items-center gap-2 mb-6 text-philo-primary">
              <User size={24} />
              <h2 className="font-bold uppercase text-sm tracking-wider">Moi</h2>
            </div>
            
            <div className="grid gap-6">
              <div>
                <label className="text-xs text-gray-400 uppercase block mb-1">Pseudo</label>
                <input type="text" required value={pseudo} onChange={e => setPseudo(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3 text-white focus:border-philo-primary focus:outline-none" />
              </div>
              
              <div className="flex gap-4">
                <div className="w-1/2">
                  <label className="text-xs text-gray-400 uppercase block mb-1">Genre</label>
                  <select required value={sexe} onChange={e => setSexe(e.target.value)} className={selectStyle}>
                    <option value="Homme">Homme</option><option value="Femme">Femme</option><option value="Autre">Autre</option>
                  </select>
                </div>
                <div className="w-1/2">
                  <label className="text-xs text-gray-400 uppercase block mb-1">Naissance</label>
                  <input type="date" required value={birthDate} onChange={e => setBirthDate(e.target.value)} className={`${selectStyle} text-sm`} />
                </div>
              </div>
            </div>
          </div>

          {/* 2. INFOS SCOLAIRES */}
          <div className="bg-white/5 p-6 rounded-3xl border border-white/10 shadow-lg">
            <div className="flex items-center gap-2 mb-6 text-philo-secondary">
              <GraduationCap size={24} />
              <h2 className="font-bold uppercase text-sm tracking-wider">Ma Fac</h2>
            </div>

            <div className="space-y-4">
               <div>
                  <label className="text-xs text-gray-400 block mb-1">Diplôme</label>
                  <select required value={selectedEtude} onChange={e => { setSelectedEtude(e.target.value); setSelectedTheme(''); }} className={selectStyle}>
                    {etudesOpts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                    <label className="text-xs text-gray-400 block mb-1">Domaine</label>
                    <select required value={selectedTheme} onChange={e => { setSelectedTheme(e.target.value); setSelectedAnnee(''); }} className={selectStyle}>
                      {themesOpts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                 </div>
                 <div>
                    <label className="text-xs text-gray-400 block mb-1">Année</label>
                    <select required value={selectedAnnee} onChange={e => { setSelectedAnnee(e.target.value); setSelectedNom(''); }} className={selectStyle}>
                      {anneesOpts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                 </div>
               </div>

               <div>
                  <label className="text-xs text-gray-400 block mb-1">Intitulé Exact</label>
                  <select required value={selectedNom} onChange={e => { setSelectedNom(e.target.value); setSelectedParcours(''); }} className={selectStyle}>
                    {nomsOpts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
               </div>

               {parcoursOpts.length > 0 && (
                 <div>
                    <label className="text-xs text-gray-400 block mb-1">Option / Parcours</label>
                    <select value={selectedParcours} onChange={e => setSelectedParcours(e.target.value)} className={selectStyle}>
                      <option value="">(Aucune)</option>
                      {parcoursOpts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                 </div>
               )}

               <div>
                  <label className="text-xs text-gray-400 block mb-1 flex items-center gap-1"><MapPin size={12}/> Campus</label>
                  <select required value={selectedLieu} onChange={e => setSelectedLieu(e.target.value)} className={selectStyle}>
                    {CAMPUS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
               </div>
            </div>
          </div>

          {/* 3. VIBES & PERSONNALITÉ (Affichage Détaillé) */}
          <div className="bg-gradient-to-br from-purple-900/40 to-blue-900/40 p-6 rounded-3xl border border-white/10 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2 text-purple-300">
                <BrainCircuit size={24} />
                <h2 className="font-bold uppercase text-sm tracking-wider">Ma Personnalité</h2>
              </div>
              <button 
                type="button"
                onClick={handleRetakeQuiz}
                className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 rounded-xl text-xs font-bold text-purple-200 transition flex items-center gap-2"
              >
                <Sparkles size={14} /> Modifier mes réponses
              </button>
            </div>
            
            {/* GRILLE DES QUESTIONS / RÉPONSES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {myVibes.length > 0 ? (
                myVibes.map((vibe, idx) => (
                  <div key={idx} className="bg-black/30 border border-white/10 rounded-xl p-3">
                    <p className="text-[10px] uppercase text-philo-primary font-bold mb-1 opacity-70">
                      {vibe.question}
                    </p>
                    <p className="text-sm font-medium text-white">
                      {vibe.answer}
                    </p>
                  </div>
                ))
              ) : (
                <div className="col-span-2 text-gray-500 italic text-sm text-center py-4 bg-black/20 rounded-xl">
                  Aucune donnée... Refais le quiz pour calibrer ton IA !
                </div>
              )}
            </div>
          </div>

          {/* BOUTON SAVE */}
          <div className="sticky bottom-6 pt-4">
             <div className="absolute inset-0 bg-gradient-to-t from-philo-dark via-philo-dark to-transparent -z-10 h-24 -top-10" />
            <button 
              type="submit" 
              disabled={saving}
              className="w-full py-4 bg-gradient-to-r from-philo-primary to-philo-secondary rounded-2xl font-bold text-white shadow-xl hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="animate-spin"/> : <Save size={20} />}
              Enregistrer les modifications
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}