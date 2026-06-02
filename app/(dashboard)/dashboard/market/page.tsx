'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Player, Club, MarketOffer, MarketHistory } from '@/lib/types'
import { ShoppingCart, History, Search, Filter, DollarSign, ArrowRight, User as UserIcon, Shield, Lock, UserPlus, Loader2, FilePlus, ClipboardList, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UltimateCard } from '@/components/pifa/ultimate-card'
import { ImageUpload } from '@/components/pifa/image-upload'
import { createOffer, handleOfferResponse, buyPlayerDirectly } from '@/lib/market-engine'
import { isTransferWindowOpen, signFreeAgent } from '@/lib/contract-engine'
import { submitPlayerRequest } from '@/lib/player-request-engine'
import type { PlayerCreationRequest } from '@/lib/types'
import { toast } from 'sonner'
import { ClauseChatDrawer } from '@/components/pifa/clause-chat-drawer'

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF']
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
  const [activeTab, setActiveTab] = useState<'buy' | 'history' | 'my-offers' | 'clubs' | 'free-agents' | 'propose'>('buy')
  const [playersOnSale, setPlayersOnSale] = useState<Player[]>([])
  const [freeAgents, setFreeAgents] = useState<Player[]>([])
  const [transferWindowStatus, setTransferWindowStatus] = useState<boolean | null>(null)
  const [allClubs, setAllClubs] = useState<Club[]>([])
  const [selectedClubPlayers, setSelectedClubPlayers] = useState<Player[]>([])
  const [globalSearchResults, setGlobalSearchResults] = useState<Player[]>([])
  const [history, setHistory] = useState<MarketHistory[]>([])
  const [myOffers, setMyOffers] = useState<MarketOffer[]>([])
  const [myNegotiations, setMyNegotiations] = useState<any[]>([])
  const [myReleases, setMyReleases] = useState<string[]>([]) // Array of player IDs
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [currentUserClub, setCurrentUserClub] = useState<Club | null>(null)
  const [selectedClub, setSelectedClub] = useState<Club | null>(null)
  const [historyPage, setHistoryPage] = useState(0)
  const [rosterPage, setRosterPage] = useState(0)
  const itemsPerHistoryPage = 3
  const itemsPerRosterPage = 4
  
  // Offer Modal State
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [offerAmount, setOfferAmount] = useState<string>('')

  // Buy Modal State
  const [playerToBuy, setPlayerToBuy] = useState<Player | null>(null)
  const [isBuying, setIsBuying] = useState(false)
  
  // Clause Negotiation State
  const [isClauseChatOpen, setIsClauseChatOpen] = useState(false)
  const [playerForClause, setPlayerForClause] = useState<Player | null>(null)

  // Free Agent States
  const [freeAgentToSign, setFreeAgentToSign] = useState<Player | null>(null)
  const [signingFreeAgent, setSigningFreeAgent] = useState(false)

  // Player Creation Request (propose) — DT-side
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [myRequests, setMyRequests] = useState<PlayerCreationRequest[]>([])
  const [reqName, setReqName] = useState('')
  const [reqPosition, setReqPosition] = useState('')
  const [reqNumber, setReqNumber] = useState('')
  const [reqAge, setReqAge] = useState('')
  const [reqNationality, setReqNationality] = useState('')
  const [reqPhoto, setReqPhoto] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)

  useEffect(() => {
    fetchInitialData()
  }, [])

  async function fetchInitialData() {
    setLoading(true)
    
    try {
      const sessionStr = localStorage.getItem('pifa_auth_session')
      const authSession = JSON.parse(sessionStr || '{}')
      if (authSession.club) setCurrentUserClub(authSession.club)
      if (authSession.user?.id) setCurrentUserId(authSession.user.id)

      // Fire all initial queries in parallel, each setting state independently
      // so the market page becomes usable as each section's data arrives.
      // Limits + specific selects to cap payload.

      supabase.from('players')
        .select('id, name, position, number, photo_url, salary, club_id, is_on_sale, sale_price, release_clause, contract_status, club:clubs(id, name, shield_url)')
        .eq('is_on_sale', true)
        .order('sale_price', { ascending: true })
        .limit(100)
        .then(({ data }) => { if (data) setPlayersOnSale(data as any) })

      supabase.from('clubs')
        .select('id, name, shield_url, budget, users(full_name)')
        .order('name', { ascending: true })
        .then(({ data }) => { if (data) setAllClubs(data as any) })

      supabase.from('market_history')
        .select('*, player:players(id, name, position, photo_url), from_club:clubs!from_club_fk(id, name, shield_url), to_club:clubs!to_club_fk(id, name, shield_url)')
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data }) => { if (data) setHistory(data as any) })

      if (authSession.club) {
        supabase.from('market_offers')
          .select('*, player:players(id, name, position, photo_url), seller_club:clubs!seller_club_fk(id, name, shield_url)')
          .eq('buyer_club_id', authSession.club.id)
          .order('created_at', { ascending: false })
          .then(({ data }) => { if (data) setMyOffers(data as any) })

        supabase.from('clause_negotiations')
          .select('*')
          .eq('buyer_club_id', authSession.club.id)
          .then(({ data }) => { if (data) setMyNegotiations(data as any) })
      }

      // Transfer window status (memoized in contract-engine)
      isTransferWindowOpen()
        .then(setTransferWindowStatus)
        .catch(() => setTransferWindowStatus(false))

      // Free agents
      supabase.from('players')
        .select('id, name, position, number, photo_url, salary, club_id, contract_status, club:clubs(id, name, shield_url)')
        .eq('contract_status', 'free_agent')
        .order('name', { ascending: true })
        .limit(50)
        .then(({ data }) => { if (data) setFreeAgents(data as any) })

      // My recent releases (block re-signing within same season)
      if (authSession.club) {
        supabase.from('seasons').select('created_at').eq('status', 'active').maybeSingle()
          .then(({ data: season }) => {
            if (!season) return
            return supabase
              .from('market_history')
              .select('player_id')
              .eq('from_club_id', authSession.club.id)
              .eq('type', 'release')
              .gte('created_at', (season as any).created_at)
          })
          .then(res => {
            if (res?.data) setMyReleases(res.data.map((r: any) => r.player_id))
          })
          .catch(() => {})
      }

      // Mark loading false immediately — each section shows its own placeholder
      // while its data is still in flight.
      setLoading(false)
    } catch (err) {
      console.error('Error fetching market data:', err)
      setLoading(false)
    }
  }

  // Carga bajo demanda de la plantilla de un club seleccionado
  useEffect(() => {
    async function fetchClubRoster() {
      if (!selectedClub) {
        setSelectedClubPlayers([])
        return
      }
      
      const { data } = await supabase
        .from('players')
        .select('*, club:clubs(*)')
        .eq('club_id', selectedClub.id)
        .order('name', { ascending: true })
      
      if (data) setSelectedClubPlayers(data)
    }
    fetchClubRoster()
  }, [selectedClub])

  // Búsqueda Global: Carga desde DB con Debounce (Optimizado)
  useEffect(() => {
    if (globalSearch.length < 2) {
      setGlobalSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('players')
        .select('*, club:clubs(*)')
        .ilike('name', `%${globalSearch}%`)
        .neq('club_id', currentUserClub?.id)
        .limit(10)
      
      if (data) setGlobalSearchResults(data)
    }, 300)

    return () => clearTimeout(timer)
  }, [globalSearch, currentUserClub])

  async function handleBuyDirectly() {
    if (!playerToBuy || !currentUserClub) return
    if (!transferWindowStatus) {
      toast.error('La ventana de fichajes está cerrada')
      setPlayerToBuy(null)
      return
    }
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

  const handleSignFreeAgent = async () => {
    if (!freeAgentToSign || !currentUserClub) return
    setSigningFreeAgent(true)
    try {
      const result = await signFreeAgent(
        freeAgentToSign.id,
        currentUserClub.id,
        freeAgentToSign.salary || 25000,
        2, // 2 temporadas fijas
        'rotation' // rol rotación fijo
      )

      if (result.success) {
        toast.success(`¡Fichaje completado! ${freeAgentToSign.name} se ha unido al club. Se descontó el primer salario de tu presupuesto.`)
        setFreeAgentToSign(null)
        fetchInitialData()
      } else {
        toast.error(result.error || 'Error al fichar agente libre')
      }
    } catch (err: any) {
      toast.error('Error de red al fichar')
    } finally {
      setSigningFreeAgent(false)
    }
  }

  async function makeOffer() {
    if (!selectedPlayer || !currentUserClub) return
    if (!transferWindowStatus) {
      toast.error('La ventana de fichajes está cerrada')
      setSelectedPlayer(null)
      return
    }
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

  async function loadMyPlayerRequests(clubId: string) {
    const { data } = await supabase
      .from('player_creation_requests')
      .select('*')
      .eq('club_id', clubId)
      .order('created_at', { ascending: false })
      .limit(50)
    setMyRequests((data as PlayerCreationRequest[]) || [])
  }

  useEffect(() => {
    if (activeTab !== 'propose' || !currentUserClub?.id) return
    loadMyPlayerRequests(currentUserClub.id)
    const channel = supabase
      .channel(`pcr_dt_${currentUserClub.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'player_creation_requests', filter: `club_id=eq.${currentUserClub.id}` },
        () => loadMyPlayerRequests(currentUserClub.id)
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeTab, currentUserClub?.id])

  async function handleSubmitRequest() {
    if (!currentUserClub?.id) { toast.error('Tu sesión no tiene club asignado'); return }
    if (!reqName.trim()) { toast.error('Ingresa el nombre del jugador'); return }
    if (!reqPosition) { toast.error('Selecciona una posición'); return }
    setSubmittingRequest(true)
    try {
      const res = await submitPlayerRequest({
        clubId: currentUserClub.id,
        submittedBy: currentUserId,
        name: reqName.trim(),
        position: reqPosition,
        number: reqNumber ? parseInt(reqNumber) : null,
        age: reqAge ? parseInt(reqAge) : null,
        nationality: reqNationality.trim() || null,
        photoUrl: reqPhoto.trim() || null,
      })
      if (!res.success) { toast.error(res.error || 'Error al enviar la solicitud'); return }
      toast.success('Solicitud enviada. El admin la revisará pronto.')
      setReqName(''); setReqPosition(''); setReqNumber(''); setReqAge(''); setReqNationality(''); setReqPhoto('')
      loadMyPlayerRequests(currentUserClub.id)
    } finally {
      setSubmittingRequest(false)
    }
  }

  const filteredPlayers = useMemo(() => {
    return playersOnSale.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.position.toLowerCase().includes(search.toLowerCase())
    )
  }, [playersOnSale, search])

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
            onClick={() => setActiveTab('free-agents')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'free-agents' ? 'bg-[#00FF85] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,133,0.2)]' : 'text-[#6A6C6E] hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Libres
          </button>
          <button
            onClick={() => setActiveTab('propose')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'propose' ? 'bg-[#00FF85] text-[#0A0A0A] shadow-[0_0_20px_rgba(0,255,133,0.2)]' : 'text-[#6A6C6E] hover:text-white'
            }`}
          >
            <FilePlus className="w-3.5 h-3.5" />
            Proponer
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

      {/* Transfer Window Closed Warning */}
      {transferWindowStatus === false && activeTab !== 'free-agents' && activeTab !== 'history' && activeTab !== 'propose' && (
        <div className="px-6 mb-6">
          <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 text-center">
            <Lock className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <h3 className="text-sm font-black text-red-400 uppercase tracking-wider mb-1">Mercado Cerrado</h3>
            <p className="text-[10px] text-red-400/60 font-bold uppercase tracking-widest">
              La ventana de fichajes está cerrada. No se pueden realizar ofertas ni compras.
            </p>
          </div>
        </div>
      )}

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
                      {globalSearchResults.length === 0 ? (
                        <div className="p-4 text-center text-[10px] text-[#6A6C6E] uppercase font-bold tracking-widest">
                          Sin coincidencias
                        </div>
                      ) : (
                        globalSearchResults.map(p => {
                          const myActiveOffer = myOffers.find(o => o.player_id === p.id && (o.status === 'pending' || o.status === 'countered'))
                          
                          return (
                            <button
                              key={p.id}
                              onClick={() => {
                                if (!myActiveOffer && transferWindowStatus) {
                                  setSelectedPlayer(p)
                                  setGlobalSearch('')
                                }
                              }}
                              disabled={!!myActiveOffer || !transferWindowStatus}
                              className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all group ${
                                (myActiveOffer || !transferWindowStatus) ? 'opacity-60 cursor-not-allowed bg-white/5' : 'hover:bg-white/5'
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
                                    {!transferWindowStatus && !myActiveOffer && (
                                      <span className="text-[7px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-md font-black uppercase tracking-widest">
                                        Mercado Cerrado
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[9px] text-[#6A6C6E] font-bold uppercase">{p.club?.name || 'Agente Libre'}</p>
                                </div>
                              </div>
                              {!myActiveOffer && transferWindowStatus && <ArrowRight className="w-3.5 h-3.5 text-[#00FF85] opacity-0 group-hover:opacity-100 transition-opacity" />}
                            </button>
                          )
                        })
                      )}
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
                                {transferWindowStatus ? (
                                  <>
                                    <Button 
                                      className="w-full bg-[#141414] border border-[#202020] hover:bg-[#00FF85] hover:text-[#0A0A0A] hover:border-[#00FF85] text-[#00FF85] text-[10px] font-black uppercase tracking-widest h-10 transition-all duration-300 rounded-2xl"
                                      onClick={() => setSelectedPlayer(player)}
                                    >
                                      Hacer Oferta
                                    </Button>
                                    {player.is_on_sale && player.sale_price && (
                                      <Button 
                                        className={`w-full text-[10px] font-black uppercase tracking-widest h-10 transition-all duration-300 rounded-2xl ${
                                          (currentUserClub?.budget || 0) < player.sale_price
                                            ? 'bg-red-500/10 border border-red-500/20 text-red-500 cursor-not-allowed opacity-50'
                                            : 'bg-[#00FF85] text-[#0A0A0A] border-[#00FF85] shadow-[0_5px_15px_rgba(0,255,133,0.2)]'
                                        }`}
                                        disabled={(currentUserClub?.budget || 0) < player.sale_price}
                                        onClick={() => setPlayerToBuy(player)}
                                      >
                                        {(currentUserClub?.budget || 0) < player.sale_price ? 'Faltan Fondos' : 'Compra Directa'}
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-[8px] font-bold text-red-400/60 text-center uppercase tracking-widest py-2">🔒 Mercado cerrado</p>
                                )}
                                {player.is_one_club_man ? (
                                  <div className="w-full py-2 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[8px] font-black text-amber-500 text-center uppercase tracking-[0.2em]">
                                    🛡️ One Club Man (Innegociable)
                                  </div>
                                ) : (
                                    <Button 
                                      className={`w-full text-[10px] font-black uppercase tracking-widest h-10 transition-all duration-300 rounded-2xl ${
                                        (!transferWindowStatus || !!myNegotiations.find(n => n.player_id === player.id && n.status === 'blocked'))
                                          ? 'bg-red-500/10 border border-red-500/20 text-red-500 cursor-not-allowed'
                                          : (currentUserClub?.budget || 0) < (player.release_clause || 700000)
                                          ? 'bg-red-500/5 border border-red-500/10 text-red-500/60 cursor-not-allowed opacity-40'
                                          : 'bg-white/5 border border-white/10 hover:bg-white/10 text-white'
                                      }`}
                                      disabled={!transferWindowStatus || !!myNegotiations.find(n => n.player_id === player.id && n.status === 'blocked') || (currentUserClub?.budget || 0) < (player.release_clause || 700000)}
                                      onClick={() => {
                                        setPlayerForClause(player)
                                        setIsClauseChatOpen(true)
                                      }}
                                    >
                                      {!transferWindowStatus ? '🔒 Mercado Cerrado' : myNegotiations.find(n => n.player_id === player.id && n.status === 'blocked') 
                                        ? '🚫 Negociación Bloqueada' 
                                        : (currentUserClub?.budget || 0) < (player.release_clause || 700000)
                                        ? 'Presupuesto Insuficiente'
                                        : 'Pagar Cláusula'}
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
                            setRosterPage(0)
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
                  <div className="space-y-4">
                    {(() => {
                      const filteredRoster = selectedClubPlayers
                      const totalPages = Math.ceil(filteredRoster.length / itemsPerRosterPage)
                      const currentPage = Math.min(rosterPage, totalPages - 1)
                      const paginatedRoster = filteredRoster.slice(currentPage * itemsPerRosterPage, (currentPage + 1) * itemsPerRosterPage)

                      return (
                        <>
                          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            {paginatedRoster.map(player => {
                              const myActiveOffer = myOffers.find(o => o.player_id === player.id && (o.status === 'pending' || o.status === 'countered'))
                              
                              return (
                                <div key={player.id} className="relative group p-1">
                                  <UltimateCard player={player} showPrice={player.is_on_sale} hideStats={true} />
                                  <div className="mt-3 px-1">
                                    {myActiveOffer ? (
                                      <Button 
                                        className="w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500 hover:text-white text-red-500 text-[8px] font-black uppercase tracking-widest h-8 transition-all duration-300 rounded-xl"
                                        onClick={() => cancelMyOffer(myActiveOffer.id)}
                                      >
                                        Anular Oferta
                                      </Button>
                                    ) : transferWindowStatus ? (
                                      <Button 
                                        className="w-full bg-[#141414]/80 backdrop-blur-md border border-white/5 hover:bg-[#00FF85] hover:text-[#0A0A0A] text-[#00FF85] text-[8px] font-black uppercase tracking-widest h-8 transition-all duration-300 rounded-xl"
                                        onClick={() => setSelectedPlayer(player)}
                                      >
                                        Ofertar
                                      </Button>
                                    ) : (
                                      <p className="text-[7px] font-bold text-red-400/50 text-center uppercase tracking-widest py-1">🔒 Cerrado</p>
                                    )}
                                    {player.is_one_club_man ? (
                                      <div className="w-full mt-2 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[7px] font-black text-amber-500 text-center uppercase tracking-[0.15em]">
                                        🛡️ One Club Man
                                      </div>
                                    ) : (
                                      <Button 
                                        className={`w-full mt-2 text-[8px] font-black uppercase tracking-widest h-8 transition-all duration-300 rounded-xl ${
                                          (!transferWindowStatus || myNegotiations.find(n => n.player_id === player.id && n.status === 'blocked'))
                                            ? 'bg-red-500/10 border border-red-500/20 text-red-500 cursor-not-allowed'
                                            : (currentUserClub?.budget || 0) < (player.release_clause || 700000)
                                            ? 'bg-red-500/5 border border-red-500/10 text-red-500/60 cursor-not-allowed opacity-40'
                                            : 'bg-white/5 border border-white/10 hover:bg-white/10 text-white'
                                        }`}
                                        disabled={!transferWindowStatus || !!myNegotiations.find(n => n.player_id === player.id && n.status === 'blocked') || (currentUserClub?.budget || 0) < (player.release_clause || 700000)}
                                        onClick={() => {
                                          setPlayerForClause(player)
                                          setIsClauseChatOpen(true)
                                        }}
                                      >
                                        {!transferWindowStatus ? '🔒 Cerrado' : myNegotiations.find(n => n.player_id === player.id && n.status === 'blocked') 
                                          ? '🚫 Bloqueado' 
                                          : (currentUserClub?.budget || 0) < (player.release_clause || 700000)
                                          ? 'Sin Fondos'
                                          : 'Cláusula'}
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* Roster Pagination Controls */}
                          {totalPages > 1 && (
                            <div className="flex items-center justify-between bg-[#141414] p-2 rounded-2xl border border-white/[0.03] mt-2">
                              <button 
                                onClick={() => setRosterPage(p => Math.max(0, p - 1))}
                                disabled={currentPage === 0}
                                className="p-3 bg-[#0A0A0A] rounded-xl border border-white/5 text-[#6A6C6E] hover:text-white disabled:opacity-20 transition-all active:scale-95"
                              >
                                <ArrowRight className="w-5 h-5 rotate-180" />
                              </button>
                              
                              <div className="flex flex-col items-center">
                                <span className="text-[11px] font-black text-[#00FF85] uppercase tracking-[0.2em]">Página {currentPage + 1} de {totalPages}</span>
                                <span className="text-[8px] text-[#A0A2A4] font-bold uppercase mt-0.5">{filteredRoster.length} jugadores</span>
                              </div>

                              <button 
                                onClick={() => setRosterPage(p => Math.min(totalPages - 1, p + 1))}
                                disabled={currentPage === totalPages - 1}
                                className="p-3 bg-[#0A0A0A] rounded-xl border border-white/5 text-[#6A6C6E] hover:text-white disabled:opacity-20 transition-all active:scale-95"
                              >
                                <ArrowRight className="w-5 h-5" />
                              </button>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FREE AGENTS TAB */}
          {activeTab === 'free-agents' && (
            <div className="space-y-6">
              <div className="text-center py-2">
                <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest">
                  Jugadores sin contrato disponibles para fichar gratis
                </p>
              </div>

              {freeAgents.length === 0 ? (
                <div className="py-20 text-center bg-[#141414] rounded-3xl border border-[#202020] border-dashed">
                  <UserPlus className="w-12 h-12 text-[#2D2D2D] mx-auto mb-4" />
                  <p className="text-[#6A6C6E] text-xs font-bold uppercase tracking-widest">No hay agentes libres</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {freeAgents.map(player => (
                    <div key={player.id} className="space-y-2">
                      <UltimateCard
                        player={player}
                        showContractInfo={true}
                      />
                      {transferWindowStatus && currentUserClub && player.club_id !== currentUserClub.id && (
                        myReleases.includes(player.id) ? (
                          <div className="w-full py-2.5 bg-red-500/5 border border-red-500/10 rounded-xl text-red-500/40 text-[9px] font-black uppercase tracking-widest text-center">
                            🚫 Bloqueado por Despido
                          </div>
                        ) : (
                          <button
                            onClick={() => setFreeAgentToSign(player)}
                            className="w-full py-2.5 bg-[#00FF85]/10 border border-[#00FF85]/30 rounded-xl text-[#00FF85] text-[10px] font-black uppercase tracking-widest hover:bg-[#00FF85] hover:text-[#0A0A0A] transition-all"
                          >
                            Fichar (Gratis*)
                          </button>
                        )
                      )}
                      {!transferWindowStatus && (
                        <p className="text-[7px] font-bold text-red-400/60 text-center uppercase tracking-widest">
                          Mercado cerrado
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'propose' && (
            <div className="space-y-6">
              {/* Form */}
              <div className="bg-[#141414]/60 backdrop-blur-xl rounded-2xl border border-[#202020]/50 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <FilePlus className="w-4 h-4 text-[#00FF85]" />
                  <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Proponer Jugador Nuevo</h3>
                </div>
                <p className="text-[9px] text-[#6A6C6E] font-bold uppercase tracking-widest leading-relaxed">
                  Envía la identidad de un jugador que aún no existe en la app. El admin definirá su contrato y lo aprobará o rechazará.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black">Nombre</label>
                    <Input value={reqName} onChange={(e) => setReqName(e.target.value)} placeholder="Ej. Lionel Messi" className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black">Posición</label>
                    <Select value={reqPosition} onValueChange={(v) => setReqPosition(v)}>
                      <SelectTrigger className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-xs font-bold uppercase tracking-widest"><SelectValue placeholder="SEL." /></SelectTrigger>
                      <SelectContent className="bg-[#141414] border-white/[0.08] rounded-xl">
                        {POSITIONS.map(p => <SelectItem key={p} value={p} className="text-xs font-bold uppercase tracking-widest text-white">{p}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black">Dorsal</label>
                    <Input type="number" inputMode="numeric" value={reqNumber} onChange={(e) => setReqNumber(e.target.value)} placeholder="00" className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-center" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black">Edad</label>
                    <Input type="number" inputMode="numeric" value={reqAge} onChange={(e) => setReqAge(e.target.value)} placeholder="00" className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white text-center" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[8px] text-[#6A6C6E] uppercase tracking-[0.2em] font-black">Nacionalidad</label>
                    <Input value={reqNationality} onChange={(e) => setReqNationality(e.target.value)} placeholder="Argentina" className="h-10 bg-[#0A0A0A] border-[#202020] rounded-xl text-white" />
                  </div>
                </div>

                <ImageUpload
                  label="Foto (opcional)"
                  value={reqPhoto}
                  onChange={(url) => setReqPhoto(url)}
                  onRemove={() => setReqPhoto('')}
                  folder="players"
                />

                <button
                  onClick={handleSubmitRequest}
                  disabled={submittingRequest || !reqName.trim() || !reqPosition}
                  className="w-full h-11 bg-[#00FF85] hover:bg-[#00e077] text-[#0A0A0A] rounded-xl font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(0,255,133,0.25)] transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submittingRequest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar Solicitud
                </button>
              </div>

              {/* My requests */}
              <div className="bg-[#141414]/40 backdrop-blur-xl rounded-2xl border border-[#202020]/50 overflow-hidden">
                <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.04] bg-[#0A0A0A]/40">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-[#00FF85]" />
                    <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Mis Solicitudes</h3>
                  </div>
                  <span className="text-[9px] text-[#6A6C6E] font-bold uppercase tracking-widest">{myRequests.length}</span>
                </div>
                <div className="p-4 space-y-2">
                  {myRequests.length === 0 ? (
                    <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest text-center py-10">Aún no enviaste solicitudes.</p>
                  ) : myRequests.map((r) => {
                    const tone = r.status === 'approved' ? 'emerald' : r.status === 'rejected' ? 'red' : 'amber'
                    const label = r.status === 'approved' ? 'Aprobada' : r.status === 'rejected' ? 'Rechazada' : 'Pendiente'
                    return (
                      <div key={r.id} className="bg-black/40 border border-white/[0.04] rounded-xl px-4 py-3 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-black border border-[#202020] overflow-hidden flex items-center justify-center shrink-0">
                          {r.photo_url
                            ? <img src={r.photo_url} className="w-full h-full object-cover" />
                            : <UserPlus className="w-4 h-4 text-[#2D2D2D]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-black text-white uppercase tracking-tight truncate">{r.name}</p>
                          <p className="text-[8px] text-[#6A6C6E] font-bold uppercase tracking-widest truncate">
                            {r.position}{r.number != null ? ` · #${r.number}` : ''}{r.nationality ? ` · ${r.nationality}` : ''}
                            {r.admin_notes ? ` · ${r.admin_notes}` : ''}
                          </p>
                        </div>
                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded shrink-0 ${
                          tone === 'emerald' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          tone === 'red' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
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
                  {(() => {
                    const totalPages = Math.ceil(history.length / itemsPerHistoryPage)
                    const currentPage = Math.min(historyPage, totalPages - 1)
                    const paginatedHistory = history.slice(currentPage * itemsPerHistoryPage, (currentPage + 1) * itemsPerHistoryPage)

                    return (
                      <>
                        <div className="space-y-4">
                          {paginatedHistory.map((item) => (
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

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between bg-[#141414] p-3 rounded-2xl border border-white/[0.03] mt-4">
                            <button 
                              onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                              disabled={currentPage === 0}
                              className="p-3 bg-[#0A0A0A] rounded-xl border border-white/5 text-[#6A6C6E] hover:text-white disabled:opacity-20 transition-all active:scale-95"
                            >
                              <ArrowRight className="w-5 h-5 rotate-180" />
                            </button>
                            
                            <div className="flex flex-col items-center">
                              <span className="text-[11px] font-black text-[#00FF85] uppercase tracking-[0.2em]">Página {currentPage + 1}</span>
                              <span className="text-[8px] text-[#A0A2A4] font-bold uppercase mt-0.5">{history.length} traspasos totales</span>
                            </div>

                            <button 
                              onClick={() => setHistoryPage(p => Math.min(totalPages - 1, p + 1))}
                              disabled={currentPage === totalPages - 1}
                              className="p-3 bg-[#0A0A0A] rounded-xl border border-white/5 text-[#6A6C6E] hover:text-white disabled:opacity-20 transition-all active:scale-95"
                            >
                              <ArrowRight className="w-5 h-5" />
                            </button>
                          </div>
                        )}
                      </>
                    )
                  })()}
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

      <ClauseChatDrawer 
        player={playerForClause}
        isOpen={isClauseChatOpen}
        onClose={() => {
          setIsClauseChatOpen(false)
          setPlayerForClause(null)
        }}
        buyerClubId={currentUserClub?.id || ''}
        onTransferComplete={() => {
          fetchInitialData()
        }}
      />

      {/* Free Agent Confirmation Dialog */}
      <AlertDialog open={!!freeAgentToSign} onOpenChange={(open) => !open && setFreeAgentToSign(null)}>
        <AlertDialogContent className="bg-[#0A0A0A] border-white/10 text-white rounded-[32px] sm:max-w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#00FF85]" />
              Confirmar Fichaje
            </AlertDialogTitle>
            <AlertDialogDescription asChild className="text-[#6A6C6E] text-[10px] font-bold uppercase tracking-wider leading-relaxed">
              <div>
                Estás a punto de fichar a <span className="text-white">{freeAgentToSign?.name}</span> como agente libre. No hay coste de traspaso, pero deberás aceptar las siguientes condiciones:
                
                <div className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="text-zinc-500">Salario Inicial:</span>
                    <span className="text-[#00FF85] font-black italic">${(freeAgentToSign?.salary || 0).toLocaleString()} (Prepago)</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/5 pb-2">
                    <span className="text-zinc-500">Contrato:</span>
                    <span className="text-white font-black italic">2 Temporadas</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Rol Inicial:</span>
                    <span className="text-white font-black italic uppercase">Rotación</span>
                  </div>
                </div>

                <p className="mt-4 text-zinc-500 px-1 text-center">
                  * El primer salario se descontará de tu presupuesto de inmediato ($${(freeAgentToSign?.salary || 0).toLocaleString()}).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6 gap-2">
            <AlertDialogCancel className="bg-transparent border-white/5 text-[#6A6C6E] hover:text-white hover:bg-white/5 rounded-2xl uppercase text-[10px] font-black h-12">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={(e) => {
                e.preventDefault()
                handleSignFreeAgent()
              }}
              disabled={signingFreeAgent || (currentUserClub?.budget || 0) < (freeAgentToSign?.salary || 0)}
              className={`flex-1 rounded-2xl uppercase text-[10px] font-black h-12 shadow-xl hover:scale-[1.02] transition-transform duration-300 ${(currentUserClub?.budget || 0) < (freeAgentToSign?.salary || 0) ? 'bg-red-500/20 text-red-500 grayscale' : 'bg-[#00FF85] text-black hover:bg-[#00CC6A]'}`}
            >
              {signingFreeAgent ? <Loader2 className="w-4 h-4 animate-spin" /> : 
               (currentUserClub?.budget || 0) < (freeAgentToSign?.salary || 0) ? 'Presupuesto Insuficiente' : 'Firmar Contrato'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
