/**
 * Soft pastel category colors for KlaroPH V2 charts/lists.
 * Avoids highly saturated greens as the default brand feel.
 */
export function generateCategoryColor(category: string): string {
  let hash = 0

  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash)
  }

  // Bias hues toward blue / coral / lavender / peach bands
  const bands = [210, 200, 350, 25, 265, 45, 190, 320]
  const hue = bands[Math.abs(hash) % bands.length]
  const saturation = 48 + (Math.abs(hash) % 18)
  const lightness = 62 + (Math.abs(hash >> 3) % 10)

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}
