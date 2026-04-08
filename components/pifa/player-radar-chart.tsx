'use client'

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts'

interface RadarData {
  subject: string
  value: number
  fullMark: number
}

interface PlayerRadarProps {
  data: RadarData[]
  size?: number | string
  color?: string
}

export function PlayerRadar({ data, size = 180, color = '#00FF85' }: PlayerRadarProps) {
  return (
    <div style={{ width: '100%', height: size }} className="flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid 
            stroke="#202020" 
            strokeWidth={1}
            radialLines={true}
          />
          <PolarAngleAxis 
            dataKey="subject" 
            tick={{ fill: '#6A6C6E', fontSize: 10, fontWeight: 700 }} 
          />
          <Radar
            name="Skills"
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.4}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
