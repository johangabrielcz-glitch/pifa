'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Player, Club, MarketOffer, MarketHistory } from '@/lib/types'
import { ShoppingCart, History, Search, Filter, DollarSign, ArrowRight, User as UserIcon, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UltimateCard } from '@/components/pifa/ultimate-card'
import { createOffer, handleOfferResponse, buyPlayerDirectly } from '@/lib/market-engine'
import { toast } from 'sonner'
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function MarketPage() {
  const [activeTab, setActiveTab] = useState<'buy' | 'history' | 'my-offers' | 'clubs'>('buy')
  const [playersOnSale, setPlayersOnSale] = useState<Player[]>([])
  const [allClubs, setAllClubs] = useState<Club[]>([])
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [history, setHistory] = useState<MarketHistory[]>([])
  const [myOffers, setMyOffers] = useState<MarketOffer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [currentUserClub, setCurrentUserClub] = useState<Club | null>(null)
  const [selectedClub, setSelectedClub] = useState<Club | null>(null)
  
  // Offer Modal State
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [offerAmount, setOfferAmount] = useState<string>('')

  // Buy Modal State
  const [playerToBuy, setPlayerToBuy] = useState<Player | null>(null)
  const [isBuying, setIsBuying] = useState(false)

  useEffect(() => {
    fetchInitialData()
  }, [])

  async function fetchInitialData() {
    setLoading(true)
    
    // 1. Get current user's club - FIX KEY
    const sessionStr = localStorage.getItem('pifa_auth_session')
    if (sessionStr) {
      const session = JSON.parse(sessionStr)
      setCurrentUserClub(session.club)
    }

    // 2. Fetch players on sale
    const { data: ps } = await supabase
      .from('players')
      .select('*, club:clubs(*)')
      .eq('is_on_sale', true)
      .order('sale_price', { ascending: true })
    if (ps) setPlayersOnSale(ps)

    // 3. Fetch all clubs (excluding mine)
    const { data: clbs } = await supabase
      .from('clubs')
      .select('*, users(full_name)')
      .order('name', { ascending: true })
    if (clbs) setAllClubs(clbs)

    // 4. Fetch all players (for global search and dossiers)
    const { data: allP } = await supabase
      .from('players')
      .select('*, club:clubs(*)')
      .order('name', { ascending: true })
    if (allP) setAllPlayers(allP)

    // 5. Fetch History
    const { data: hist } = await supabase
      .from('market_history')
      .select('*, player:players(*), from_club:clubs!from_club_fk(*), to_club:clubs!to_club_fk(*)')
      .order('created_at', { ascending: false })
      .limit(20)
    if (hist) setHistory(hist)

    // 6. Fetch my offers
    const authSession = JSON.parse(localStorage.getItem('pifa_auth_session') || '{}')
    if (authSession.club) {
      const { data: off } = await supabase
        .from('market_offers')
        .select('*, player:players(*), seller_club:clubs!seller_club_fk(*)')
        .eq('buyer_club_id', authSession.club.id)
        .order('created_at', { ascending: false })
      if (off) setMyOffers(off)
    }

    setLoading(false)
  }

  async function handleBuyDirectly() {
    if (!playerToBuy || !currentUserClub) return
    setIsBuying(true)
    
    try {
      await buyPlayerDirectly(playerToBuy, currentUserClub.id)
      toast.success(`¡Has fichado a ${playerToBuy.name}!`)
      setPlayerToBuy(null)
      fetchInitialData() // Refresh
    } catch (err: any) {
      toast.error(err.message || 'Error en la compra')
    } finally {
      setIsBuying(false)
    }
  }

  async function makeOffer() {
    if (!selectedPlayer || !currentUserClub) return
    if (!offerAmount || isNaN(Number(offerAmount)) || Number(offerAmount) <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    if (Number(offerAmount) > currentUserClub.budget) {
      toast.error('No tienes presupuesto suficiente')
      return
    }

    try {
      await createOffer(selectedPlayer, currentUserClub.id, Number(offerAmount))
      toast.success('Oferta enviada!')
      setSelectedPlayer(null)
      setOfferAmount('')
      fetchInitialData() // refresh
    } catch (err: any) {
      toast.error(err.message || 'Error al enviar oferta')
    }
  }

  async function cancelMyOffer(offerId: string) {
    try {
      await handleOfferResponse(offerId, 'cancel')
      toast.success('Oferta anulada')
      fetchInitialData() // refresh
    } catch (err: any) {
      toast.error('Error al anular oferta')
    }
  }

  const filteredPlayers = playersOnSale.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.position.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen pb-20 pt-4 animate-fade-in">
      <div className="px-6 mb-8">
        <h1 className="text-2xl font-black text-white uppercase tracking-tighter mb-2 flex items-center gap-3">
          <ShoppingCart className="w-8 h-8 text-[#00FF85]" />
          PIFA Market
        </h1>
        <p className="text-[#6A6C6E] text-xs font-bold uppercase tracking-widest">Negocia, ficha y construye tu equipo de ensueño</p>
      </div>

      {/* Tabs */}
      <div className="px-6 mb-8">
        <div className="flex bg-[#141414] p-1 rounded-2xl border border-[#202020]/50 max-w-md">
          <button
            onClick={() => setActiveTab('buy')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'buy' ? 'bg-[#00FF85] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,133,0.2)]' : 'text-[#6A6C6E] hover:text-white'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            Mercado
          </button>
          <button
            onClick={() => setActiveTab('my-offers')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'my-offers' ? 'bg-[#00FF85] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,133,0.2)]' : 'text-[#6A6C6E] hover:text-white'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Mis Ofertas
          </button>
          <button
            onClick={() => setActiveTab('clubs')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'clubs' ? 'bg-[#00FF85] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,133,0.2)]' : 'text-[#6A6C6E] hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Clubes
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'history' ? 'bg-[#00FF85] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,133,0.2)]' : 'text-[#6A6C6E] hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Historial
          </button>
        </div>
      </div>

      <div className="px-6">
        <div>
          {activeTab === 'buy' && (
            <div className="space-y-6">
              {/* Search & Filter */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6A6C6E]" />
                  <Input 
                    placeholder="Buscar en el mercado (en venta)..." 
                    className="bg-[#141414] border-[#202020] pl-11 h-12 text-sm text-white rounded-xl focus:ring-[#00FF85]/20 focus:border-[#00FF85]"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                
                {/* Global Search Bar */}
                <div className="relative flex-1">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6A6C6E]" />
                  <Input 
                    placeholder="Búsqueda Global (cualquier jugador)..." 
                    className="bg-[#141414]/40 border-[#00FF85]/20 pl-11 h-12 text-sm text-white rounded-xl focus:ring-[#00FF85]/20 focus:border-[#00FF85]"
                    value={globalSearch}
                    onChange={(e) => setGlobalSearch(e.target.value)}
                  />
                  {globalSearch.length > 1 && (
                    <div className="absolute top-14 left-0 right-0 z-50 bg-[#141414] border border-[#202020] rounded-2xl p-2 shadow-2xl max-h-60 overflow-y-auto">
                      {allPlayers
                        .filter(p => 
                          (p.name.toLowerCase().includes(globalSearch.toLowerCase()) || 
                          p.club?.name.toLowerCase().includes(globalSearch.toLowerCase())) &&
                          p.club_id !== currentUserClub?.id
                        )
                        .slice(0, 5)
                        .map(p => {
                          const myActiveOffer = myOffers.find(o => o.player_id === p.id && (o.status === 'pending' || o.status === 'countered'))
                          
                          return (
                            <button
                              key={p.id}
                              onClick={() => {
                                if (!myActiveOffer) {
                                  setSelectedPlayer(p)
                                  setGlobalSearch('')
                                }
                              }}
                              disabled={!!myActiveOffer}
                              className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all group ${
                                myActiveOffer ? 'opacity-60 cursor-not-allowed bg-white/5' : 'hover:bg-white/5'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[#0A0A0A] flex items-center justify-center border border-[#202020]">
                                  <UserIcon className={`w-4 h-4 ${myActiveOffer ? 'text-blue-400' : 'text-[#00FF85]'}`} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-[11px] font-black text-white uppercase">{p.name}</p>
                                    {myActiveOffer && (
                                      <span className="text-[7px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">
                                        En Negociación
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-[#6A6C6E] font-bold uppercase">{p.club?.name || 'Agente Libre'}</p>
                                </div>
                              </div>
                              {!myActiveOffer && <ArrowRight className="w-3.5 h-3.5 text-[#00FF85] opacity-0 group-hover:opacity-100 transition-opacity" />}
                            </button>
                          )
                        })
                      }
                      {allPlayers.filter(p => p.name.toLowerCase().includes(globalSearch.toLowerCase())).length === 0 && (
                        <p className="text-[10px] text-[#6A6C6E] p-4 text-center">No se encontraron jugadores</p>
                      ) }
                    </div>
                  )}
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-2 gap-4">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-64 bg-[#141414] rounded-2xl animate-pulse border border-[#202020]" />
                  ))}
                </div>
              ) : filteredPlayers.length === 0 ? (
                <div className="py-20 text-center bg-[#141414] rounded-3xl border border-[#202020] border-dashed">
                  <ShoppingCart className="w-12 h-12 text-[#2D2D2D] mx-auto mb-4 opacity-20" />
                  <p className="text-[#6A6C6E] font-bold uppercase tracking-widest text-xs">No hay jugadores en venta en este momento</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4 stagger">
                  {filteredPlayers.map((player) => {
                    const isMine = player.club_id === currentUserClub?.id
                    const myActiveOffer = myOffers.find(o => o.player_id === player.id && (o.status === 'pending' || o.status === 'countered'))
                    
                    return (
                      <div 
                        key={player.id} 
                        className={`relative group p-2 rounded-[40px] transition-all duration-500 ${
                          isMine 
                            ? 'bg-[#00FF85]/5 border border-[#00FF85]/20 shadow-[0_0_30px_rgba(0,255,133,0.1)]' 
                            : myActiveOffer
                            ? 'bg-red-500/5 border border-red-500/10'
                            : 'bg-transparent'
                        }`}
                      >
                        <UltimateCard 
                          player={player} 
                          showPrice={true}
                        />
                        {!isMine && (
                             myActiveOffer ? (
                              <Button 
                                className="w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500 hover:text-white text-red-500 text-[10px] font-black uppercase tracking-widest h-10 transition-all duration-300 rounded-2xl"
                                onClick={() => cancelMyOffer(myActiveOffer.id)}
                              >
                                Anular Oferta
                              </Button>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <Button 
                                  className="w-full bg-[#141414] border border-[#202020] hover:bg-[#00FF85] hover:text-[#0A0A0A] hover:border-[#00FF85] text-[#00FF85] text-[10px] font-black uppercase tracking-widest h-10 transition-all duration-300 rounded-2xl"
                                  onClick={() => setSelectedPlayer(player)}
                                >
                                  Hacer Oferta
                                </Button>
                                {player.is_on_sale && player.sale_price && (
                                  <Button 
                                    className="w-full bg-[#00FF85] text-[#0A0A0A] text-[10px] font-black uppercase tracking-widest h-10 transition-all duration-300 rounded-2xl shadow-[0_5px_15px_rgba(0,255,133,0.2)]"
                                    onClick={() => setPlayerToBuy(player)}
                                  >
                                    Compra Directa
                                  </Button>
                                )}
                              </div>
                            )
                        )}
                        {isMine && (
                          <div className="mt-3 text-center">
                            <span className="text-[9px] font-black text-[#00FF85] uppercase tracking-widest bg-[#00FF85]/10 px-4 py-2 rounded-full border border-[#00FF85]/20 block mx-2">
                              TU JUGADOR
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'my-offers' && (
            <div className="space-y-4">
              {myOffers.length === 0 ? (
                <div className="py-20 text-center bg-[#141414] rounded-3xl border border-[#202020] border-dashed">
                  <DollarSign className="w-12 h-12 text-[#2D2D2D] mx-auto mb-4 opacity-20" />
                  <p className="text-[#6A6C6E] font-bold uppercase tracking-widest text-xs">Aún no has emitido ofertas</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {myOffers.map((offer) => (
                    <div key={offer.id} className="bg-[#141414] border border-[#202020] p-4 rounded-2xl flex items-center justify-between group hover:border-[#00FF85]/30 transition-all duration-300">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-[#0A0A0A] flex items-center justify-center border border-[#202020]">
                          <UserIcon className="w-5 h-5 text-[#00FF85]" />
                        </div>
                        <div>
                          <h4 className="text-[11px] font-black text-white uppercase tracking-wider">{offer.player?.name}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-[#00FF85] font-black">${offer.amount.toLocaleString()}</span>
                            <span className="text-[14px] text-[#2D2D2D] font-black">•</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest ${
                              offer.status === 'pending' ? 'text-yellow-500' :
                              offer.status === 'accepted' ? 'text-[#00FF85]' :
                              offer.status === 'rejected' ? 'text-red-500' :
                              offer.status === 'countered' ? 'text-blue-500' : 'text-[#6A6C6E]'
                            }`}>
                              {offer.status === 'pending' ? 'Pendiente' :
                               offer.status === 'accepted' ? 'Aceptada' :
                               offer.status === 'rejected' ? 'Rechazada' :
                               offer.status === 'countered' ? 'Contraofertada' : 'Cancelada'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {(offer.status === 'pending' || offer.status === 'countered') && (
                        <Button 
                          variant="ghost" 
                          className="text-red-500/50 hover:text-red-500 hover:bg-red-500/5 text-[9px] font-black"
                          onClick={() => cancelMyOffer(offer.id)}
                        >
                          ANULAR
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'clubs' && (
            <div className="space-y-6">
              {!selectedClub ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6A6C6E]" />
                    <Input 
                      placeholder="Buscar club..." 
                      className="bg-[#141414] border-[#202020] pl-11 h-12 text-sm text-white rounded-xl focus:ring-[#00FF85]/20"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {allClubs
                      .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) && c.id !== currentUserClub?.id)
                      .map(club => (
                        <button
                          key={club.id}
                          onClick={() => {
                            setSelectedClub(club)
                            setSearch('')
                          }}
                          className="group relative bg-[#141414] border border-[#202020] p-4 rounded-2xl text-left hover:border-[#00FF85]/30 transition-all duration-300 overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 w-24 h-24 bg-[#00FF85]/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-[#00FF85]/10 transition-colors" />
                          <div className="flex flex-col items-center gap-3 relative z-10 text-center">
                            <div className="w-12 h-12 rounded-xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center p-2 shadow-inner">
                              {club.shield_url ? (
                                <img src={club.shield_url} alt="" className="w-full h-full object-contain" />
                              ) : (
                                <Shield className="w-6 h-6 text-[#6A6C6E]" />
                              )}
                            </div>
                            <div>
                              <h3 className="text-[11px] font-black text-white uppercase tracking-tighter mb-1 line-clamp-1">{club.name}</h3>
                              <p className="text-[8px] text-[#00FF85] font-black uppercase tracking-wider">
                                {club.users?.[0]?.full_name?.split(' ')[0] || 'DT PIFA'}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  {/* Selected Club Header */}
                  <div className="flex items-center justify-between bg-[#141414] border border-[#202020] p-6 rounded-[32px]">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-2xl bg-[#0A0A0A] p-3 border border-[#202020]">
                        <img src={selectedClub.shield_url} alt="" className="w-full h-full object-contain" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">{selectedClub.name}</h2>
                        <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-[0.2em] mt-1">Plantilla Actual</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      onClick={() => setSelectedClub(null)}
                      className="text-[#6A6C6E] hover:text-white uppercase text-[10px] font-black"
                    >
                      Volver a Clubes
                    </Button>
                  </div>

                  {/* Player Roster for Selected Club */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {allPlayers
                      .filter(p => p.club_id === selectedClub.id)
                      .map(player => {
                        const myActiveOffer = myOffers.find(o => o.player_id === player.id && (o.status === 'pending' || o.status === 'countered'))
                        
                        return (
                          <div key={player.id} className="relative group p-1">
                            <UltimateCard player={player} showPrice={player.is_on_sale} />
                            <div className="mt-3 px-1">
                              {myActiveOffer ? (
                                <Button 
                                  className="w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500 hover:text-white text-red-500 text-[8px] font-black uppercase tracking-widest h-8 transition-all duration-300 rounded-xl"
                                  onClick={() => cancelMyOffer(myActiveOffer.id)}
                                >
                                  Anular Oferta
                                </Button>
                              ) : (
                                <Button 
                                  className="w-full bg-[#141414]/80 backdrop-blur-md border border-white/5 hover:bg-[#00FF85] hover:text-[#0A0A0A] text-[#00FF85] text-[8px] font-black uppercase tracking-widest h-8 transition-all duration-300 rounded-xl"
                                  onClick={() => setSelectedPlayer(player)}
                                >
                                  Ofertar
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {history.length === 0 ? (
                <div className="py-20 text-center bg-[#141414] rounded-3xl border border-[#202020] border-dashed">
                  <History className="w-12 h-12 text-[#2D2D2D] mx-auto mb-4 opacity-20" />
                  <p className="text-[#6A6C6E] font-bold uppercase tracking-widest text-xs">No hay registros de traspasos</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => (
                    <div key={item.id} className="relative bg-gradient-to-r from-[#141414] to-[#0A0A0A] border border-[#202020] p-6 rounded-[32px] overflow-hidden group hover:border-[#00FF85]/30 transition-all duration-500 shadow-xl">
                      {/* Decorative Background Glow */}
                      <div className="absolute -right-20 -bottom-20 w-40 h-40 bg-[#00FF85]/5 rounded-full blur-[80px] group-hover:bg-[#00FF85]/10 transition-colors duration-700" />
                      
                      <div className="absolute top-4 right-6">
                        <span className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest opacity-50">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-4 relative z-10">
                        {/* Seller Club */}
                        <div className="flex flex-col items-center gap-3 w-24">
                          <div className="w-14 h-14 rounded-2xl bg-[#0A0A0A] border border-[#202020] flex items-center justify-center p-2.5 shadow-inner group-hover:scale-105 transition-transform duration-500">
                            {item.from_club?.shield_url ? (
                              <img src={item.from_club.shield_url} alt="" className="w-full h-full object-contain drop-shadow-lg" />
                            ) : (
                              <Shield className="w-6 h-6 text-[#6A6C6E]" />
                            )}
                          </div>
                          <span className="text-[9px] font-black text-[#6A6C6E] uppercase tracking-tighter text-center leading-tight h-6 flex items-center">
                            {item.from_club?.name}
                          </span>
                        </div>
                        
                        {/* Transfer Details */}
                        <div className="flex-1 flex flex-col items-center gap-2">
                          <div className="flex items-center gap-4 w-full">
                            <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-[#202020] to-[#00FF85]/30" />
                            <div className="w-10 h-10 rounded-full bg-[#00FF85]/5 border border-[#00FF85]/20 flex items-center justify-center">
                               <ArrowRight className="w-5 h-5 text-[#00FF85] animate-pulse-glow" />
                            </div>
                            <div className="h-[1px] flex-1 bg-gradient-to-r from-[#00FF85]/30 via-[#202020] to-transparent" />
                          </div>
                          <div className="text-center mt-1">
                            <span className="text-sm font-black text-white uppercase tracking-tighter block mb-1">{item.player?.name}</span>
                            <div className="inline-block py-1 px-4 bg-[#00FF85] rounded-full shadow-[0_5px_15px_rgba(0,255,133,0.2)]">
                              <span className="text-[11px] font-black text-[#0A0A0A]">${item.amount.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Buyer Club */}
                        <div className="flex flex-col items-center gap-3 w-24">
                          <div className="w-14 h-14 rounded-2xl bg-[#0A0A0A] border border-[#00FF85]/30 flex items-center justify-center p-2.5 shadow-[0_0_20px_rgba(0,255,133,0.1)] group-hover:scale-105 transition-transform duration-500">
                            {item.to_club?.shield_url ? (
                              <img src={item.to_club.shield_url} alt="" className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(0,255,133,0.3)]" />
                            ) : (
                              <Shield className="w-6 h-6 text-[#00FF85]" />
                            )}
                          </div>
                          <span className="text-[9px] font-black text-[#00FF85] uppercase tracking-tighter text-center leading-tight h-6 flex items-center">
                            {item.to_club?.name}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Offer Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 sm:p-0">
          <div className="absolute inset-0 bg-[#000000]/90 backdrop-blur-md" onClick={() => setSelectedPlayer(null)} />
          <div className="relative w-full max-w-md bg-[#0A0A0A] border border-[#202020] rounded-[40px] p-8 shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-20 h-20 mx-auto bg-[#141414] rounded-3xl flex items-center justify-center border border-[#202020] mb-6 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                <Shield className="w-10 h-10 text-[#00FF85]" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">OFERTA POR {selectedPlayer.name}</h3>
              <p className="text-[#6A6C6E] text-[10px] font-bold uppercase tracking-[0.2em]">Establece el monto de tu propuesta</p>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest ml-1">Monto de la Oferta ($)</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#00FF85]" />
                  <Input 
                    type="number" 
                    placeholder="Ej: 5000000" 
                    className="bg-[#141414] border-[#202020] h-16 pl-12 text-xl font-black text-white rounded-2xl focus:ring-[#00FF85]/20 focus:border-[#00FF85]"
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-[9px] font-bold text-[#6A6C6E] uppercase">Presupuesto Disponible:</span>
                  <span className="text-[10px] font-black text-[#00FF85]">${currentUserClub?.budget.toLocaleString()}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <Button 
                  variant="ghost" 
                  className="h-14 rounded-2xl text-[11px] font-black uppercase tracking-widest text-[#6A6C6E] hover:bg-[#141414]"
                  onClick={() => setSelectedPlayer(null)}
                >
                  Cancelar
                </Button>
                <Button 
                  className="h-14 rounded-2xl bg-[#00FF85] text-[#0A0A0A] text-[11px] font-black uppercase tracking-widest shadow-[0_10px_30px_rgba(0,255,133,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                  onClick={makeOffer}
                >
                  Enviar Oferta
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Buy Confirmation Modal */}
      <AlertDialog open={!!playerToBuy} onOpenChange={(open) => !open && setPlayerToBuy(null)}>
        <AlertDialogContent className="bg-[#0A0A0A] border border-[#202020] rounded-[32px] p-8 max-w-md">
          <AlertDialogHeader className="text-center">
            <div className="w-20 h-20 mx-auto bg-[#00FF85]/10 rounded-3xl flex items-center justify-center border border-[#00FF85]/20 mb-6">
              <ShoppingCart className="w-10 h-10 text-[#00FF85]" />
            </div>
            <AlertDialogTitle className="text-2xl font-black text-white uppercase tracking-tighter">
              ¿Confirmar Traspaso?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#6A6C6E] text-xs font-bold uppercase tracking-widest mt-2 leading-relaxed">
              Estás por comprar directamente a <span className="text-white">{playerToBuy?.name}</span> por <span className="text-[#00FF85] font-black">${playerToBuy?.sale_price?.toLocaleString()}</span>. 
              <br/><br/>
              Esta acción es irreversible y el dinero se descontará de tu presupuesto de inmediato.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="grid grid-cols-2 gap-4 mt-8 sm:space-x-0">
            <AlertDialogCancel className="h-14 rounded-2xl bg-[#141414] border-[#202020] text-[#6A6C6E] hover:bg-[#202020] hover:text-white font-black uppercase text-[10px] tracking-widest">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBuyDirectly}
              disabled={isBuying}
              className="h-14 rounded-2xl bg-[#00FF85] text-[#0A0A0A] hover:bg-[#00cc6a] font-black uppercase text-[10px] tracking-widest shadow-[0_10px_30px_rgba(0,255,133,0.3)]"
            >
              {isBuying ? 'Procesando...' : 'Confirmar Compra'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
