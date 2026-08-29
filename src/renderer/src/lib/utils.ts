import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// cn = classNames 合并工具：把多个类名拼起来，冲突时后写的覆盖先写的（tailwind-merge 负责）
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
