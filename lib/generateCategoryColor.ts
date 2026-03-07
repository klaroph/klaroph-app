export function generateCategoryColor(category: string): string {
  let hash = 0

  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash)
  }

  const hue = Math.abs(hash) % 360
  const saturation = 65
  const lightness = 45

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`
}
