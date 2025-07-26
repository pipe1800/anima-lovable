/**
 * Formats numbers with K/M units for better readability
 * @param num - The number to format
 * @returns Formatted string (e.g., 1140 -> "1.1K", 2500000 -> "2.5M")
 */
export function formatNumberWithK(num: number): string {
  if (!num || num < 0) return '0';
  
  if (num >= 1000000) {
    const millions = num / 1000000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  
  if (num >= 1000) {
    const thousands = num / 1000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  
  return num.toString();
}
