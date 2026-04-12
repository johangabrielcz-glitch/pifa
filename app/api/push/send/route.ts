import { NextResponse } from 'next/server'

/**
 * API Route para servir de proxy entre el cliente y Expo.
 * Esto evita errores de CORS ya que la petición se hace desde el servidor.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { tokens, title, message, data } = body

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({ success: true, sentCount: 0 })
    }

    // Filtrar tokens válidos
    const uniqueTokens = [...new Set(tokens as string[])].filter(t => t.startsWith('ExponentPushToken'))
    
    if (uniqueTokens.length === 0) {
      return NextResponse.json({ success: true, sentCount: 0 })
    }

    const messages = uniqueTokens.map(token => ({
      to: token,
      sound: 'default',
      title,
      body: message,
      data,
      priority: 'high',
      channelId: 'default',
    }))

    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    const result = await expoResponse.json()
    
    return NextResponse.json({ 
      success: true, 
      sentCount: uniqueTokens.length, 
      expoResult: result 
    })

  } catch (error: any) {
    console.error('API Push Proxy Error:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Error interno al enviar push' 
    }, { status: 500 })
  }
}
