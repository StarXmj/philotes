import { useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, UserCircle, ArrowRight } from 'lucide-react'
import { useOnboarding } from '../../contexts/OnboardingContext'

const CAMPUS_LIST = ["Pau", "Bayonne", "Anglet", "Tarbes", "Mont-de-Marsan"]
const selectStyle = "w-full p-3 rounded-xl bg-slate-800 border border-slate-600 text-white focus:border-philo-primary focus:outline-none appearance-none cursor-pointer placeholder-gray-400"

export default function InfoFormStep({ onNext }) {
  const { formData, updateFormData, formationsData, isEditMode } = useOnboarding()
  const { etude, theme, annee, nom, parcours, lieu, pseudo, sexe, birthDate } = formData

  const etudesOpts = useMemo(() => [...new Set(formationsData.map(f => f.etude))].filter(Boolean).sort(), [formationsData])
  const themesOpts = useMemo(() => [...new Set(formationsData.filter(f => f.etude === etude).map(f => f.theme))].filter(Boolean).sort(), [formationsData, etude])
  const anneesOpts = useMemo(() => [...new Set(formationsData.filter(f => f.etude === etude && f.theme === theme).map(f => f.annee))].filter(Boolean).sort(), [formationsData, etude, theme])
  const nomsOpts   = useMemo(() => [...new Set(formationsData.filter(f => f.etude === etude && f.theme === theme && f.annee === annee).map(f => f.nom))].filter(Boolean).sort(), [formationsData, etude, theme, annee])
  const parcoursOpts = useMemo(() => [...new Set(formationsData.filter(f => f.etude === etude && f.theme === theme && f.annee === annee && f.nom === nom).map(f => f.parcours))].filter(Boolean).sort(), [formationsData, etude, theme, annee, nom])

  const isDoctorat = etude && etude.includes('Doctora')

  useEffect(() => {
    if (etude && !theme && themesOpts.length === 1) updateFormData('theme', themesOpts[0])
    if (!isDoctorat) {
        if (theme && !annee && anneesOpts.length === 1) updateFormData('annee', anneesOpts[0])
        if (annee && !nom && nomsOpts.length === 1) updateFormData('nom', nomsOpts[0])
        if (nom && !parcours && parcoursOpts.length === 1) updateFormData('parcours', parcoursOpts[0])
    }
  }, [etude, theme, annee, nom, isDoctorat, themesOpts, anneesOpts, nomsOpts, parcoursOpts, updateFormData])

  const handleSubmit = (e) => {
      e.preventDefault()
      onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 w-full max-w-lg bg-slate-900/80 backdrop-blur-md p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl">
        <div className="text-center mb-6">
            <GraduationCap className="w-12 h-12 text-philo-primary mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-white">Profil Étudiant</h2>
        </div>

        {!isEditMode && (
        <>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <label className="text-xs font-bold text-gray-400 uppercase block mb-2 flex items-center gap-2"><UserCircle size={14} /> Pseudo</label>
                <input type="text" required autoFocus value={pseudo} onChange={e => updateFormData('pseudo', e.target.value)} className="w-full bg-transparent text-white text-lg font-medium focus:outline-none placeholder-gray-500" placeholder="Ton nom de scène ?" />
            </div>
            <div className="flex gap-4">
                <div className="w-1/2">
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Genre</label>
                    <select required value={sexe} onChange={e => updateFormData('sexe', e.target.value)} className={selectStyle}>
                        <option value="">...</option><option value="Homme">Homme</option><option value="Femme">Femme</option><option value="Autre">Autre</option>
                    </select>
                </div>
                <div className="w-1/2">
                    <label className="text-xs font-bold text-gray-400 uppercase block mb-1">Naissance</label>
                    <input type="date" required value={birthDate} onChange={e => updateFormData('birthDate', e.target.value)} className={`${selectStyle} text-sm`} />
                </div>
            </div>
        </>
        )}

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <label className="text-xs font-bold text-philo-primary uppercase mb-1">Diplôme</label>
            <select required value={etude} onChange={e => { updateFormData('etude', e.target.value); updateFormData('theme', ''); }} className={selectStyle}>
                <option value="">...</option>{etudesOpts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
        </motion.div>

        {etude && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <label className="text-xs font-bold text-philo-secondary uppercase mb-1">Domaine</label>
                <select required value={theme} onChange={e => { updateFormData('theme', e.target.value); updateFormData('annee', ''); }} className={selectStyle}>
                    <option value="">...</option>{themesOpts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </motion.div>
        )}
        
        {theme && !isDoctorat && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <label className="text-xs font-bold text-purple-400 uppercase mb-1">Année</label>
            <select required value={annee} onChange={e => { updateFormData('annee', e.target.value); updateFormData('nom', ''); }} className={selectStyle}>
                <option value="">...</option>{anneesOpts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            </motion.div>
        )}

        {((!isDoctorat && annee) || (isDoctorat && theme)) && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {isDoctorat ? (
            <>
                <label className="text-xs font-bold text-pink-400 uppercase mb-1">Matière de la thèse</label>
                <input type="text" required value={nom} onChange={e => { updateFormData('nom', e.target.value); }} className={selectStyle} placeholder="Ex: Biologie, Droit..." />
            </>
            ) : (
            <>
                <label className="text-xs font-bold text-pink-400 uppercase mb-1">Intitulé</label>
                <select required value={nom} onChange={e => { updateFormData('nom', e.target.value); updateFormData('parcours', ''); }} className={selectStyle}>
                <option value="">...</option>{nomsOpts.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </>
            )}
        </motion.div>
        )}

        {nom && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {isDoctorat ? (
            <>
                <label className="text-xs font-bold text-yellow-400 uppercase mb-1">Nom de la thèse</label>
                <input type="text" required value={parcours} onChange={e => updateFormData('parcours', e.target.value)} className={selectStyle} placeholder="Titre complet de la thèse..." />
            </>
            ) : (
            parcoursOpts.length > 0 && (
                <>
                    <label className="text-xs font-bold text-yellow-400 uppercase mb-1">Option</label>
                    <select value={parcours} onChange={e => updateFormData('parcours', e.target.value)} className={selectStyle}>
                    <option value="">(Facultatif)</option>{parcoursOpts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </>
            )
            )}
        </motion.div>
        )}

        {theme && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
             <label className="text-xs font-bold text-green-400 uppercase mb-1">Campus</label>
             <select required value={lieu} onChange={e => updateFormData('lieu', e.target.value)} className={selectStyle}>
                 <option value="">...</option>{CAMPUS_LIST.map(o => <option key={o} value={o}>{o}</option>)}
             </select>
        </motion.div>}

        <button type="submit" className="w-full py-4 mt-6 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white transition flex items-center justify-center gap-2">
            Choisir mon Avatar <ArrowRight size={18}/>
        </button>
    </form>
  )
}