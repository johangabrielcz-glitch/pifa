'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Club } from '@/lib/types'
import { Newspaper, Zap, MessageSquare, TrendingUp, AlertCircle, Loader2, ChevronLeft, ChevronRight, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { CreateNewsDialog } from './create-news-dialog'

interface NewsArticle {
  id: string
  title: string
  content: string
  category: string
  emoji: string
  summary: string // Usado para el color neón
  created_at: string
  image_url?: string
}

const ITEMS_PER_PAGE = 6

export function NewsTab({ club }: { club: Club }) {
  const [news, setNews] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null)

  useEffect(() => {
    const checkCooldown = () => {
      const lastGen = localStorage.getItem(`pifa_last_ai_news_${club.id}`)
      if (lastGen) {
        const timeDiff = new Date().getTime() - parseInt(lastGen)
        const eightHours = 1000 * 60 * 60 * 8
        if (timeDiff < eightHours) {
          const remainingMs = eightHours - timeDiff
          const hours = Math.floor(remainingMs / (1000 * 60 * 60))
          const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60))
          setCooldownRemaining(`${hours}h ${minutes}m`)
        } else {
          setCooldownRemaining(null)
          localStorage.removeItem(`pifa_last_ai_news_${club.id}`)
        }
      }
    }
    
    checkCooldown()
    const int = setInterval(checkCooldown, 60000)
    return () => clearInterval(int)
  }, [club.id])

  const fetchNews = async () => {
    try {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setNews(data || [])
    } catch (err) {
      console.error('Error fetching news:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateNews = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/news/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubId: club.id, isManual: true })
      })
      
      if (!res.ok) throw new Error('Failed to generate news')
      
      localStorage.setItem(`pifa_last_ai_news_${club.id}`, new Date().getTime().toString())
      setCooldownRemaining('7h 59m')

      await fetchNews()
      setCurrentPage(0)
      toast.success('¡Nueva edición de portada publicada!', {
        icon: '🗞️',
        style: { background: '#0A0A0A', border: '1px solid #00FF85', color: '#00FF85' }
      })
    } catch (err) {
      toast.error('Error al contactar con la rotativa de IA')
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    fetchNews()
  }, [club.id])

  const totalPages = Math.ceil(news.length / ITEMS_PER_PAGE)
  const paginatedNews = useMemo(() => {
    return news.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE)
  }, [news, currentPage])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#00FF85]/5 to-transparent blur-3xl" />
        <Loader2 className="w-10 h-10 text-[#00FF85] animate-spin mb-6 relative z-10" />
        <p className="text-[10px] text-[#00FF85] font-black uppercase tracking-[0.3em] animate-pulse relative z-10">
          Sincronizando con Groq News Network...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-20 max-w-2xl mx-auto">
      {/* Compact Premium Header */}
      <div className="relative group px-1">
        <div className="absolute -inset-1 bg-gradient-to-r from-[#00FF85] to-[#00D1FF] rounded-xl blur opacity-10 group-hover:opacity-20 transition duration-1000" />
        <div className="relative flex items-center justify-between p-4 bg-[#111111]/80 backdrop-blur-xl rounded-xl border border-white/5">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="p-1.5 bg-[#00FF85]/10 rounded-lg border border-[#00FF85]/20">
                <Newspaper className="w-5 h-5 text-[#00FF85]" />
              </div>
              <h2 className="text-xl font-black text-white uppercase italic tracking-tighter leading-none">
                Pifa Daily
              </h2>
            </div>
            <p className="text-[7px] text-[#6A6C6E] font-black uppercase tracking-[0.2em] ml-1">
              Edición Premium • <span className="text-[#00FF85]">IA Powered</span>
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsCreateDialogOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all bg-[#141414] text-[#6A6C6E] hover:text-white border border-white/5 hover:border-white/10"
            >
              <PenLine className="w-3 h-3" />
              Redactar
            </button>

            <button 
              onClick={generateNews}
              disabled={generating || !!cooldownRemaining}
              className={`relative group/btn overflow-hidden flex items-center gap-2 px-4 py-2 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all ${
                (generating || !!cooldownRemaining)
                  ? 'bg-white/5 text-white/20' 
                  : 'bg-white text-black hover:bg-[#00FF85] active:scale-95 shadow-[0_5px_15px_rgba(0,255,133,0.1)]'
              }`}
            >
              {generating ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Zap className="w-3 h-3 fill-current group-hover/btn:animate-bounce" />
              )}
              {generating ? 'Generando...' : cooldownRemaining || 'Nueva Edición'}
            </button>
          </div>
        </div>
      </div>

      {news.length === 0 ? (
        <div className="py-24 text-center px-8 bg-[#0D0D0D] rounded-[40px] border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-[#00FF85]/10 blur-[100px]" />
          <AlertCircle className="w-16 h-16 text-[#00FF85]/20 mx-auto mb-6" />
          <h3 className="text-xl font-black text-white uppercase mb-2">Sin noticias en la rotativa</h3>
          <p className="text-[#6A6C6E] font-bold text-xs uppercase tracking-widest mb-8 max-w-[240px] mx-auto italic">
            El mundo del fútbol está en silencio. ¡Provoca un escándalo ahora!
          </p>
          <button 
            onClick={generateNews}
            className="px-8 py-4 bg-[#00FF85] text-black rounded-2xl text-[12px] font-black uppercase tracking-[0.2em] shadow-[0_20px_40px_rgba(0,255,133,0.2)] hover:scale-105 active:scale-95 transition-all"
          >
            Lanzar Edición Especial
          </button>
        </div>
      ) : (
        <div className="space-y-6 px-2">
          <AnimatePresence mode="popLayout">
            {paginatedNews.map((article, idx) => {
              const neonColor = article.summary || '#00FF85' // Usamos summary como backup para el color
              return (
                <motion.div
                  key={article.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -30 }}
                  transition={{ 
                    duration: 0.5, 
                    delay: idx * 0.1,
                    type: "spring",
                    stiffness: 100 
                  }}
                  className="group relative"
                >
                  {/* Neon Glow Background */}
                  <div 
                    className="absolute -inset-0.5 rounded-[24px] opacity-0 group-hover:opacity-100 transition duration-500 blur-md" 
                    style={{ background: `linear-gradient(45deg, ${neonColor}, transparent, ${neonColor})` }}
                  />
                  
                  <div className="relative bg-[#0F0F0F]/90 backdrop-blur-2xl rounded-[22px] border border-white/[0.05] overflow-hidden">
                    {article.image_url && (
                      <div className="relative w-full aspect-square overflow-hidden border-b border-white/[0.05]">
                        <img 
                          src={article.image_url} 
                          alt={article.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0F0F0F] via-transparent to-transparent opacity-60" />
                      </div>
                    )}
                    <div className="p-0.5">
                      {/* Top Bar with Category */}
                      <div className="flex items-center justify-between p-3 pb-0">
                         <div className="flex items-center gap-1.5">
                            <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: neonColor }} />
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] italic" style={{ color: neonColor }}>
                              {article.category === 'match' ? 'FLASH' : 
                               article.category === 'gossip' ? '🚨 BOMBA' : 'INSIDER'}
                            </span>
                         </div>
                         <span className="text-[7px] text-white/20 font-black tracking-widest uppercase">
                           {new Date(article.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </span>
                      </div>

                      <div className="p-4 pt-2">
                        <h3 className="text-lg md:text-xl font-black text-white leading-none mb-3 uppercase italic tracking-tighter group-hover:translate-x-1 transition-transform duration-300">
                          <span className="text-xl mr-1.5">{article.emoji}</span>
                          {article.title}
                        </h3>
                        
                        <div className="relative">
                          <div className="absolute -left-2 top-0 bottom-0 w-0.5 rounded-full opacity-20" style={{ backgroundColor: neonColor }} />
                          <p className="text-[10px] md:text-xs text-white/60 leading-relaxed font-bold tracking-tight pl-1.5">
                            {article.content}
                          </p>
                        </div>

                        {/* Social Micro-interactions */}
                        <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/[0.03]">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5 group/icon cursor-pointer">
                              <TrendingUp className="w-3 h-3 text-white/20 group-hover/icon:text-[#00FF85]" />
                              <span className="text-[8px] font-black text-white/20 group-hover/icon:text-white transition-colors">{Math.floor(Math.random() * 800) + 200}</span>
                            </div>
                            <div className="flex items-center gap-1.5 group/icon cursor-pointer">
                                <MessageSquare className="w-3 h-3 text-white/20 group-hover/icon:text-blue-400" />
                                <span className="text-[8px] font-black text-white/20 group-hover/icon:text-white transition-colors">{Math.floor(Math.random() * 100) + 12}</span>
                            </div>
                          </div>

                          <div className="flex items-center -space-x-3">
                            {[1, 2, 3].map(i => (
                              <div key={i} className="w-7 h-7 rounded-full border-2 border-[#0F0F0F] bg-[#1a1a1a] flex items-center justify-center text-[10px] font-black text-white/40">
                                {String.fromCharCode(65 + i)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {/* Premium Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-8">
              <button
                disabled={currentPage === 0}
                onClick={() => {
                  setCurrentPage(p => p - 1)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="p-3 rounded-2xl bg-[#141414] border border-white/5 text-white disabled:opacity-20 hover:bg-[#1A1A1A] transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <div className="flex gap-2">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setCurrentPage(i)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      currentPage === i ? 'w-8 bg-[#00FF85]' : 'w-2 bg-white/10'
                    }`}
                  />
                ))}
              </div>

              <button
                disabled={currentPage === totalPages - 1}
                onClick={() => {
                  setCurrentPage(p => p + 1)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className="p-3 rounded-2xl bg-[#141414] border border-white/5 text-white disabled:opacity-20 hover:bg-[#1A1A1A] transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}

      <CreateNewsDialog 
        club={club}
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onSuccess={fetchNews}
      />
    </div>
  )
}
