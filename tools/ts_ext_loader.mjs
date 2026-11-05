// Node ESM 解析钩：把无扩展名的相对 import（Cocos 工程习惯）补成 .ts，
// 便于 `node --experimental-strip-types` 直接 import 真实逻辑层做模拟/单测。
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.(ts|js|mjs|cjs|json)$/.test(specifier)) {
    try {
      return await nextResolve(specifier + '.ts', context);
    } catch {
      // 回退到默认解析
    }
  }
  return nextResolve(specifier, context);
}
