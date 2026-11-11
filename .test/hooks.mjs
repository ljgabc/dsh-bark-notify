// Resolve hook: bare '@deepseek-ai/schemastery' → dsh installation copy.
export async function resolve(specifier, context, next) {
  if (specifier === '@deepseek-ai/schemastery') {
    return {
      url: 'file:///Users/lijg/.npm-global/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/schemastery/lib/index.mjs',
      shortCircuit: true,
    }
  }
  return next(specifier, context)
}
