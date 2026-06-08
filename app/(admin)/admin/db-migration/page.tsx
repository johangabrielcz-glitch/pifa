'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, Download, ImageIcon, Loader2, AlertTriangle, CheckCircle, ChevronLeft, Upload, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { MIGRATION_TABLES } from '@/lib/migration-tables'

interface ExportResponse {
  exported_at: string
  source_url: string | null
  table_counts: Record<string, number>
  image_urls: string[]
  tables: Record<string, any[]>
  errors?: { table: string; error: string }[]
}

export default function DbMigrationPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [lastExport, setLastExport] = useState<{ counts: Record<string, number>; images: number; ts: string } | null>(null)
  const [migratingImages, setMigratingImages] = useState(false)
  const [imageResult, setImageResult] = useState<{ migrated: number; unique: number; failed: { url: string; reason: string }[] } | null>(null)
  const [reimporting, setReimporting] = useState(false)
  const [reimportResult, setReimportResult] = useState<{ counts: Record<string, number>; errors: { table: string; error: string }[] } | null>(null)
  const reimportInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('pifa_auth_session') || '{}')
      if (s?.user?.role === 'admin') setAllowed(true)
      else router.replace('/admin')
    } catch { router.replace('/admin') }
  }, [router])

  async function handleExport() {
    setExporting(true)
    setLastExport(null)
    try {
      const res = await fetch('/api/admin/db-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-role': 'admin' },
        body: '{}',
      })
      const data = await res.json() as ExportResponse
      if (!res.ok) { toast.error((data as any)?.error || 'Error al exportar'); return }
      // Download as JSON
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const ts = data.exported_at.replace(/[:.]/g, '-')
      a.href = url
      a.download = `pifa-export-${ts}.json`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      setLastExport({ counts: data.table_counts, images: data.image_urls.length, ts: data.exported_at })
      const totalRows = Object.values(data.table_counts).reduce((s, n) => s + n, 0)
      toast.success(`Export listo · ${totalRows} filas · ${data.image_urls.length} imágenes`)
    } catch (e: any) {
      toast.error(e?.message || 'Error de red')
    } finally {
      setExporting(false)
    }
  }

  async function handleMigrateImages() {
    if (!confirm('Esto descargará cada imagen del proyecto VIEJO y la subirá a este proyecto. Asegúrate de que el proyecto viejo siga accesible. ¿Continuar?')) return
    setMigratingImages(true)
    setImageResult(null)
    try {
      const res = await fetch('/api/admin/storage-migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-role': 'admin' },
        body: '{}',
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.error || 'Error al migrar imágenes'); return }
      setImageResult(data)
      toast.success(`${data.migrated} imágenes migradas · ${data.unique} archivos únicos · ${data.failed?.length || 0} fallidas`)
    } catch (e: any) {
      toast.error(e?.message || 'Error de red')
    } finally {
      setMigratingImages(false)
    }
  }

  // Same chunking strategy as /admin-login: keep each request body well under
  // the ~4.5MB Vercel serverless limit (a full export is tens of MB).
  function chunkRowsBySize(rows: any[], maxBytes: number): any[][] {
    const chunks: any[][] = []
    let current: any[] = []
    let currentBytes = 2
    for (const row of rows) {
      const rowBytes = JSON.stringify(row).length + 1
      if (current.length > 0 && currentBytes + rowBytes > maxBytes) {
        chunks.push(current); current = []; currentBytes = 2
      }
      current.push(row); currentBytes += rowBytes
    }
    if (current.length > 0) chunks.push(current)
    return chunks
  }

  async function callImport(payload: any) {
    const res = await fetch('/api/admin/db-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-role': 'admin' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
    return data
  }

  async function handleReimport(file: File) {
    if (!confirm('Esto BORRARÁ todos los datos de este proyecto y los reemplazará con el contenido del archivo. ¿Continuar?')) {
      if (reimportInputRef.current) reimportInputRef.current.value = ''
      return
    }
    setReimporting(true)
    setReimportResult(null)
    try {
      const text = await file.text()
      let dump: any
      try { dump = JSON.parse(text) } catch { toast.error('JSON inválido'); return }
      if (!dump || typeof dump !== 'object' || !dump.tables || typeof dump.tables !== 'object') {
        toast.error('JSON inválido'); return
      }
      if (!Array.isArray(dump.tables.users) || !Array.isArray(dump.tables.clubs)) {
        toast.error('El export no contiene users/clubs'); return
      }

      // force-begin wipes and enables replica mode. Uses x-admin-role guard
      // since the destination is no longer "empty" (the admin is logged in).
      await callImport({ action: 'force-begin' })

      const counts: Record<string, number> = {}
      const errors: { table: string; error: string }[] = []
      const maxChunkBytes = 1_500_000

      for (const table of MIGRATION_TABLES) {
        const rows: any[] = (dump.tables[table] as any[]) || []
        let inserted = 0
        for (const chunk of chunkRowsBySize(rows, maxChunkBytes)) {
          const result = await callImport({ action: 'chunk', table, rows: chunk })
          if (!result.ok) {
            errors.push({ table, error: result.error || 'Error desconocido' })
            break
          }
          inserted += result.inserted || 0
        }
        counts[table] = inserted
      }

      await callImport({ action: 'end' })

      setReimportResult({ counts, errors })
      const total = Object.values(counts).reduce((s, n) => s + n, 0)
      if (errors.length) toast.error(`Reimportado con ${errors.length} errores · ${total} filas`)
      else toast.success(`Reimportado · ${total} filas`)
    } catch (e: any) {
      toast.error(e?.message || 'Error de red')
    } finally {
      setReimporting(false)
      if (reimportInputRef.current) reimportInputRef.current.value = ''
    }
  }

  if (!allowed) return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-[#FF3131]" /></div>

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="flex items-center gap-3 px-6 py-3.5">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-xl bg-[#141414] border border-[#202020] flex items-center justify-center text-[#6A6C6E] hover:text-white transition-all active:scale-95">
            <ChevronLeft className="w-4.5 h-4.5" />
          </button>
          <div>
            <h1 className="text-base font-black text-white uppercase tracking-tight">MIGRACIÓN <span className="text-[#FF3131]">DE PROYECTO</span></h1>
            <p className="text-[7px] text-[#2D2D2D] font-black uppercase tracking-[0.3em]">Exportar e importar entre proyectos Supabase</p>
          </div>
        </div>
      </header>

      <div className="px-6 py-6 space-y-5 pb-32 max-w-3xl mx-auto">
        {/* Instructions */}
        <div className="bg-[#141414]/50 backdrop-blur-xl rounded-[24px] border border-white/[0.04] p-5 space-y-2">
          <h2 className="text-[10px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
            <Database className="w-4 h-4 text-[#FF3131]" />
            Flujo de migración
          </h2>
          <ol className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest leading-relaxed list-decimal ml-5 space-y-1">
            <li>En este proyecto (origen), pulsa <span className="text-white">Exportar todo</span> y guarda el JSON.</li>
            <li>En el nuevo proyecto Supabase, pega <span className="text-white">scripts/schema.sql</span> en el SQL editor.</li>
            <li>Despliega la app apuntando al nuevo proyecto (cambia las env vars).</li>
            <li>En <span className="text-white">/admin-login</span> del nuevo proyecto sube el JSON.</li>
            <li>Logueado en el nuevo proyecto, vuelve aquí y pulsa <span className="text-white">Migrar imágenes</span>.</li>
          </ol>
        </div>

        {/* Export */}
        <section className="bg-[#141414]/40 backdrop-blur-xl rounded-[24px] border border-white/[0.04] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-[#00FF85]" />
            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Exportar base de datos</h3>
          </div>
          <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest leading-relaxed">
            Genera un JSON con TODAS las filas de TODAS las tablas. Para importarlo después en otro proyecto Supabase vacío.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full h-12 bg-[#00FF85] hover:bg-[#00e077] text-[#0A0A0A] rounded-xl font-black uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(0,255,133,0.25)] transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exportar todo
          </button>
          {lastExport && (
            <div className="bg-black/30 border border-white/[0.04] rounded-xl p-3 space-y-2">
              <p className="text-[9px] text-[#00FF85] font-black uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3" /> Exportado · {new Date(lastExport.ts).toLocaleString('es')}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {Object.entries(lastExport.counts).map(([t, n]) => (
                  <div key={t} className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest">
                    <span className="text-[#6A6C6E] truncate">{t}</span>
                    <span className="text-white tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
              <p className="text-[8px] text-amber-400/80 font-black uppercase tracking-widest flex items-center gap-1.5 pt-2 border-t border-white/[0.04]">
                <ImageIcon className="w-3 h-3" /> {lastExport.images} imágenes (se migran aparte en el destino)
              </p>
            </div>
          )}
        </section>

        {/* Re-import (wipe + restore) */}
        <section className="bg-[#141414]/40 backdrop-blur-xl rounded-[24px] border border-red-500/15 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-[#FF3131]" />
            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Borrar todo y reimportar</h3>
          </div>
          <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest leading-relaxed">
            Usa esto si la importación inicial quedó incompleta. Vacía TODAS las tablas y vuelve a cargar desde el JSON. La acción no se puede deshacer.
          </p>
          <p className="text-[9px] text-amber-400/80 font-bold uppercase tracking-widest flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> Tu sesión sigue activa porque el JSON contiene tu usuario admin. Si no, tendrás que volver a /admin-login.
          </p>
          <input
            ref={reimportInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReimport(f) }}
          />
          <button
            onClick={() => reimportInputRef.current?.click()}
            disabled={reimporting}
            className="w-full h-12 bg-[#FF3131]/10 hover:bg-[#FF3131] text-[#FF3131] hover:text-white border border-[#FF3131]/30 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {reimporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Borrar todo + reimportar JSON
          </button>
          {reimportResult && (
            <div className="bg-black/30 border border-white/[0.04] rounded-xl p-3 space-y-2">
              <p className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 ${reimportResult.errors.length ? 'text-amber-400' : 'text-[#00FF85]'}`}>
                <CheckCircle className="w-3 h-3" />
                {Object.values(reimportResult.counts).reduce((s, n) => s + n, 0)} filas · {reimportResult.errors.length} errores
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {Object.entries(reimportResult.counts).map(([t, n]) => (
                  <div key={t} className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest">
                    <span className="text-[#6A6C6E] truncate">{t}</span>
                    <span className="text-white tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
              {reimportResult.errors.length > 0 && (
                <details className="text-[9px] text-red-400 font-bold uppercase tracking-widest pt-2 border-t border-white/[0.04]">
                  <summary className="cursor-pointer">{reimportResult.errors.length} tablas con error</summary>
                  <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {reimportResult.errors.map((e, i) => (
                      <li key={i} className="text-[8px] text-red-400/80">
                        <span className="text-white">{e.table}</span> — {e.error}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>

        {/* Storage migration */}
        <section className="bg-[#141414]/40 backdrop-blur-xl rounded-[24px] border border-white/[0.04] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-amber-400" />
            <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Migrar imágenes</h3>
          </div>
          <p className="text-[10px] text-[#6A6C6E] font-bold uppercase tracking-widest leading-relaxed">
            Solo necesario en el proyecto DESTINO tras importar. Copia las imágenes del bucket viejo al nuevo y reescribe URLs.
            El proyecto viejo debe seguir accesible mientras corre.
          </p>
          <p className="text-[9px] text-amber-400/80 font-bold uppercase tracking-widest flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> Si estás en el proyecto origen, omite este paso.
          </p>
          <button
            onClick={handleMigrateImages}
            disabled={migratingImages}
            className="w-full h-12 bg-amber-400/10 hover:bg-amber-400 text-amber-300 hover:text-[#0A0A0A] border border-amber-400/20 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {migratingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            Migrar imágenes
          </button>
          {imageResult && (
            <div className="bg-black/30 border border-white/[0.04] rounded-xl p-3 space-y-2">
              <p className="text-[9px] text-emerald-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3" /> {imageResult.migrated} filas actualizadas · {imageResult.unique} archivos únicos
              </p>
              {imageResult.failed?.length > 0 && (
                <details className="text-[9px] text-red-400 font-bold uppercase tracking-widest">
                  <summary className="cursor-pointer">{imageResult.failed.length} fallidas</summary>
                  <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {imageResult.failed.map((f, i) => (
                      <li key={i} className="text-[8px] text-red-400/80 truncate">
                        {f.reason} — {f.url}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
