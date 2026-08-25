<template>
  <div class="w-full h-full">
    <canvas ref="chartCanvas" class="w-full h-full"/>
  </div>
</template>

<script setup lang="ts">
import type { BalanceHistoryItem } from '~/types'

const props = defineProps<{
  data: BalanceHistoryItem[]
}>()

const chartCanvas = ref<HTMLCanvasElement>()
const _chart: unknown = null

// Simple line chart implementation without external dependencies
const drawChart = () => {
  if (!chartCanvas.value || !props.data.length) return

  const canvas = chartCanvas.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Set canvas size
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * window.devicePixelRatio
  canvas.height = rect.height * window.devicePixelRatio
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

  const width = rect.width
  const height = rect.height
  const padding = 40

  // Clear canvas
  ctx.clearRect(0, 0, width, height)

  // Get data values
  const values = props.data.map(item => item.jpy_value)
  const _dates = props.data.map(item => item.date)
  
  const maxValue = Math.max(...values, 0)
  const minValue = Math.min(...values, 0)
  const valueRange = maxValue - minValue || 1

  // Helper functions
  const getX = (index: number) => padding + (index / (props.data.length - 1)) * (width - 2 * padding)
  const getY = (value: number) => height - padding - ((value - minValue) / valueRange) * (height - 2 * padding)

  // Draw grid lines
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1

  // Horizontal grid lines
  for (let i = 0; i <= 4; i++) {
    const y = padding + (i / 4) * (height - 2 * padding)
    ctx.beginPath()
    ctx.moveTo(padding, y)
    ctx.lineTo(width - padding, y)
    ctx.stroke()
  }

  // Vertical grid lines (show every 5 days)
  for (let i = 0; i < props.data.length; i += 5) {
    const x = getX(i)
    ctx.beginPath()
    ctx.moveTo(x, padding)
    ctx.lineTo(x, height - padding)
    ctx.stroke()
  }

  // Draw area under curve
  if (props.data.length > 1) {
    const gradient = ctx.createLinearGradient(0, padding, 0, height - padding)
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.2)')
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0.05)')
    
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.moveTo(getX(0), height - padding)
    
    props.data.forEach((item, index) => {
      ctx.lineTo(getX(index), getY(item.jpy_value))
    })
    
    ctx.lineTo(getX(props.data.length - 1), height - padding)
    ctx.closePath()
    ctx.fill()
  }

  // Draw line
  ctx.strokeStyle = '#22c55e'
  ctx.lineWidth = 2
  ctx.beginPath()
  
  props.data.forEach((item, index) => {
    const x = getX(index)
    const y = getY(item.jpy_value)
    
    if (index === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  })
  
  ctx.stroke()

  // Draw points
  ctx.fillStyle = '#22c55e'
  props.data.forEach((item, index) => {
    const x = getX(index)
    const y = getY(item.jpy_value)
    
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, 2 * Math.PI)
    ctx.fill()
  })

  // Draw labels
  ctx.fillStyle = '#6b7280'
  ctx.font = '12px Inter, sans-serif'
  ctx.textAlign = 'center'

  // X-axis labels (dates, every 7 days)
  for (let i = 0; i < props.data.length; i += 7) {
    const x = getX(i)
    const date = new Date(props.data[i].date)
    const label = `${date.getMonth() + 1}/${date.getDate()}`
    ctx.fillText(label, x, height - 10)
  }

  // Y-axis labels（円表記、カンマ区切り）
  ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const value = minValue + (i / 4) * valueRange
    const y = height - padding - ((value - minValue) / valueRange) * (height - 2 * padding)
    const label = `¥${Math.round(value).toLocaleString('ja-JP')}`
    ctx.fillText(label, padding - 10, y + 4)
  }
}

// Redraw chart when data changes
watch(() => props.data, () => {
  nextTick(() => {
    drawChart()
  })
}, { deep: true })

// Draw chart on mount
onMounted(() => {
  nextTick(() => {
    drawChart()
  })
})

// Handle window resize
const handleResize = () => {
  nextTick(() => {
    drawChart()
  })
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>