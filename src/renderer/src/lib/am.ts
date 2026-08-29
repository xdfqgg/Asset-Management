// preload 桥 API 的访问函数。
// 用函数而不是「导入时捕获的常量」——测试里后 stub window.am 也能生效（延迟解析）。
export function am(): typeof window.am {
  return window.am
}
