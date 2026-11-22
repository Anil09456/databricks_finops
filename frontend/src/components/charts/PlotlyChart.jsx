import { useState, useEffect } from 'react'
import Plotly from 'plotly.js-dist-min'
import createPlotlyComponent from 'react-plotly.js/factory'
const Plot = createPlotlyComponent(Plotly)

const DARK_LAYOUT = {
  paper_bgcolor: '#0d1220',
  plot_bgcolor:  '#0d1220',
  font:          { family: 'Inter, sans-serif', color: '#8892a4', size: 11 },
  margin:        { t: 20, r: 10, b: 40, l: 50 },
  legend:        { bgcolor: 'rgba(0,0,0,0)', font: { size: 10 } },
  xaxis: {
    gridcolor: '#1e2d42', zerolinecolor: '#1e2d42',
    tickfont: { size: 10 }, linecolor: '#1e2d42',
  },
  yaxis: {
    gridcolor: '#1e2d42', zerolinecolor: '#1e2d42',
    tickfont: { size: 10 }, linecolor: '#1e2d42',
  },
}

const LIGHT_LAYOUT = {
  paper_bgcolor: '#ffffff',
  plot_bgcolor:  '#ffffff',
  font:          { family: 'Inter, sans-serif', color: '#1e293b', size: 11 },
  margin:        { t: 20, r: 10, b: 40, l: 50 },
  legend:        { bgcolor: 'rgba(0,0,0,0)', font: { size: 10 } },
  xaxis: {
    gridcolor: '#cbd5e1', zerolinecolor: '#cbd5e1',
    tickfont: { size: 10 }, linecolor: '#cbd5e1',
  },
  yaxis: {
    gridcolor: '#cbd5e1', zerolinecolor: '#cbd5e1',
    tickfont: { size: 10 }, linecolor: '#cbd5e1',
  },
}

const CONFIG = {
  displayModeBar: true,
  modeBarButtonsToRemove: ['sendDataToCloud', 'lasso2d', 'select2d'],
  displaylogo: false,
  responsive: true,
}

export default function PlotlyChart({ data, layout = {}, style, id }) {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark')

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark'
      setTheme(currentTheme)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  const activeBaseLayout = theme === 'light' ? LIGHT_LAYOUT : DARK_LAYOUT

  const chartHeight = layout.height || (style && style.height) || 300

  const mergedLayout = {
    ...activeBaseLayout,
    height: typeof chartHeight === 'number' ? chartHeight : parseInt(chartHeight, 10) || 300,
    ...layout,
    xaxis: { ...activeBaseLayout.xaxis, ...(layout.xaxis || {}) },
    yaxis: { ...activeBaseLayout.yaxis, ...(layout.yaxis || {}) },
    font:  { ...activeBaseLayout.font,  ...(layout.font  || {}) },
  }

  const plotStyle = {
    width: '100%',
    height: typeof chartHeight === 'number' ? `${chartHeight}px` : chartHeight,
    ...style
  }

  return (
    <Plot
      data={data}
      layout={mergedLayout}
      config={CONFIG}
      style={plotStyle}
      divId={id}
      useResizeHandler
    />
  )
}
